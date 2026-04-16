# =============================================================================
# scheduler.py
# =============================================================================
# Retry engine for Holezy tee time bookings.
#
# Public interface consumed by worker.py:
#
#   run_job(job: dict) → None
#       Entry point. Called by worker.py with the full job row from Supabase.
#       Delegates immediately to scrape_until_found().
#
#   scrape_until_found(booking_id: str) → None
#       Fetches fresh job data from Supabase, then drives up to MAX_ATTEMPTS
#       booking attempts. On each attempt:
#           1. Launch Playwright Chromium (headless=True, always)
#           2. Login → search_slots → if found: book_slot → update DB + notify
#           3. If no slots: sleep RETRY_SHORT_SECS (attempts 1-5) or
#              RETRY_LONG_SECS (attempts 6+), then try again
#       On success: status = 'booked', confirmation_code stored, email sent
#       On exhausted attempts: status = 'failed', failure email sent
#       Browser is always closed in a finally block.
#
# Supabase table expected: scheduled_jobs
#   Columns read:  id, status, golfer_email, golfer_name, chronogolf_email,
#                  chronogolf_password, course_name, course_url, booking_date,
#                  earliest_time, latest_time, player_count, max_price_per_player
#   Columns written: status, attempts, confirmation_code, last_error, updated_at
# =============================================================================

import asyncio
import os
import traceback
from datetime import datetime, timezone

from dotenv import load_dotenv, find_dotenv
from supabase import create_client

import booking
import notifications

load_dotenv(find_dotenv())


# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────

MAX_ATTEMPTS      = 20
RETRY_SHORT_SECS  = 30   # between attempts 1–5
RETRY_LONG_SECS   = 60   # between attempts 6–MAX_ATTEMPTS


# ─────────────────────────────────────────────────────────────────────────────
# SUPABASE CLIENT
# ─────────────────────────────────────────────────────────────────────────────

def _db():
    """Return a fresh Supabase client using service-role key."""
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _update_job(job_id: str, fields: dict) -> None:
    """Patch the scheduled_jobs row. Always stamps updated_at."""
    _db().table("scheduled_jobs").update(
        {**fields, "updated_at": _now()}
    ).eq("id", job_id).execute()


# ─────────────────────────────────────────────────────────────────────────────
# SENTINEL — distinguishes "no slots yet" from real errors
# ─────────────────────────────────────────────────────────────────────────────

class _NoAvailability(Exception):
    """Raised when search_slots returns an empty list (expected, not a bug)."""


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

async def run_job(job: dict) -> None:
    """
    Called by worker.py for each claimed scheduled_jobs row.

    Passes the job's ID to scrape_until_found so that function always
    reads the latest DB state (important for retry runs where a previous
    worker may have updated the row).
    """
    job_id = job["id"]
    print(
        f"[scheduler] run_job {job_id} — "
        f"{job.get('course_name')} on {job.get('booking_date')}"
    )
    try:
        await scrape_until_found(job_id)
    except Exception:
        # Guard against unexpected crashes outside the main retry loop.
        traceback.print_exc()
        try:
            _update_job(job_id, {
                "status":     "failed",
                "last_error": "Unexpected crash in run_job — see worker logs",
            })
        except Exception:
            traceback.print_exc()


# ─────────────────────────────────────────────────────────────────────────────
# RETRY LOOP
# ─────────────────────────────────────────────────────────────────────────────

async def scrape_until_found(booking_id: str) -> None:
    """
    Core booking retry engine.

    Fetches the full job record from Supabase, then loops up to MAX_ATTEMPTS
    times. A single Playwright browser is launched once per job and a fresh
    page is created for each attempt — this isolates state between retries
    without the overhead of restarting the browser.

    The browser is guaranteed to be closed in the outermost finally block.
    """
    # ── Fetch latest job data ─────────────────────────────────────────────
    db     = _db()
    result = db.table("scheduled_jobs").select("*").eq("id", booking_id).execute()
    rows   = result.data or []

    if not rows:
        print(f"[scheduler] Job {booking_id} not found in scheduled_jobs — aborting")
        return

    job = rows[0]

    # ── Extract booking parameters ────────────────────────────────────────
    job_id       = job["id"]
    course_url   = job["course_url"]
    course_name  = job.get("course_name", "your course")
    booking_date = job["booking_date"]       # "YYYY-MM-DD"
    player_count = job.get("player_count", 2)
    time_window  = {
        "earliest": str(job.get("earliest_time", "06:00"))[:5],   # "HH:MM"
        "latest":   str(job.get("latest_time",   "18:00"))[:5],
    }
    max_price    = job.get("max_price_per_player")   # float or None
    cg_email     = job["chronogolf_email"]
    cg_password  = job["chronogolf_password"]

    print(
        f"[scheduler] scrape_until_found job={job_id} "
        f"course={course_name} date={booking_date} "
        f"players={player_count} window={time_window}"
    )

    # ── Browser lifecycle: once per job ───────────────────────────────────
    from playwright.async_api import async_playwright

    browser = None
    pw_ctx  = None

    try:
        pw_ctx  = async_playwright()
        pw      = await pw_ctx.__aenter__()
        browser = await pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"],  # needed on Railway
        )

        # ── Attempt loop ──────────────────────────────────────────────────
        for attempt in range(1, MAX_ATTEMPTS + 1):
            print(f"[scheduler] Attempt {attempt}/{MAX_ATTEMPTS}")

            # Stamp attempt count immediately so the DB always reflects progress
            _update_job(job_id, {"attempts": attempt})

            page = await browser.new_page()
            try:
                # 1. Login
                await booking.login(page, cg_email, cg_password)

                # 2. Search
                slots = await booking.search_slots(
                    page, course_url, booking_date, player_count, time_window
                )

                # 3. Optional price filter
                if max_price is not None:
                    slots = [s for s in slots if s["green_fee"] <= max_price]

                if not slots:
                    raise _NoAvailability("No matching slots on this attempt")

                # 4. Book the earliest available slot
                best_slot    = slots[0]
                confirm_code = await booking.book_slot(page, best_slot)

                # 5. Update Supabase — BOOKED
                _update_job(job_id, {
                    "status":            "booked",
                    "confirmation_code": confirm_code,
                    "last_error":        None,
                })

                # 6. Notify golfer
                enriched = {
                    **job,
                    "confirmation_code": confirm_code,
                    "booked_slot":       best_slot,
                }
                await notifications.send_success(enriched)

                print(
                    f"[scheduler] SUCCESS job={job_id} "
                    f"confirmation={confirm_code}"
                )
                return   # done — exit retry loop and finally will close browser

            except _NoAvailability as e:
                # Not an error — tee times just aren't open yet
                print(f"[scheduler] No availability on attempt {attempt}: {e}")
                _update_job(job_id, {"last_error": f"No slots (attempt {attempt})"})

            except Exception as exc:
                # Real error — log, store, keep retrying
                err_msg = f"Attempt {attempt} error: {exc!s}"[:500]
                print(f"[scheduler] {err_msg}")
                traceback.print_exc()
                _update_job(job_id, {"last_error": err_msg})

            finally:
                # Always close the page; browser stays open for next attempt
                try:
                    await page.close()
                except Exception:
                    pass

            # ── Decide how long to wait before next attempt ───────────────
            if attempt >= MAX_ATTEMPTS:
                break

            wait = RETRY_SHORT_SECS if attempt <= 5 else RETRY_LONG_SECS
            print(f"[scheduler] Waiting {wait}s before attempt {attempt + 1}...")
            await asyncio.sleep(wait)

        # ── All attempts exhausted ────────────────────────────────────────
        print(f"[scheduler] FAILED — exhausted {MAX_ATTEMPTS} attempts for job {job_id}")
        _update_job(job_id, {"status": "failed"})
        await notifications.send_failure(job)

    except Exception:
        # Catch anything that escaped the attempt loop (e.g. browser launch fail)
        traceback.print_exc()
        try:
            _update_job(job_id, {
                "status":     "failed",
                "last_error": "Browser/setup error — see worker logs",
            })
            await notifications.send_failure(job)
        except Exception:
            traceback.print_exc()

    finally:
        # ── Guaranteed browser teardown ───────────────────────────────────
        if browser:
            try:
                await browser.close()
                print(f"[scheduler] Browser closed for job {job_id}")
            except Exception as e:
                print(f"[scheduler] Error closing browser: {e}")
        if pw_ctx:
            try:
                await pw_ctx.__aexit__(None, None, None)
            except Exception:
                pass
