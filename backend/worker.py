# =============================================================================
# worker.py
# =============================================================================
# Railway entry point for the Holezy booking worker.
#
# Responsibilities:
#   - Poll the Supabase `scheduled_jobs` table every 30 seconds
#   - Fetch rows where status = 'pending' AND fire_at <= now()
#   - Claim each job atomically (set status = 'running') BEFORE processing
#     so a second worker instance never double-fires the same job
#   - Dispatch claimed jobs to scheduler.run_job() as concurrent asyncio tasks
#   - Print "alive — HH:MM:SS" on every poll cycle for Railway log monitoring
#   - Wrap the entire poll loop in try/except with traceback output so a
#     transient error never silently kills the process
#
# Required environment variables (see .env.example):
#   SUPABASE_URL          — your Supabase project URL
#   SUPABASE_SERVICE_KEY  — service-role key (bypasses RLS)
#   RESEND_API_KEY        — for outbound emails via notifications.py
#   SENTRY_DSN            — optional, for error tracking
# =============================================================================

import asyncio
import os
import traceback
from datetime import datetime, timezone

from dotenv import load_dotenv, find_dotenv
from supabase import create_client

import scheduler  # noqa: E402 — loaded after env

load_dotenv(find_dotenv())


# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────

POLL_INTERVAL_SECS = 30
MAX_CONCURRENT_JOBS = 5   # max jobs dispatched per poll cycle


# ─────────────────────────────────────────────────────────────────────────────
# OPTIONAL: SENTRY ERROR TRACKING
# ─────────────────────────────────────────────────────────────────────────────

def _init_sentry() -> None:
    """Initialise Sentry if SENTRY_DSN is set. Silent no-op otherwise."""
    dsn = os.getenv("SENTRY_DSN")
    if not dsn:
        return
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=dsn,
            traces_sample_rate=0.0,   # no performance tracing — keep it cheap
        )
        print("[worker] Sentry initialised")
    except ImportError:
        print("[worker] sentry-sdk not installed — skipping Sentry init")
    except Exception as e:
        print(f"[worker] Sentry init failed (non-fatal): {e}")


# ─────────────────────────────────────────────────────────────────────────────
# SUPABASE HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _db():
    """Return a Supabase client using the service-role key."""
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _fetch_pending_jobs(db) -> list[dict]:
    """
    Return scheduled_jobs rows that are due and have not yet been claimed.
    Limit to MAX_CONCURRENT_JOBS to avoid runaway parallelism.
    """
    result = (
        db.table("scheduled_jobs")
        .select("*")
        .eq("status", "pending")
        .lte("fire_at", _now_iso())
        .limit(MAX_CONCURRENT_JOBS)
        .execute()
    )
    return result.data or []


def _claim_job(db, job_id: str) -> bool:
    """
    Atomically claim a job by flipping status 'pending' → 'running'.

    The .eq("status", "pending") guard means only one worker wins the race
    even when multiple workers are running. Returns True if we won.
    """
    result = (
        db.table("scheduled_jobs")
        .update({
            "status":     "running",
            "updated_at": _now_iso(),
        })
        .eq("id", job_id)
        .eq("status", "pending")   # only claim if still unclaimed
        .execute()
    )
    return bool(result.data)


# ─────────────────────────────────────────────────────────────────────────────
# POLL CYCLE
# ─────────────────────────────────────────────────────────────────────────────

async def _poll_once(db) -> None:
    """
    One poll cycle: fetch pending jobs, claim them, fire asyncio tasks.

    Jobs run concurrently via asyncio.gather so a slow booking attempt
    (20 retries × 60 s = ~20 min) doesn't block other pending jobs.
    """
    jobs = _fetch_pending_jobs(db)

    if not jobs:
        return   # nothing to do — heartbeat already printed by main loop

    print(f"[worker] {len(jobs)} job(s) due — claiming...")

    tasks: list[asyncio.Task] = []
    for job in jobs:
        claimed = _claim_job(db, job["id"])
        if not claimed:
            # Another worker beat us to it — skip
            print(f"[worker] Job {job['id']} already claimed — skipping")
            continue

        course  = job.get("course_name", "?")
        date_   = job.get("booking_date", "?")
        print(f"[worker] Claimed job {job['id']} ({course} on {date_})")

        # Create a top-level task so failures in one job don't cancel others
        task = asyncio.create_task(
            _run_job_safe(job),
            name=f"job-{job['id'][:8]}",
        )
        tasks.append(task)

    if tasks:
        # Wait for all dispatched jobs to complete (they run in parallel)
        await asyncio.gather(*tasks, return_exceptions=True)


async def _run_job_safe(job: dict) -> None:
    """
    Thin wrapper around scheduler.run_job that captures any uncaught exception
    so one broken job never kills the gather() batch.
    """
    try:
        await scheduler.run_job(job)
    except Exception:
        print(f"[worker] Uncaught exception in job {job.get('id')}:")
        traceback.print_exc()


# ─────────────────────────────────────────────────────────────────────────────
# MAIN LOOP
# ─────────────────────────────────────────────────────────────────────────────

async def main() -> None:
    _init_sentry()

    print("[worker] ═══════════════════════════════════════")
    print("[worker]   Holezy Booking Worker")
    print(f"[worker]   Poll interval : {POLL_INTERVAL_SECS}s")
    print(f"[worker]   Max concurrent: {MAX_CONCURRENT_JOBS} jobs")
    print("[worker] ═══════════════════════════════════════")

    db = _db()

    while True:
        # ── Heartbeat ─────────────────────────────────────────────────────
        ts = datetime.now(timezone.utc).strftime("%H:%M:%S")
        print(f"[worker] alive — {ts}")

        # ── Poll ──────────────────────────────────────────────────────────
        try:
            await _poll_once(db)
        except Exception:
            print("[worker] Error in poll cycle (continuing):")
            traceback.print_exc()

        # ── Wait ──────────────────────────────────────────────────────────
        await asyncio.sleep(POLL_INTERVAL_SECS)


if __name__ == "__main__":
    asyncio.run(main())
