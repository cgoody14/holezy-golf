-- Add booking_platform to scheduled_jobs so the worker dispatcher
-- knows which booking engine to use for each job.

ALTER TABLE public.scheduled_jobs
  ADD COLUMN IF NOT EXISTS booking_platform TEXT NOT NULL DEFAULT 'chronogolf'
    CHECK (booking_platform IN ('chronogolf','golfnow','teeoff','fore','supreme'));
