-- Update column names to match CSV headers exactly

-- Rename columns to match CSV headers with proper spacing and capitalization
ALTER TABLE public."Course_Database" RENAME COLUMN "facility_id" TO "Facility ID";
ALTER TABLE public."Course_Database" RENAME COLUMN "course_name" TO "Course Name";
ALTER TABLE public."Course_Database" RENAME COLUMN "booking_url" TO "Booking URL";
ALTER TABLE public."Course_Database" RENAME COLUMN "address" TO "Address";
ALTER TABLE public."Course_Database" RENAME COLUMN "address_link" TO "Address Link";
ALTER TABLE public."Course_Database" RENAME COLUMN "course_website" TO "Course Website";
ALTER TABLE public."Course_Database" RENAME COLUMN "phone" TO "Phone";
ALTER TABLE public."Course_Database" RENAME COLUMN "booking_window" TO "Booking Window";
ALTER TABLE public."Course_Database" RENAME COLUMN "tee_times_url" TO "Tee Times URL";
ALTER TABLE public."Course_Database" RENAME COLUMN "tee_time_booking" TO "Tee Time Booking";
ALTER TABLE public."Course_Database" RENAME COLUMN "source" TO "Source";

-- Update primary key constraint to use the new column name
ALTER TABLE public."Course_Database" DROP CONSTRAINT IF EXISTS "Course_Database_pkey";
ALTER TABLE public."Course_Database" ADD PRIMARY KEY ("Facility ID");