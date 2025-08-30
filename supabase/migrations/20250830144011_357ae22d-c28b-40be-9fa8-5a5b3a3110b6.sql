-- Add facility_id and online booking availability columns to Client_Bookings table
ALTER TABLE public."Client_Bookings" 
ADD COLUMN facility_id bigint,
ADD COLUMN has_online_booking text;