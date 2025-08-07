-- Add user profile fields and payment info to Client_Accounts
ALTER TABLE public."Client_Accounts" 
ADD COLUMN first_name TEXT,
ADD COLUMN last_name TEXT,
ADD COLUMN email TEXT,
ADD COLUMN phone TEXT,
ADD COLUMN stripe_customer_id TEXT,
ADD COLUMN default_payment_method_id TEXT;

-- Add payment info to Client_Bookings for storing payment details per booking
ALTER TABLE public."Client_Bookings"
ADD COLUMN stripe_payment_method_id TEXT,
ADD COLUMN payment_status TEXT DEFAULT 'pending',
ADD COLUMN amount_charged DECIMAL(10,2),
ADD COLUMN currency TEXT DEFAULT 'usd';

-- Update the handle_new_user_account function to include user profile data
CREATE OR REPLACE FUNCTION public.handle_new_user_account()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public."Client_Accounts" (user_id, email, first_name, last_name)
  VALUES (
    NEW.id, 
    NEW.email,
    NEW.raw_user_meta_data ->> 'first_name',
    NEW.raw_user_meta_data ->> 'last_name'
  );
  RETURN NEW;
END;
$$;

-- Create a trigger for the function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_account();