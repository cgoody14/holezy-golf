-- ============================================================
-- Migration: Immediate booking attempt on preference insert
--
-- Changes on_preference_inserted() to always schedule an
-- immediate attempt (fire_at = now + 1 minute) instead of
-- waiting for the calculated booking-window open time.
--
-- Retry cadence after no_availability is handled in the
-- Railway worker (scheduler.ts): retries at 7am EST daily.
-- ============================================================

CREATE OR REPLACE FUNCTION on_preference_inserted()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Always attempt immediately — the worker will retry at 7am EST
  -- each day if no availability is found.
  INSERT INTO scheduled_bookings (preference_id, course_id, fire_at)
  VALUES (NEW.id, NEW.course_id, now() + interval '1 minute');

  RETURN NEW;
END;
$$;
