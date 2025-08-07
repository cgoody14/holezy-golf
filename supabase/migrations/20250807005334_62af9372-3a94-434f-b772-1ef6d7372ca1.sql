-- Fix function security by setting search_path
CREATE OR REPLACE FUNCTION public.handle_new_user_account()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public."Client_Accounts" (user_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

-- Add RLS policies for Client_Accounts table
CREATE POLICY "Users can view their own account" 
ON public."Client_Accounts" 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own account" 
ON public."Client_Accounts" 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Enable RLS on Client_Accounts
ALTER TABLE public."Client_Accounts" ENABLE ROW LEVEL SECURITY;