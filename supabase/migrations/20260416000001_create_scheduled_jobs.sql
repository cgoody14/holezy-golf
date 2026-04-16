-- Migration: create scheduled_jobs table
-- Used by the Python booking worker (backend/worker.py + scheduler.py)
-- to queue and track automated ChronoGolf tee time bookings.

CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  -- Identity
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link back to the originating preference (optional — may be NULL for
  -- jobs created directly without a tee_time_preferences row)
  booking_id              UUID        REFERENCES tee_time_preferences(id) ON DELETE SET NULL,

  -- Scheduling
  fire_at                 TIMESTAMPTZ NOT NULL,
  status                  TEXT        NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending','running','booked','failed')),
  attempts                INT         NOT NULL DEFAULT 0,
  result                  JSONB,

  -- Golfer contact
  golfer_email            TEXT        NOT NULL,
  golfer_name             TEXT,

  -- ChronoGolf credentials (stored per-job so creds rotate per request)
  chronogolf_email        TEXT        NOT NULL,
  chronogolf_password     TEXT        NOT NULL,

  -- Booking parameters
  course_name             TEXT        NOT NULL,
  course_url              TEXT        NOT NULL,   -- https://www.chronogolf.com/club/{id}
  booking_date            DATE        NOT NULL,
  earliest_time           TIME        NOT NULL,
  latest_time             TIME        NOT NULL,
  player_count            INT         NOT NULL DEFAULT 2,
  max_price_per_player    NUMERIC(6,2),

  -- Outcome
  confirmation_code       TEXT,
  last_error              TEXT,

  -- Audit
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fast lookup by the worker's poll query: WHERE status = 'pending' AND fire_at <= now()
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_pending
  ON public.scheduled_jobs (status, fire_at)
  WHERE status = 'pending';

-- Enable RLS (worker uses service-role key which bypasses RLS)
ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;
