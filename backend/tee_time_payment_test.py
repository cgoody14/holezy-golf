"""
tee_time_payment_test.py
========================
Integration tests for the tee time card hold flow.

Requires Stripe TEST mode keys and a running Supabase instance.
A real Client_Bookings row is inserted, used for the test, then cleaned up.

Run:
    cd backend
    python tee_time_payment_test.py
"""

import os
import sys
import uuid
import logging
from datetime import date

import stripe
from dotenv import load_dotenv, find_dotenv
from supabase import create_client

load_dotenv(find_dotenv())

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
log = logging.getLogger(__name__)

stripe.api_key = os.environ["STRIPE_SECRET_KEY"]

_supabase = create_client(
    os.environ["SUPABASE_URL"],
    os.environ["SUPABASE_SERVICE_KEY"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Test fixtures
# ─────────────────────────────────────────────────────────────────────────────

def _create_test_customer() -> str:
    """Create a Stripe test customer and attach pm_card_visa as default."""
    customer = stripe.Customer.create(
        email=f"test-{uuid.uuid4().hex[:8]}@holezy-test.invalid",
        name="Holezy Test Golfer",
    )
    pm = stripe.PaymentMethod.attach("pm_card_visa", customer=customer.id)
    stripe.Customer.modify(
        customer.id,
        invoice_settings={"default_payment_method": pm.id},
    )
    log.info("Created test customer %s with pm_card_visa", customer.id)
    return customer.id


def _create_test_booking_row(stripe_customer_id: str) -> str:
    """Insert a minimal Client_Bookings row; return its id."""
    result = _supabase.table("Client_Bookings").insert({
        "email":           f"test-{uuid.uuid4().hex[:8]}@holezy-test.invalid",
        "First":           "Holezy",
        "Last":            "Test",
        "preferred_course": "Test Golf Club",
        "booking_date":    str(date.today()),
        "number_of_players": 2,
        "booking_status":  "booked",
        "payment_status":  "authorized",
        "amount_charged":  10.00,
        "currency":        "usd",
        # tee_time fields start at their default ('none')
    }).select("id").single().execute()
    booking_id = str(result.data["id"])
    log.info("Inserted test booking row %s", booking_id)
    return booking_id


def _cleanup(stripe_customer_id: str, booking_id: str) -> None:
    stripe.Customer.delete(stripe_customer_id)
    _supabase.table("Client_Bookings").delete().eq("id", booking_id).execute()
    log.info("Cleaned up customer %s and booking %s", stripe_customer_id, booking_id)


# ─────────────────────────────────────────────────────────────────────────────
# Tests
# ─────────────────────────────────────────────────────────────────────────────

def test_authorize_and_capture() -> None:
    """Authorize $50.00 then capture the full amount."""
    from tee_time_payment import (
        authorize_tee_time_payment,
        capture_tee_time_payment,
        get_authorization_status,
    )

    customer_id = _create_test_customer()
    booking_id  = _create_test_booking_row(customer_id)

    try:
        # ── Authorize ────────────────────────────────────────────────────────
        intent = authorize_tee_time_payment(
            booking_id=booking_id,
            stripe_customer_id=customer_id,
            amount_cents=5000,  # $50.00
        )
        print(f"\n[authorize_and_capture] PI created: {intent.id}  status: {intent.status}")
        assert intent.status == "requires_capture", f"Expected requires_capture, got {intent.status}"

        status = get_authorization_status(booking_id)
        print(f"[authorize_and_capture] DB status after authorize: {status}")
        assert status["status"] == "authorized"
        assert status["payment_intent_id"] == intent.id
        assert status["authorized_amount_cents"] == 5000

        # ── Capture ──────────────────────────────────────────────────────────
        captured = capture_tee_time_payment(booking_id)
        print(f"[authorize_and_capture] PI captured: {captured.id}  status: {captured.status}")
        assert captured.status == "succeeded", f"Expected succeeded, got {captured.status}"

        status = get_authorization_status(booking_id)
        print(f"[authorize_and_capture] DB status after capture: {status}")
        assert status["status"] == "captured"
        assert status["captured_at"] is not None

        print("[authorize_and_capture] PASSED\n")

    finally:
        _cleanup(customer_id, booking_id)


def test_authorize_and_cancel() -> None:
    """Authorize $50.00 then cancel the hold (no charge)."""
    from tee_time_payment import (
        authorize_tee_time_payment,
        cancel_tee_time_authorization,
        get_authorization_status,
    )

    customer_id = _create_test_customer()
    booking_id  = _create_test_booking_row(customer_id)

    try:
        # ── Authorize ────────────────────────────────────────────────────────
        intent = authorize_tee_time_payment(
            booking_id=booking_id,
            stripe_customer_id=customer_id,
            amount_cents=5000,
        )
        print(f"\n[authorize_and_cancel] PI created: {intent.id}  status: {intent.status}")
        assert intent.status == "requires_capture"

        # ── Cancel ───────────────────────────────────────────────────────────
        cancelled = cancel_tee_time_authorization(booking_id)
        print(f"[authorize_and_cancel] PI cancelled: {cancelled.id}  status: {cancelled.status}")
        assert cancelled.status == "cancelled", f"Expected cancelled, got {cancelled.status}"

        status = get_authorization_status(booking_id)
        print(f"[authorize_and_cancel] DB status after cancel: {status}")
        assert status["status"] == "cancelled"
        assert status["cancelled_at"] is not None
        assert status["captured_at"] is None

        print("[authorize_and_cancel] PASSED\n")

    finally:
        _cleanup(customer_id, booking_id)


def test_partial_capture() -> None:
    """Authorize $50.00, then partially capture $30.00."""
    from tee_time_payment import (
        authorize_tee_time_payment,
        capture_tee_time_payment,
        get_authorization_status,
    )

    customer_id = _create_test_customer()
    booking_id  = _create_test_booking_row(customer_id)

    try:
        intent = authorize_tee_time_payment(
            booking_id=booking_id,
            stripe_customer_id=customer_id,
            amount_cents=5000,
        )
        captured = capture_tee_time_payment(booking_id, amount_to_capture_cents=3000)
        print(f"\n[partial_capture] Captured: {captured.id}  status: {captured.status}")
        assert captured.status == "succeeded"

        status = get_authorization_status(booking_id)
        assert status["status"] == "captured"
        print("[partial_capture] PASSED\n")

    finally:
        _cleanup(customer_id, booking_id)


# ─────────────────────────────────────────────────────────────────────────────
# Runner
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if "test" not in stripe.api_key:
        print("ERROR: STRIPE_SECRET_KEY does not look like a test key. Refusing to run.")
        sys.exit(1)

    print("=" * 60)
    print("Tee Time Payment — Integration Tests (Stripe test mode)")
    print("=" * 60)

    failures = []
    for test_fn in [test_authorize_and_capture, test_authorize_and_cancel, test_partial_capture]:
        try:
            test_fn()
        except Exception as exc:
            log.exception("FAILED: %s — %s", test_fn.__name__, exc)
            failures.append(test_fn.__name__)

    print("=" * 60)
    if failures:
        print(f"FAILED: {', '.join(failures)}")
        sys.exit(1)
    else:
        print("All tests passed.")
