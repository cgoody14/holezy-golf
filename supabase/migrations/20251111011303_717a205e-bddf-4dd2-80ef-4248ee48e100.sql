-- Create a function to notify admin about new bookings
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
  SELECT net.http_post(
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

-- Create trigger to fire after booking insertion
DROP TRIGGER IF EXISTS on_booking_created ON public."Client_Bookings";

CREATE TRIGGER on_booking_created
  AFTER INSERT ON public."Client_Bookings"
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_admin_new_booking();