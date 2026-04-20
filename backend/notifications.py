# =============================================================================
# notifications.py
# =============================================================================
# Email notifications for the Holezy booking worker.
#
# Two async functions consumed by scheduler.py:
#
#   send_success(booking: dict) → None
#       Emails the golfer with course, tee time, confirmation code.
#
#   send_failure(booking: dict) → None
#       Emails the golfer explaining what happened and what to do next.
#
# Both functions are wrapped in try/except and will NEVER raise — if email
# delivery fails the worker continues normally. The error is printed to logs.
#
# Email delivery: Resend API (https://resend.com)
# Credentials:    RESEND_API_KEY from environment
# Sender address: bookings@holezy.com  (must be verified in Resend dashboard)
# =============================================================================

import os
import traceback
from datetime import datetime

from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

# Sender shown on all outgoing emails
_FROM_ADDRESS = "Holezy <bookings@holezy.com>"
_SUPPORT_EMAIL = "support@holezy.com"


# ─────────────────────────────────────────────────────────────────────────────
# PRIVATE HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _resend_client():
    """Return a configured Resend client. Raises if RESEND_API_KEY is missing."""
    import resend  # imported lazily so missing package never crashes the worker
    resend.api_key = os.environ["RESEND_API_KEY"]
    return resend


def _format_slot_time(start_time: str) -> str:
    """
    Convert an ISO datetime string to a human-readable display.
    e.g. "2026-05-15T08:30:00-05:00" → "8:30 AM on Thursday, May 15, 2026"
    Returns the raw string unchanged if parsing fails.
    """
    try:
        dt = datetime.fromisoformat(start_time)
        return dt.strftime("%-I:%M %p on %A, %B %-d, %Y")
    except (ValueError, TypeError):
        return start_time


def _golfer_name(booking: dict) -> str:
    return booking.get("golfer_name") or "Golfer"


def _send(client, to: str, subject: str, text: str) -> None:
    """Low-level send via Resend. Synchronous — acceptable for one-off sends."""
    client.Emails.send({
        "from":    _FROM_ADDRESS,
        "to":      [to],
        "subject": subject,
        "text":    text,
    })


# ─────────────────────────────────────────────────────────────────────────────
# SUCCESS EMAIL
# ─────────────────────────────────────────────────────────────────────────────

async def send_success(booking: dict) -> None:
    """
    Email the golfer confirming their tee time was booked.

    Expected booking keys:
        golfer_email, golfer_name, course_name, player_count,
        confirmation_code, booked_slot (dict with start_time, green_fee)

    Never raises — logs any failure instead.
    """
    try:
        client = _resend_client()

        slot         = booking.get("booked_slot") or {}
        start_time   = slot.get("start_time", "")
        green_fee    = slot.get("green_fee", 0)
        course_name  = booking.get("course_name", "your course")
        player_count = booking.get("player_count", 2)
        confirm_code = booking.get("confirmation_code", "N/A")
        name         = _golfer_name(booking)
        to_email     = booking["golfer_email"]

        time_display = _format_slot_time(start_time) if start_time else "TBD"

        # Total cost estimate (green fee × players)
        total = float(green_fee or 0) * int(player_count or 1)
        fee_line = (
            f"${float(green_fee):.2f}/player (${total:.2f} total)"
            if green_fee
            else "see your ChronoGolf confirmation"
        )

        body = f"""\
Hi {name},

Great news — Holezy successfully booked your tee time!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Course:       {course_name}
  Date & Time:  {time_display}
  Players:      {player_count}
  Green Fee:    {fee_line}
  Confirmation: {confirm_code}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Your tee time has been confirmed and charged to the payment method
on file in your ChronoGolf account.

You can view your reservation on ChronoGolf by logging in at
https://www.chronogolf.com

See you on the course!

— The Holezy Team
  {_SUPPORT_EMAIL}
"""

        _send(client, to_email, f"Tee Time Booked — {course_name}", body)
        print(f"[notifications] Success email sent to {to_email}")

    except Exception:
        print("[notifications] send_success failed (non-fatal):")
        traceback.print_exc()


# ─────────────────────────────────────────────────────────────────────────────
# FAILURE EMAIL
# ─────────────────────────────────────────────────────────────────────────────

async def send_failure(booking: dict) -> None:
    """
    Email the golfer that we could not book their requested tee time.

    Expected booking keys:
        golfer_email, golfer_name, course_name, booking_date,
        earliest_time, latest_time, player_count, last_error (optional)

    Never raises — logs any failure instead.
    """
    try:
        client = _resend_client()

        course_name   = booking.get("course_name", "the requested course")
        booking_date  = booking.get("booking_date", "your requested date")
        earliest      = booking.get("earliest_time", "")
        latest        = booking.get("latest_time", "")
        player_count  = booking.get("player_count", 2)
        last_error    = booking.get("last_error") or "No availability was found"
        name          = _golfer_name(booking)
        to_email      = booking["golfer_email"]

        time_range = (
            f"{earliest} – {latest}"
            if earliest and latest
            else "your requested window"
        )

        body = f"""\
Hi {name},

Unfortunately, Holezy was unable to secure a tee time for you after
exhausting all retry attempts.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Course:      {course_name}
  Date:        {booking_date}
  Time range:  {time_range}
  Players:     {player_count}
  Reason:      {last_error}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

What you can do now:

  1. Try booking directly at https://www.chronogolf.com
  2. Consider widening your preferred time window
  3. Submit a new request at holezy.com for a different date

We're sorry we couldn't lock this one down. If you think something
went wrong on our end, please reach out at {_SUPPORT_EMAIL}.

— The Holezy Team
  {_SUPPORT_EMAIL}
"""

        _send(client, to_email, f"Tee Time Request Failed — {course_name}", body)
        print(f"[notifications] Failure email sent to {to_email}")

    except Exception:
        print("[notifications] send_failure failed (non-fatal):")
        traceback.print_exc()
