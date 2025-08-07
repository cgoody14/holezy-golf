-- Add client_id column to Client_Bookings table to link bookings to clients
ALTER TABLE public.Client_Bookings ADD COLUMN client_id bigint REFERENCES public.Client_Accounts(id);

-- Add user_id column to Client_Accounts to link to auth users
ALTER TABLE public.Client_Accounts ADD COLUMN user_id uuid REFERENCES auth.users(id);

-- Create function to automatically create Client_Accounts record when user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user_account()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.Client_Accounts (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create Client_Accounts record on user signup
CREATE TRIGGER on_auth_user_created_account
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_account();