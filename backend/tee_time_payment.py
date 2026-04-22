"""
tee_time_payment.py
===================
Stripe authorize-and-capture flow for courses that charge Holezy's card at
booking time.  The customer's card is authorized (held) immediately after the
tee time is confirmed; the hold is captured once we know the course charged us,
or cancelled if they did not.

Environment variables required (loaded from .env by python-dotenv):
    STRIPE_SECRET_KEY
    SUPABASE_URL
    SUPABASE_SERVICE_KEY
"""

import logging
import os
from datetime import datetime, timezone

import stripe
from dotenv import load_dotenv, find_dotenv
from supabase import create_client, Client as SupabaseClient

load_dotenv(find_dotenv())

stripe.api_key = os.environ["STRIPE_SECRET_KEY"]

log = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Internal helpers
# ─────────────────────────────────────────────────────────────────────────────

def _db() -> SupabaseClient:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


def _now_utc() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fetch_booking(db: SupabaseClient, booking_id: str) -> dict:
    result = (
        db.table("Client_Bookings")
        .select(
            "id, tee_time_payment_intent_id, tee_time_authorized_amount_cents, "
            "tee_time_authorization_status, tee_time_captured_at, tee_time_cancelled_at"
        )
        .eq("id", booking_id)
        .single()
        .execute()
    )
    if not result.data:
        raise ValueError(f"Booking {booking_id!r} not found in Client_Bookings")
    return result.data


def _default_payment_method(stripe_customer_id: str) -> str:
    """Return the default payment method ID for a Stripe customer."""
    customer = stripe.Customer.retrieve(
        stripe_customer_id,
        expand=["invoice_settings.default_payment_method"],
    )
    pm = customer.invoice_settings.default_payment_method

    if pm is None:
        # Fall back to the first card on file
        pms = stripe.PaymentMethod.list(customer=stripe_customer_id, type="card")
        if not pms.data:
            raise ValueError(
                f"No payment method on file for Stripe customer {stripe_customer_id!r}"
            )
        pm = pms.data[0]

    return pm if isinstance(pm, str) else pm.id


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def authorize_tee_time_payment(
    booking_id: str,
    stripe_customer_id: str,
    amount_cents: int,
    currency: str = "usd",
) -> stripe.PaymentIntent:
    """
    Authorize (but do not capture) the customer's card for the tee time cost.

    Creates a manual-capture PaymentIntent using the customer's default payment
    method and records it in Client_Bookings.  Call capture_tee_time_payment()
    later once confirmed the course charged Holezy's card, or call
    cancel_tee_time_authorization() to release the hold.

    Raises:
        stripe.error.CardError          — card was declined
        stripe.error.InvalidRequestError — bad Stripe parameters
        stripe.error.StripeError        — other Stripe-side error
        ValueError                      — no payment method on file
    """
    try:
        pm_id = _default_payment_method(stripe_customer_id)
    except stripe.error.InvalidRequestError as exc:
        log.error(
            "[tee_time_payment] authorize: invalid Stripe customer %r — %s",
            stripe_customer_id, exc,
        )
        raise
    except stripe.error.StripeError as exc:
        log.error(
            "[tee_time_payment] authorize: error fetching customer %r — %s",
            stripe_customer_id, exc,
        )
        raise

    try:
        intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency=currency,
            customer=stripe_customer_id,
            payment_method=pm_id,
            payment_method_types=["card"],
            capture_method="manual",
            confirm=True,
            metadata={
                "booking_id": booking_id,
                "purpose":    "tee_time_hold",
            },
        )
    except stripe.error.CardError as exc:
        log.error(
            "[tee_time_payment] authorize: card declined for booking %r — %s",
            booking_id, exc.user_message,
        )
        raise
    except stripe.error.InvalidRequestError as exc:
        log.error(
            "[tee_time_payment] authorize: invalid request for booking %r — %s",
            booking_id, exc,
        )
        raise
    except stripe.error.StripeError as exc:
        log.error(
            "[tee_time_payment] authorize: Stripe error for booking %r — %s",
            booking_id, exc,
        )
        raise

    _db().table("Client_Bookings").update({
        "tee_time_payment_intent_id":      intent.id,
        "tee_time_authorized_amount_cents": amount_cents,
        "tee_time_authorization_status":   "authorized",
    }).eq("id", booking_id).execute()

    log.info(
        "[tee_time_payment] authorized %d %s — PI=%s booking=%r",
        amount_cents, currency.upper(), intent.id, booking_id,
    )
    return intent


def capture_tee_time_payment(
    booking_id: str,
    amount_to_capture_cents: int | None = None,
) -> stripe.PaymentIntent:
    """
    Capture a previously authorized tee time hold.

    Pass amount_to_capture_cents for a partial capture (e.g. when the course
    charged less than the authorized amount).  Omit to capture in full.

    Raises:
        ValueError                       — wrong status or booking not found
        stripe.error.InvalidRequestError — PI already captured/cancelled
        stripe.error.StripeError         — other Stripe-side error
    """
    db  = _db()
    row = _fetch_booking(db, booking_id)

    if row["tee_time_authorization_status"] != "authorized":
        raise ValueError(
            f"Cannot capture booking {booking_id!r}: "
            f"status is {row['tee_time_authorization_status']!r}, expected 'authorized'"
        )

    pi_id          = row["tee_time_payment_intent_id"]
    capture_kwargs = {}
    if amount_to_capture_cents is not None:
        capture_kwargs["amount_to_capture"] = amount_to_capture_cents

    try:
        intent = stripe.PaymentIntent.capture(pi_id, **capture_kwargs)
    except stripe.error.InvalidRequestError as exc:
        log.error(
            "[tee_time_payment] capture: invalid request for PI=%s booking=%r — %s",
            pi_id, booking_id, exc,
        )
        raise
    except stripe.error.StripeError as exc:
        log.error(
            "[tee_time_payment] capture: Stripe error for PI=%s booking=%r — %s",
            pi_id, booking_id, exc,
        )
        raise

    db.table("Client_Bookings").update({
        "tee_time_authorization_status": "captured",
        "tee_time_captured_at":          _now_utc(),
    }).eq("id", booking_id).execute()

    captured = amount_to_capture_cents if amount_to_capture_cents is not None else row["tee_time_authorized_amount_cents"]
    log.info(
        "[tee_time_payment] captured %s cents — PI=%s booking=%r",
        captured, pi_id, booking_id,
    )
    return intent


def cancel_tee_time_authorization(booking_id: str) -> stripe.PaymentIntent:
    """
    Cancel a previously authorized tee time hold (no charge to the customer).

    Use this when the course did not charge Holezy's card.

    Raises:
        ValueError                       — wrong status or booking not found
        stripe.error.InvalidRequestError — PI already captured/cancelled
        stripe.error.StripeError         — other Stripe-side error
    """
    db  = _db()
    row = _fetch_booking(db, booking_id)

    if row["tee_time_authorization_status"] != "authorized":
        raise ValueError(
            f"Cannot cancel booking {booking_id!r}: "
            f"status is {row['tee_time_authorization_status']!r}, expected 'authorized'"
        )

    pi_id = row["tee_time_payment_intent_id"]

    try:
        intent = stripe.PaymentIntent.cancel(pi_id)
    except stripe.error.InvalidRequestError as exc:
        log.error(
            "[tee_time_payment] cancel: invalid request for PI=%s booking=%r — %s",
            pi_id, booking_id, exc,
        )
        raise
    except stripe.error.StripeError as exc:
        log.error(
            "[tee_time_payment] cancel: Stripe error for PI=%s booking=%r — %s",
            pi_id, booking_id, exc,
        )
        raise

    db.table("Client_Bookings").update({
        "tee_time_authorization_status": "cancelled",
        "tee_time_cancelled_at":         _now_utc(),
    }).eq("id", booking_id).execute()

    log.info(
        "[tee_time_payment] cancelled hold — PI=%s booking=%r",
        pi_id, booking_id,
    )
    return intent


def get_authorization_status(booking_id: str) -> dict:
    """
    Return the current tee time payment state for a booking.

    Returns a dict with keys:
        status                 — 'none' | 'authorized' | 'captured' | 'cancelled'
        authorized_amount_cents
        payment_intent_id
        captured_at            — ISO-8601 UTC string or None
        cancelled_at           — ISO-8601 UTC string or None
    """
    row = _fetch_booking(_db(), booking_id)
    return {
        "status":                  row["tee_time_authorization_status"],
        "authorized_amount_cents": row["tee_time_authorized_amount_cents"],
        "payment_intent_id":       row["tee_time_payment_intent_id"],
        "captured_at":             row["tee_time_captured_at"],
        "cancelled_at":            row["tee_time_cancelled_at"],
    }


def handle_course_charge_unknown(booking_id: str) -> dict:
    """
    Call when it's unclear whether the course charged Holezy's card.

    Returns the current authorization status and logs a warning so the ops
    team knows to manually capture or cancel.
    """
    status = get_authorization_status(booking_id)
    log.warning(
        "[tee_time_payment] MANUAL REVIEW REQUIRED — booking=%r status=%r PI=%s. "
        "Run capture_tee_time_payment(%r) if the course charged Holezy's card, "
        "or cancel_tee_time_authorization(%r) if it did not.",
        booking_id,
        status["status"],
        status["payment_intent_id"],
        booking_id,
        booking_id,
    )
    return status
