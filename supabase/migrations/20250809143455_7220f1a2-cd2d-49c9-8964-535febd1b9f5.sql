-- Update foreign key for bookings to reference new accounts table
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'Client_Bookings'
      AND constraint_name = 'client_bookings_client_id_fkey'
  ) THEN
    ALTER TABLE public."Client_Bookings"
    DROP CONSTRAINT client_bookings_client_id_fkey;
  END IF;
END $$;

ALTER TABLE public."Client_Bookings"
ADD CONSTRAINT client_bookings_account_id_fkey
FOREIGN KEY (client_id)
REFERENCES public.accounts(id)
ON UPDATE CASCADE
ON DELETE SET NULL;

-- Helpful index
CREATE INDEX IF NOT EXISTS idx_client_bookings_client_id ON public."Client_Bookings"(client_id);