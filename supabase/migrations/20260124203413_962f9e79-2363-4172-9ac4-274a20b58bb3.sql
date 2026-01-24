-- Fix critical security vulnerability: Users can assign themselves admin privileges
-- Drop the dangerous INSERT policy on user_roles
DROP POLICY IF EXISTS "Users can insert their own admin role" ON public.user_roles;

-- Fix critical security vulnerability: Restrict contact_messages SELECT to admins only
DROP POLICY IF EXISTS "Only authenticated users can view contact messages" ON public.contact_messages;
CREATE POLICY "Only admins can view contact messages" 
ON public.contact_messages 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Fix Client_Bookings: Ensure users can only view their own bookings
DROP POLICY IF EXISTS "Anyone can view bookings" ON public."Client_Bookings";
DROP POLICY IF EXISTS "Users can view their own bookings" ON public."Client_Bookings";
CREATE POLICY "Users can view their own bookings" 
ON public."Client_Bookings" 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Ensure Client_Accounts has proper user access restriction
DROP POLICY IF EXISTS "Users can view their own account" ON public."Client_Accounts";
CREATE POLICY "Users can view their own account" 
ON public."Client_Accounts" 
FOR SELECT 
USING (
  auth.uid() = user_id 
  OR public.has_role(auth.uid(), 'admin'::app_role)
);

-- Add policy for users to update their own account
DROP POLICY IF EXISTS "Users can update their own account" ON public."Client_Accounts";
CREATE POLICY "Users can update their own account" 
ON public."Client_Accounts" 
FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);