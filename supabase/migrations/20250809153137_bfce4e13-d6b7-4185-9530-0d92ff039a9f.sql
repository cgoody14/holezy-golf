-- Retry: add PK, username, unique indexes, and update function (skip identity change)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.Client_Accounts'::regclass AND contype = 'p'
  ) THEN
    ALTER TABLE public."Client_Accounts"
      ADD PRIMARY KEY (id);
  END IF;
END$$;

ALTER TABLE public."Client_Accounts" ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS client_accounts_email_unique_idx ON public."Client_Accounts" (lower(email));
CREATE UNIQUE INDEX IF NOT EXISTS client_accounts_username_unique_idx ON public."Client_Accounts" (lower(username));

CREATE OR REPLACE FUNCTION public.handle_new_user_account()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
BEGIN
  INSERT INTO public."Client_Accounts" (user_id, email, first_name, last_name, phone, username)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name',
    NEW.raw_user_meta_data ->> 'phone',
    NEW.raw_user_meta_data ->> 'username'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    phone = EXCLUDED.phone,
    username = COALESCE(EXCLUDED.username, public."Client_Accounts".username);
  RETURN NEW;
END;
$function$;