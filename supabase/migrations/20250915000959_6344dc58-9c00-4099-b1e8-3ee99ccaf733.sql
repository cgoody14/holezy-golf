-- Clean up Course_Database table to match the required headers
-- Headers: Facility ID,Course Name,Booking URL,Address,Address Link,Course Website,Phone,Booking Window,Tee Times URL,Tee Time Booking,Source

-- Drop the extra columns that aren't needed
ALTER TABLE public."Course_Database" 
DROP COLUMN IF EXISTS "num",
DROP COLUMN IF EXISTS "12_Key", 
DROP COLUMN IF EXISTS "ID_Key",
DROP COLUMN IF EXISTS "ida";

-- Handle NULL values in Facility ID with a simpler approach
UPDATE public."Course_Database" 
SET "Facility ID" = (
    SELECT COALESCE(MAX("Facility ID"), 0) + 1
    FROM public."Course_Database" AS sub
    WHERE sub."Facility ID" IS NOT NULL
) + (
    SELECT COUNT(*) 
    FROM public."Course_Database" AS counting 
    WHERE counting."Facility ID" IS NULL 
    AND counting.ctid <= public."Course_Database".ctid
)
WHERE "Facility ID" IS NULL;