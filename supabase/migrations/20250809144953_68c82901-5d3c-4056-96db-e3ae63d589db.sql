-- 1) Drop FK pointing to accounts if it exists
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'Client_Bookings'
      AND constraint_name = 'client_bookings_account_id_fkey'
  ) THEN
    ALTER TABLE public."Client_Bookings"
    DROP CONSTRAINT client_bookings_account_id_fkey;
  END IF;
END $$;

-- 2) Remap existing bookings.client_id to Client_Accounts.id using accounts -> Client_Accounts by user mapping (if accounts exists)
DO $$
BEGIN
  IF to_regclass('public.accounts') IS NOT NULL THEN
    UPDATE public."Client_Bookings" b
    SET client_id = ca.id
    FROM public.accounts a
    JOIN public."Client_Accounts" ca ON ca.user_id = a.user_uuid
    WHERE b.client_id = a.id;
  END IF;
END $$;

-- 3) Fallback remap by email when possible
UPDATE public."Client_Bookings" b
SET client_id = ca.id
FROM public."Client_Accounts" ca
WHERE b.email IS NOT NULL
  AND ca.email IS NOT NULL
  AND b.email = ca.email
  AND (b.client_id IS NULL OR b.client_id <> ca.id);

-- 4) Add FK from bookings to Client_Accounts
ALTER TABLE public."Client_Bookings"
ADD CONSTRAINT client_bookings_client_accounts_id_fkey
FOREIGN KEY (client_id)
REFERENCES public."Client_Accounts"(id)
ON UPDATE CASCADE
ON DELETE SET NULL;

-- 5) Helpful index
CREATE INDEX IF NOT EXISTS idx_client_bookings_client_id ON public."Client_Bookings"(client_id);

-- 6) Add missing INSERT policy on Client_Accounts (users can insert their own row)
DO $policy$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'Client_Accounts'
      AND policyname = 'Users can insert their own account'
  ) THEN
    CREATE POLICY "Users can insert their own account"
    ON public."Client_Accounts"
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;
END
$policy$;

-- 7) Drop the extra accounts table and the related helper function if present
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'handle_new_user_accounts'
  ) THEN
    DROP FUNCTION public.handle_new_user_accounts() CASCADE;
  END IF;

  IF to_regclass('public.accounts') IS NOT NULL THEN
    DROP TABLE public.accounts;
  END IF;
END $$;
