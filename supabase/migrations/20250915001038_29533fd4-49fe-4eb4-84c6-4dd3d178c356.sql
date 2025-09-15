-- Clean up Course_Database table to match the required headers
-- Headers: Facility ID,Course Name,Booking URL,Address,Address Link,Course Website,Phone,Booking Window,Tee Times URL,Tee Time Booking,Source

-- First, drop the extra columns that aren't needed
ALTER TABLE public."Course_Database" 
DROP COLUMN IF EXISTS "num",
DROP COLUMN IF EXISTS "12_Key", 
DROP COLUMN IF EXISTS "ID_Key",
DROP COLUMN IF EXISTS "ida";

-- Handle NULL values in Facility ID with a simple approach
DO $$
DECLARE
    max_id NUMERIC;
    counter INTEGER := 1;
BEGIN
    -- Get the maximum existing Facility ID
    SELECT COALESCE(MAX("Facility ID"), 0) INTO max_id 
    FROM public."Course_Database" 
    WHERE "Facility ID" IS NOT NULL;
    
    -- Update NULL values with sequential IDs starting from max_id + 1
    FOR counter IN 1..1000 LOOP
        UPDATE public."Course_Database" 
        SET "Facility ID" = max_id + counter
        WHERE "Facility ID" IS NULL 
        AND ctid = (
            SELECT ctid 
            FROM public."Course_Database" 
            WHERE "Facility ID" IS NULL 
            LIMIT 1
        );
        
        -- Exit loop if no more NULL values
        EXIT WHEN NOT FOUND;
    END LOOP;
END $$;