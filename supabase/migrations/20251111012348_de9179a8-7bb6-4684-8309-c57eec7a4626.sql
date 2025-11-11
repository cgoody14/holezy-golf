-- Drop the problematic trigger and function
DROP TRIGGER IF EXISTS on_booking_created ON public."Client_Bookings";
DROP FUNCTION IF EXISTS public.notify_admin_new_booking();

-- Enable pg_net extension for future use
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Recreate the function using the correct schema
CREATE OR REPLACE FUNCTION public.notify_admin_new_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_id bigint;
BEGIN
  -- Call the send-admin-alert edge function via pg_net
  SELECT extensions.http_post(
    url := 'https://azgnzhtqoyqlixfhlkyz.supabase.co/functions/v1/send-admin-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF6Z256aHRxb3lxbGl4Zmhsa3l6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQzNDkxNzEsImV4cCI6MjA2OTkyNTE3MX0.l3Wb6k1LoB0Qgtg8tsZI-rtYNqLvNK8OaxyoFToClDI'
    ),
    body := jsonb_build_object(
      'type', 'booking_made',
      'userEmail', NEW.email,
      'userName', NEW."First" || ' ' || NEW."Last",
      'bookingDetails', jsonb_build_object(
        'id', NEW.id::text,
        'course', NEW.preferred_course,
        'date', NEW.booking_date::text,
        'players', NEW.number_of_players,
        'totalPrice', NEW.total_price
      )
    )
  ) INTO request_id;
  
  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER on_booking_created
  AFTER INSERT ON public."Client_Bookings"
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_new_booking();