-- Tracks whether a course uses a custom adapter or the standard platform engine.
-- 'platform' (default) = use BOOKING_ENGINES dispatcher in scheduler.py
-- 'custom'             = use a CourseAdapter from backend/courses/adapters/
ALTER TABLE public."Course_Database"
  ADD COLUMN IF NOT EXISTS adapter_type TEXT NOT NULL DEFAULT 'platform'
    CHECK (adapter_type IN ('platform', 'custom'));
