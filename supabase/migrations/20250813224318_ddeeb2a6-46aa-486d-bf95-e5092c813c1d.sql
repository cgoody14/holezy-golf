-- Fix security vulnerability: Restrict contact messages access to authenticated users only
-- Remove the overly permissive public read policy
DROP POLICY IF EXISTS "Contact messages are viewable" ON contact_messages;

-- Create a new restrictive policy that only allows authenticated users to view contact messages
-- This should be further restricted to admin users once an admin system is implemented
CREATE POLICY "Only authenticated users can view contact messages" 
ON contact_messages 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

-- Keep the existing insert policy as it allows public contact form submissions
-- Policy "Anyone can submit contact messages" remains unchanged