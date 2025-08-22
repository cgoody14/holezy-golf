-- Allow users to insert custom courses into Course_Database
CREATE POLICY "Users can add custom courses" 
ON public."Course_Database" 
FOR INSERT 
WITH CHECK (source = 'user_added');