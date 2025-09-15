-- Clean up Course_Database table to match the required headers
-- Headers: Facility ID,Course Name,Booking URL,Address,Address Link,Course Website,Phone,Booking Window,Tee Times URL,Tee Time Booking,Source

-- First, drop the extra columns that aren't needed
ALTER TABLE public."Course_Database" 
DROP COLUMN IF EXISTS "num",
DROP COLUMN IF EXISTS "12_Key", 
DROP COLUMN IF EXISTS "ID_Key",
DROP COLUMN IF EXISTS "ida";

-- Handle any NULL values in Facility ID before ensuring it's primary key
DO $$
DECLARE
    max_facility_id NUMERIC;
    counter INTEGER := 1;
BEGIN
    -- Get the maximum existing Facility ID
    SELECT COALESCE(MAX("Facility ID"), 0) INTO max_facility_id 
    FROM public."Course_Database" 
    WHERE "Facility ID" IS NOT NULL;
    
    -- Update NULL values with unique sequential IDs
    FOR rec IN (
        SELECT ctid FROM public."Course_Database" 
        WHERE "Facility ID" IS NULL
    ) LOOP
        UPDATE public."Course_Database" 
        SET "Facility ID" = max_facility_id + counter 
        WHERE ctid = rec.ctid;
        
        counter := counter + 1;
    END LOOP;
END $$;

-- Ensure all required columns exist with proper data types
-- The table should now have exactly these columns:
-- Facility ID (primary key), Course Name, Booking URL, Address, Address Link, 
-- Course Website, Phone, Booking Window, Tee Times URL, Tee Time Booking, Source