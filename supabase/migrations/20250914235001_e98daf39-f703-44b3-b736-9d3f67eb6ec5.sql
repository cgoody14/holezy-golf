-- Ensure Facility ID serves as primary key with proper constraints

-- First, handle any NULL values in Facility ID by setting them to unique values
DO $$
DECLARE
    max_id bigint;
BEGIN
    -- Get the current maximum Facility ID
    SELECT COALESCE(MAX("Facility ID"), 0) INTO max_id FROM public."Course_Database" WHERE "Facility ID" IS NOT NULL;
    
    -- Update NULL values with incrementing IDs starting from max_id + 1
    UPDATE public."Course_Database" 
    SET "Facility ID" = max_id + row_number() OVER ()
    WHERE "Facility ID" IS NULL;
END $$;

-- Handle any duplicate Facility IDs by making them unique
WITH duplicates AS (
    SELECT "Facility ID", 
           ROW_NUMBER() OVER (PARTITION BY "Facility ID" ORDER BY "Course Name") as rn,
           (SELECT MAX("Facility ID") FROM public."Course_Database") as max_id
    FROM public."Course_Database"
    WHERE "Facility ID" IS NOT NULL
)
UPDATE public."Course_Database" 
SET "Facility ID" = duplicates.max_id + duplicates.rn
FROM duplicates 
WHERE public."Course_Database"."Facility ID" = duplicates."Facility ID" 
AND duplicates.rn > 1;

-- Make Facility ID NOT NULL
ALTER TABLE public."Course_Database" ALTER COLUMN "Facility ID" SET NOT NULL;

-- Drop existing primary key constraint if it exists
ALTER TABLE public."Course_Database" DROP CONSTRAINT IF EXISTS "Course_Database_pkey";

-- Add primary key constraint on Facility ID
ALTER TABLE public."Course_Database" ADD CONSTRAINT "Course_Database_pkey" PRIMARY KEY ("Facility ID");