-- Check current state and create primary key for Course_Database table

-- First, let's see if there are any NULL values in Facility ID
DO $$
DECLARE
    null_count INTEGER;
    duplicate_count INTEGER;
BEGIN
    -- Check for NULL values in Facility ID
    SELECT COUNT(*) INTO null_count 
    FROM public."Course_Database" 
    WHERE "Facility ID" IS NULL;
    
    -- Check for duplicate values in Facility ID
    SELECT COUNT(*) - COUNT(DISTINCT "Facility ID") INTO duplicate_count
    FROM public."Course_Database"
    WHERE "Facility ID" IS NOT NULL;
    
    -- Report findings
    RAISE NOTICE 'Found % NULL values in Facility ID', null_count;
    RAISE NOTICE 'Found % duplicate values in Facility ID', duplicate_count;
    
    -- Handle NULL values by assigning unique negative IDs
    IF null_count > 0 THEN
        WITH null_rows AS (
            SELECT ctid, ROW_NUMBER() OVER () as rn
            FROM public."Course_Database" 
            WHERE "Facility ID" IS NULL
        )
        UPDATE public."Course_Database" 
        SET "Facility ID" = -(nr.rn)
        FROM null_rows nr
        WHERE public."Course_Database".ctid = nr.ctid;
        
        RAISE NOTICE 'Updated % NULL values with negative IDs', null_count;
    END IF;
    
    -- Handle duplicates by adding incremental values
    IF duplicate_count > 0 THEN
        WITH duplicates AS (
            SELECT 
                ctid,
                "Facility ID",
                ROW_NUMBER() OVER (PARTITION BY "Facility ID" ORDER BY ctid) - 1 as dup_offset
            FROM public."Course_Database"
            WHERE "Facility ID" IN (
                SELECT "Facility ID" 
                FROM public."Course_Database" 
                GROUP BY "Facility ID" 
                HAVING COUNT(*) > 1
            )
        )
        UPDATE public."Course_Database" 
        SET "Facility ID" = d."Facility ID" + d.dup_offset * 1000000
        FROM duplicates d
        WHERE public."Course_Database".ctid = d.ctid AND d.dup_offset > 0;
        
        RAISE NOTICE 'Updated duplicate values by adding offsets';
    END IF;
END $$;

-- Now set Facility ID as primary key
ALTER TABLE public."Course_Database" 
ADD CONSTRAINT "Course_Database_pkey" PRIMARY KEY ("Facility ID");