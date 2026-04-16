# =============================================================================
# test_connection.py
# =============================================================================
# One-off local sanity check — NOT deployed to Railway.
#
# Verifies:
#   1. Required env vars are present
#   2. Supabase connection works (service-role key is valid)
#   3. tee_time_preferences table exists and is readable
#   4. scheduled_jobs table exists and is readable
#      (if missing: prints the SQL you need to run to create it)
#
# Usage:
#   cd backend/
#   python test_connection.py
#
# Prerequisites:
#   pip install supabase python-dotenv
#   Copy .env.example → .env and fill in real values
# =============================================================================

import os
import sys
from datetime import datetime, timezone

from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

PASS = "  [PASS]"
FAIL = "  [FAIL]"
WARN = "  [WARN]"
INFO = "  [INFO]"

_all_passed = True


def ok(msg: str) -> None:
    print(f"{PASS} {msg}")


def fail(msg: str) -> None:
    global _all_passed
    _all_passed = False
    print(f"{FAIL} {msg}", file=sys.stderr)


def warn(msg: str) -> None:
    print(f"{WARN} {msg}")


def info(msg: str) -> None:
    print(f"{INFO} {msg}")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — ENV VARS
# ─────────────────────────────────────────────────────────────────────────────

def check_env() -> bool:
    print("\n── Step 1: Environment variables ──────────────────────────────")

    required = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY"]
    optional = ["RESEND_API_KEY", "SENTRY_DSN"]
    all_ok = True

    for key in required:
        val = os.getenv(key)
        if val and not val.startswith("your-") and not val.startswith("https://your"):
            ok(f"{key} is set ({val[:30]}...)" if len(val) > 30 else f"{key} is set")
        else:
            fail(f"{key} is missing or still set to placeholder value")
            all_ok = False

    for key in optional:
        val = os.getenv(key)
        if val:
            ok(f"{key} is set (optional)")
        else:
            warn(f"{key} not set (optional — worker will skip that feature)")

    return all_ok


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — SUPABASE CONNECTION
# ─────────────────────────────────────────────────────────────────────────────

def check_supabase_connection():
    print("\n── Step 2: Supabase connection ─────────────────────────────────")

    try:
        from supabase import create_client
    except ImportError:
        fail("supabase package not installed — run: pip install supabase")
        return None

    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")

    if not url or not key:
        fail("Cannot connect — missing SUPABASE_URL or SUPABASE_SERVICE_KEY")
        return None

    try:
        db = create_client(url, key)
        ok(f"Supabase client created for {url}")
        return db
    except Exception as e:
        fail(f"create_client() raised: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — tee_time_preferences TABLE
# ─────────────────────────────────────────────────────────────────────────────

def check_tee_time_preferences(db) -> None:
    print("\n── Step 3: tee_time_preferences table ──────────────────────────")

    try:
        result = (
            db.table("tee_time_preferences")
            .select("id, golfer_id, preferred_date, status")
            .limit(1)
            .execute()
        )
        rows = result.data or []

        if rows:
            row = rows[0]
            ok(f"Table exists — sample row:")
            info(f"  id           : {row.get('id')}")
            info(f"  golfer_id    : {row.get('golfer_id')}")
            info(f"  preferred_date: {row.get('preferred_date')}")
            info(f"  status       : {row.get('status')}")
        else:
            ok("Table exists and is reachable (no rows yet — that's fine)")

    except Exception as e:
        err = str(e)
        if "relation" in err and "does not exist" in err:
            warn(
                "tee_time_preferences table does not exist yet.\n"
                "       Run the SQL in: supabase/migrations/booking-system/001_booking_system_schema.sql"
            )
        else:
            fail(f"Unexpected error querying tee_time_preferences: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — scheduled_jobs TABLE
# ─────────────────────────────────────────────────────────────────────────────

SCHEDULED_JOBS_SQL = """
-- Run this in Supabase → SQL Editor to create the scheduled_jobs table:

CREATE TABLE public.scheduled_jobs (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  status                  TEXT        NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending','running','booked','failed')),
  fire_at                 TIMESTAMPTZ NOT NULL,
  golfer_email            TEXT        NOT NULL,
  golfer_name             TEXT,
  chronogolf_email        TEXT        NOT NULL,
  chronogolf_password     TEXT        NOT NULL,
  course_name             TEXT        NOT NULL,
  course_url              TEXT        NOT NULL,
  booking_date            DATE        NOT NULL,
  earliest_time           TIME        NOT NULL,
  latest_time             TIME        NOT NULL,
  player_count            INT         NOT NULL DEFAULT 2,
  max_price_per_player    NUMERIC(6,2),
  confirmation_code       TEXT,
  attempts                INT         NOT NULL DEFAULT 0,
  last_error              TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_scheduled_jobs_pending
  ON public.scheduled_jobs (status, fire_at)
  WHERE status = 'pending';

ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;
"""


def check_scheduled_jobs(db) -> None:
    print("\n── Step 4: scheduled_jobs table ────────────────────────────────")

    try:
        result = (
            db.table("scheduled_jobs")
            .select("id, status, fire_at, course_name, booking_date, golfer_email")
            .limit(1)
            .execute()
        )
        rows = result.data or []

        if rows:
            row = rows[0]
            ok(f"Table exists — sample row:")
            info(f"  id          : {row.get('id')}")
            info(f"  status      : {row.get('status')}")
            info(f"  fire_at     : {row.get('fire_at')}")
            info(f"  course_name : {row.get('course_name')}")
            info(f"  booking_date: {row.get('booking_date')}")
            info(f"  golfer_email: {row.get('golfer_email')}")
        else:
            ok("Table exists and is reachable (no rows yet — that's fine)")

    except Exception as e:
        err = str(e)
        if "relation" in err and "does not exist" in err:
            warn("scheduled_jobs table does not exist yet.")
            warn("Run the SQL below in Supabase → SQL Editor:")
            print()
            print(SCHEDULED_JOBS_SQL)
        else:
            fail(f"Unexpected error querying scheduled_jobs: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 60)
    print("  Holezy Backend — Connection Check")
    print(f"  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print("=" * 60)

    # Step 1 — env
    env_ok = check_env()
    if not env_ok:
        print("\n[FAIL] Env vars missing — fill in .env before continuing.\n")
        sys.exit(1)

    # Step 2 — connect
    db = check_supabase_connection()
    if db is None:
        print("\n[FAIL] Cannot connect to Supabase — check URL and service key.\n")
        sys.exit(1)

    # Steps 3 & 4 — tables
    check_tee_time_preferences(db)
    check_scheduled_jobs(db)

    # Summary
    print("\n" + "=" * 60)
    if _all_passed:
        print("  All checks PASSED — backend is ready.")
    else:
        print("  Some checks FAILED — see [FAIL] lines above.")
    print("=" * 60 + "\n")

    sys.exit(0 if _all_passed else 1)


if __name__ == "__main__":
    main()
