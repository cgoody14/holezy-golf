-- Secure RLS for Client_Bookings: restrict read/update to booking owner
-- Ensure RLS is enabled
ALTER TABLE public."Client_Bookings" ENABLE ROW LEVEL SECURITY;

-- Drop permissive policies
DROP POLICY IF EXISTS "Users can view their own bookings" ON public."Client_Bookings";
DROP POLICY IF EXISTS "Users can update their own bookings" ON public."Client_Bookings";

-- Create secure SELECT policy for owners
CREATE POLICY "Users can view their own bookings"
ON public."Client_Bookings"
FOR SELECT
TO authenticated
USING (
  (email IS NOT NULL AND email = (auth.jwt() ->> 'email'))
  OR EXISTS (
    SELECT 1
    FROM public."Client_Accounts" ca
    WHERE ca.id = client_id
      AND ca.user_id = auth.uid()
  )
);

-- Create secure UPDATE policy for owners
CREATE POLICY "Users can update their own bookings"
ON public."Client_Bookings"
FOR UPDATE
TO authenticated
USING (
  (email IS NOT NULL AND email = (auth.jwt() ->> 'email'))
  OR EXISTS (
    SELECT 1
    FROM public."Client_Accounts" ca
    WHERE ca.id = client_id
      AND ca.user_id = auth.uid()
  )
)
WITH CHECK (
  (email IS NOT NULL AND email = (auth.jwt() ->> 'email'))
  OR EXISTS (
    SELECT 1
    FROM public."Client_Accounts" ca
    WHERE ca.id = client_id
      AND ca.user_id = auth.uid()
  )
);
