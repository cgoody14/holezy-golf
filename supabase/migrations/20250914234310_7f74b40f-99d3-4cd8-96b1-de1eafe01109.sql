-- Update Course_Database table structure to match new column headers
-- Handle existing duplicate facility columns and add missing columns

-- Drop unnecessary columns  
ALTER TABLE public."Course_Database" DROP COLUMN IF EXISTS "a";

-- Remove the old "Facility IDs" column since we already have facility_id
ALTER TABLE public."Course_Database" DROP COLUMN IF EXISTS "Facility IDs";

-- Add new columns that don't exist yet
ALTER TABLE public."Course_Database" ADD COLUMN IF NOT EXISTS "booking_url" text;
ALTER TABLE public."Course_Database" ADD COLUMN IF NOT EXISTS "address_link" text;
ALTER TABLE public."Course_Database" ADD COLUMN IF NOT EXISTS "course_website" text;
ALTER TABLE public."Course_Database" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE public."Course_Database" ADD COLUMN IF NOT EXISTS "booking_window" text;

-- Make facility_id NOT NULL and set as primary key if not already
UPDATE public."Course_Database" SET facility_id = COALESCE(facility_id, 1) WHERE facility_id IS NULL;
ALTER TABLE public."Course_Database" ALTER COLUMN facility_id SET NOT NULL;

-- Drop existing primary key constraint if exists and add new one
ALTER TABLE public."Course_Database" DROP CONSTRAINT IF EXISTS "Course_Database_pkey";
ALTER TABLE public."Course_Database" ADD PRIMARY KEY (facility_id);