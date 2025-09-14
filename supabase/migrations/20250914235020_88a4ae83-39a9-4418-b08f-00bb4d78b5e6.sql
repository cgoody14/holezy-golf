-- Set Facility ID as primary key with proper handling of NULL and duplicate values

-- First, let's see what we're working with and handle NULL values
UPDATE public."Course_Database" 
SET "Facility ID" = COALESCE("Facility ID", (SELECT COALESCE(MAX("Facility ID"), 0) + 1 FROM public."Course_Database" WHERE "Facility ID" IS NOT NULL))
WHERE "Facility ID" IS NULL;

-- For any remaining NULL values, set them to sequential values
DO $$
DECLARE
    rec RECORD;
    next_id bigint;
BEGIN
    SELECT COALESCE(MAX("Facility ID"), 0) + 1 INTO next_id FROM public."Course_Database";
    
    FOR rec IN SELECT ctid FROM public."Course_Database" WHERE "Facility ID" IS NULL LOOP
        UPDATE public."Course_Database" SET "Facility ID" = next_id WHERE ctid = rec.ctid;
        next_id := next_id + 1;
    END LOOP;
END $$;

-- Handle duplicates by updating them to unique values
DO $$
DECLARE
    rec RECORD;
    next_id bigint;
BEGIN
    SELECT COALESCE(MAX("Facility ID"), 0) + 1 INTO next_id FROM public."Course_Database";
    
    FOR rec IN 
        SELECT ctid, "Facility ID"
        FROM (
            SELECT ctid, "Facility ID", 
                   ROW_NUMBER() OVER (PARTITION BY "Facility ID" ORDER BY ctid) as rn
            FROM public."Course_Database"
        ) ranked
        WHERE rn > 1
    LOOP
        UPDATE public."Course_Database" SET "Facility ID" = next_id WHERE ctid = rec.ctid;
        next_id := next_id + 1;
    END LOOP;
END $$;

-- Now set the column as NOT NULL and add primary key
ALTER TABLE public."Course_Database" ALTER COLUMN "Facility ID" SET NOT NULL;

-- Drop existing constraints and add primary key
ALTER TABLE public."Course_Database" DROP CONSTRAINT IF EXISTS "Course_Database_pkey";
ALTER TABLE public."Course_Database" ADD CONSTRAINT "Course_Database_pkey" PRIMARY KEY ("Facility ID");