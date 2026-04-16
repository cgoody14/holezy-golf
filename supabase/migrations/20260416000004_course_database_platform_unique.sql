-- Add unique constraint on (booking_platform, platform_course_id) so that
-- scrapers can upsert courses by platform without creating duplicates.
-- Also add an index for fast course lookup by platform in the booking flow.

ALTER TABLE public."Course_Database"
  ADD CONSTRAINT course_database_platform_course_unique
    UNIQUE (booking_platform, platform_course_id);

-- Backfill existing ChronoGolf rows: set platform fields from Facility ID + Booking URL
-- (safe to re-run — only updates rows that don't yet have platform_course_id)
UPDATE public."Course_Database"
SET
  booking_platform    = 'chronogolf',
  platform_course_id  = CAST("Facility ID" AS TEXT),
  platform_booking_url = COALESCE(
    NULLIF("Booking URL", ''),
    'https://www.chronogolf.com/club/' || CAST("Facility ID" AS TEXT)
  )
WHERE
  "Facility ID" IS NOT NULL
  AND (platform_course_id IS NULL OR platform_course_id = '');

-- Index for course selector lookup by name (already likely exists, safe to add)
CREATE INDEX IF NOT EXISTS idx_course_db_name
  ON public."Course_Database" ("Course Name");

-- Index for booking engine lookup by platform
CREATE INDEX IF NOT EXISTS idx_course_db_platform
  ON public."Course_Database" (booking_platform, platform_course_id);
