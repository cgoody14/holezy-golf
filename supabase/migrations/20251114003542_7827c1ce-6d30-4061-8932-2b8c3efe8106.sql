-- Update the notify_admin_new_booking function to include phone, course address, and facility ID
CREATE OR REPLACE FUNCTION public.notify_admin_new_booking()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  request_id bigint;
  course_address text;
  facility_id numeric;
BEGIN
  -- Get course address and facility ID from Course_Database
  SELECT "Address", "Facility ID"
  INTO course_address, facility_id
  FROM "Course_Database"
  WHERE "Course Name" = NEW.preferred_course
  LIMIT 1;

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
      'userPhone', NEW.phone,
      'bookingDetails', jsonb_build_object(
        'id', NEW.id::text,
        'course', NEW.preferred_course,
        'courseAddress', course_address,
        'facilityId', facility_id::text,
        'date', NEW.booking_date::text,
        'players', NEW.number_of_players,
        'totalPrice', NEW.total_price
      )
    )
  ) INTO request_id;
  
  RETURN NEW;
END;
$function$;