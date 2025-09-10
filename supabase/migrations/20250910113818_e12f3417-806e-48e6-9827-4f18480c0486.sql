-- Add user_id column to Client_Bookings table
ALTER TABLE public."Client_Bookings" 
ADD COLUMN user_id uuid;

-- Update existing records to populate user_id based on matching email with Client_Accounts
UPDATE public."Client_Bookings" 
SET user_id = ca.user_id
FROM public."Client_Accounts" ca
WHERE public."Client_Bookings".email = ca.email
AND public."Client_Bookings".user_id IS NULL;