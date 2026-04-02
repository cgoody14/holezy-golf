import os
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from dotenv import load_dotenv
from supabase import create_client
import schedule
import sys
import re

# Load environment variables
load_dotenv()

# Initialize Supabase
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase = create_client(supabase_url, supabase_key)

EST = ZoneInfo("America/New_York")


def get_course_info(facility_id):
    """Get course information from Course_Database"""
    try:
        response = supabase.table("Course_Database").select("*").eq("Facility ID", facility_id).execute()
        if response.data and len(response.data) > 0:
            return response.data[0]
        return None
    except Exception as e:
        print(f"Error fetching course info: {e}")
        return None


def get_next_7am_est() -> datetime:
    """Return the next 7:00 AM EST as a timezone-aware datetime.
    Returns today at 7am EST if before 7am, otherwise tomorrow at 7am EST.
    """
    now_est = datetime.now(EST)
    target = now_est.replace(hour=7, minute=0, second=0, microsecond=0)
    if now_est >= target:
        target += timedelta(days=1)
    return target


def check_and_run_bookings():
    """Attempt all pending bookings immediately. No booking window required."""
    try:
        response = supabase.table("Client_Bookings").select("*").eq("booking_status", "pending").execute()
        bookings = response.data

        if not bookings:
            print("No pending bookings found")
            return

        for booking in bookings:
            booking_id = booking.get("id")
            facility_id = booking.get("facility_id")
            booking_date = booking.get("booking_date")

            if not facility_id or not booking_date:
                print(f"Booking {booking_id} missing facility_id or booking_date")
                continue

            course_info = get_course_info(facility_id)
            if not course_info:
                print(f"No course info found for facility_id: {facility_id}")
                continue

            print(f"⏰ Attempting booking {booking_id} for {course_info.get('Course Name')} immediately")
            execute_booking(booking, course_info)

    except Exception as e:
        print(f"❌ Error checking bookings: {e}")


def check_retry_bookings():
    """Attempt bookings whose 7am EST retry window is now due."""
    try:
        now = datetime.now().isoformat()
        response = (
            supabase.table("Client_Bookings")
            .select("*")
            .eq("booking_status", "pending")
            .lte("next_retry_at", now)
            .execute()
        )
        bookings = response.data

        if not bookings:
            return

        for booking in bookings:
            facility_id = booking.get("facility_id")
            course_info = get_course_info(facility_id)
            if not course_info:
                continue
            print(f"🔁 Retrying booking {booking.get('id')} at 7am EST")
            execute_booking(booking, course_info)

    except Exception as e:
        print(f"❌ Error during retry check: {e}")


def execute_booking(booking, course_info):
    """Execute the booking. On no_availability, schedules retry at next 7am EST."""
    booking_id = booking.get("id")
    try:
        supabase.table("Client_Bookings").update({
            "booking_status": "processing",
            "updated_at": datetime.now().isoformat()
        }).eq("id", booking_id).execute()

        print(f"🚀 Executing booking for {course_info.get('Course Name')}")

        sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'scripts'))
        from booking import book_facility

        result = book_facility(booking_id=booking_id, headless=True)

        if result is True:
            supabase.table("Client_Bookings").update({
                "booking_status": "confirmed",
                "updated_at": datetime.now().isoformat()
            }).eq("id", booking_id).execute()
            print(f"✅ Booking {booking_id} completed successfully!")
            return True

        elif result == "no_availability":
            retry_at = get_next_7am_est()
            supabase.table("Client_Bookings").update({
                "booking_status": "pending",
                "next_retry_at": retry_at.isoformat(),
                "updated_at": datetime.now().isoformat()
            }).eq("id", booking_id).execute()
            print(f"📭 No availability for {booking_id} — retry at 7am EST: {retry_at.isoformat()}")
            return False

        else:
            raise Exception("Booking function returned False")

    except Exception as e:
        print(f"❌ Error executing booking {booking_id}: {e}")
        supabase.table("Client_Bookings").update({
            "booking_status": "failed",
            "updated_at": datetime.now().isoformat()
        }).eq("id", booking_id).execute()
        return False


def main():
    """Main function to run the worker"""
    print("🏌️ Holezy Golf Booking Worker Started!")
    print(f"📡 Monitoring Supabase for new bookings...")
    print(f"⏰ Current time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*60)

    # Attempt any pending bookings immediately on startup
    check_and_run_bookings()

    # Poll every 5 minutes to catch new bookings
    schedule.every(5).minutes.do(check_and_run_bookings)

    # Check 7am EST retries every 5 minutes
    schedule.every(5).minutes.do(check_retry_bookings)

    while True:
        schedule.run_pending()
        time.sleep(60)


if __name__ == "__main__":
    main()
