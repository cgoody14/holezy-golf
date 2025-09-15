-- Clean up Course_Database table to match the required headers
-- Headers: Facility ID,Course Name,Booking URL,Address,Address Link,Course Website,Phone,Booking Window,Tee Times URL,Tee Time Booking,Source

-- First, drop the extra columns that aren't needed
ALTER TABLE public."Course_Database" 
DROP COLUMN IF EXISTS "num",
DROP COLUMN IF EXISTS "12_Key", 
DROP COLUMN IF EXISTS "ID_Key",
DROP COLUMN IF EXISTS "ida";

-- Ensure all required columns exist with proper data types
-- Note: Facility ID should already be the primary key from previous setup

-- Add any missing columns if they don't exist
DO $$
BEGIN
    -- Check and add columns if they don't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Course_Database' 
        AND column_name = 'Facility ID'
    ) THEN
        ALTER TABLE public."Course_Database" ADD COLUMN "Facility ID" NUMERIC NOT NULL;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Course_Database' 
        AND column_name = 'Course Name'
    ) THEN
        ALTER TABLE public."Course_Database" ADD COLUMN "Course Name" TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Course_Database' 
        AND column_name = 'Booking URL'
    ) THEN
        ALTER TABLE public."Course_Database" ADD COLUMN "Booking URL" TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Course_Database' 
        AND column_name = 'Address'
    ) THEN
        ALTER TABLE public."Course_Database" ADD COLUMN "Address" TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Course_Database' 
        AND column_name = 'Address Link'
    ) THEN
        ALTER TABLE public."Course_Database" ADD COLUMN "Address Link" TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Course_Database' 
        AND column_name = 'Course Website'
    ) THEN
        ALTER TABLE public."Course_Database" ADD COLUMN "Course Website" TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Course_Database' 
        AND column_name = 'Phone'
    ) THEN
        ALTER TABLE public."Course_Database" ADD COLUMN "Phone" TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Course_Database' 
        AND column_name = 'Booking Window'
    ) THEN
        ALTER TABLE public."Course_Database" ADD COLUMN "Booking Window" TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Course_Database' 
        AND column_name = 'Tee Times URL'
    ) THEN
        ALTER TABLE public."Course_Database" ADD COLUMN "Tee Times URL" TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Course_Database' 
        AND column_name = 'Tee Time Booking'
    ) THEN
        ALTER TABLE public."Course_Database" ADD COLUMN "Tee Time Booking" TEXT;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Course_Database' 
        AND column_name = 'Source'
    ) THEN
        ALTER TABLE public."Course_Database" ADD COLUMN "Source" TEXT;
    END IF;
END $$;

-- Ensure Facility ID is NOT NULL (required for primary key)
UPDATE public."Course_Database" 
SET "Facility ID" = COALESCE("Facility ID", ROW_NUMBER() OVER ()) 
WHERE "Facility ID" IS NULL;