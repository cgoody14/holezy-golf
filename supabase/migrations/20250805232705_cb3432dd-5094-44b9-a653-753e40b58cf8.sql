-- Add missing columns to Client_Bookings table for complete booking functionality
ALTER TABLE public."Client_Bookings" 
ADD COLUMN email text,
ADD COLUMN phone text,
ADD COLUMN booking_date date,
ADD COLUMN earliest_time time,
ADD COLUMN latest_time time,
ADD COLUMN number_of_players integer CHECK (number_of_players >= 1 AND number_of_players <= 4),
ADD COLUMN preferred_course text,
ADD COLUMN booking_status text DEFAULT 'pending',
ADD COLUMN total_price decimal(10,2),
ADD COLUMN promo_code text,
ADD COLUMN stripe_payment_intent_id text,
ADD COLUMN updated_at timestamp with time zone DEFAULT now();

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_client_bookings_updated_at
    BEFORE UPDATE ON public."Client_Bookings"
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- Add RLS policies for user access
CREATE POLICY "Users can view their own bookings" 
ON public."Client_Bookings" 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can create bookings" 
ON public."Client_Bookings" 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update their own bookings" 
ON public."Client_Bookings" 
FOR UPDATE 
USING (true);

-- Create index for better performance
CREATE INDEX idx_client_bookings_email ON public."Client_Bookings"(email);
CREATE INDEX idx_client_bookings_date ON public."Client_Bookings"(booking_date);