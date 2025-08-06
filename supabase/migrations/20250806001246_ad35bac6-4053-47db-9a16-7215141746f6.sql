-- Add cancelled column and cancelled_at timestamp to Client_Bookings table
ALTER TABLE public."Client_Bookings" 
ADD COLUMN cancelled BOOLEAN DEFAULT FALSE,
ADD COLUMN cancelled_at TIMESTAMP WITH TIME ZONE;