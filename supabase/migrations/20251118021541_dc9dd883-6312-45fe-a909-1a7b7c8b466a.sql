-- Allow authenticated users to insert their own admin role
-- This is needed for the admin setup page
CREATE POLICY "Users can insert their own admin role"
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());