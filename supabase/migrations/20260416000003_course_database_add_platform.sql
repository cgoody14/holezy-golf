-- Add platform tracking columns to Course_Database so each course
-- row can declare its booking platform and carry the platform-specific
-- ID/URL that the booking engine needs.

ALTER TABLE public."Course_Database"
  ADD COLUMN IF NOT EXISTS booking_platform    TEXT DEFAULT 'chronogolf',
  ADD COLUMN IF NOT EXISTS platform_course_id  TEXT,   -- e.g. "1482" for ChronoGolf, GolfNow facility ID
  ADD COLUMN IF NOT EXISTS platform_booking_url TEXT;  -- deep link to the course booking page
