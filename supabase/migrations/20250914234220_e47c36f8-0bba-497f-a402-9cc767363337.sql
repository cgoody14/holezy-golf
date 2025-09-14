-- Update Course_Database table structure to match new column headers

-- Drop unnecessary columns
ALTER TABLE public."Course_Database" DROP COLUMN IF EXISTS "a";

-- Rename existing columns to match new headers
ALTER TABLE public."Course_Database" RENAME COLUMN "Facility IDs" TO "facility_id_old";
ALTER TABLE public."Course_Database" RENAME COLUMN "course_name" TO "course_name_temp";
ALTER TABLE public."Course_Database" RENAME COLUMN "address" TO "address_temp";
ALTER TABLE public."Course_Database" RENAME COLUMN "tee_times_url" TO "tee_times_url_temp";
ALTER TABLE public."Course_Database" RENAME COLUMN "tee_time_booking" TO "tee_time_booking_temp";
ALTER TABLE public."Course_Database" RENAME COLUMN "source" TO "source_temp";

-- Add new columns with proper names
ALTER TABLE public."Course_Database" ADD COLUMN "facility_id" bigint;
ALTER TABLE public."Course_Database" ADD COLUMN "course_name" text;
ALTER TABLE public."Course_Database" ADD COLUMN "booking_url" text;
ALTER TABLE public."Course_Database" ADD COLUMN "address" text;
ALTER TABLE public."Course_Database" ADD COLUMN "address_link" text;
ALTER TABLE public."Course_Database" ADD COLUMN "course_website" text;
ALTER TABLE public."Course_Database" ADD COLUMN "phone" text;
ALTER TABLE public."Course_Database" ADD COLUMN "booking_window" text;
ALTER TABLE public."Course_Database" ADD COLUMN "tee_times_url" text;
ALTER TABLE public."Course_Database" ADD COLUMN "tee_time_booking" text;
ALTER TABLE public."Course_Database" ADD COLUMN "source" text;

-- Copy data from old columns to new columns
UPDATE public."Course_Database" SET 
  "facility_id" = COALESCE("facility_id", "facility_id_old"::bigint),
  "course_name" = "course_name_temp",
  "address" = "address_temp",
  "tee_times_url" = "tee_times_url_temp",
  "tee_time_booking" = "tee_time_booking_temp",
  "source" = "source_temp";

-- Drop old columns
ALTER TABLE public."Course_Database" DROP COLUMN "facility_id_old";
ALTER TABLE public."Course_Database" DROP COLUMN "course_name_temp";
ALTER TABLE public."Course_Database" DROP COLUMN "address_temp";
ALTER TABLE public."Course_Database" DROP COLUMN "tee_times_url_temp";
ALTER TABLE public."Course_Database" DROP COLUMN "tee_time_booking_temp";
ALTER TABLE public."Course_Database" DROP COLUMN "source_temp";

-- Set facility_id as primary key if not already set
ALTER TABLE public."Course_Database" DROP CONSTRAINT IF EXISTS "Course_Database_pkey";
ALTER TABLE public."Course_Database" ADD PRIMARY KEY ("facility_id");