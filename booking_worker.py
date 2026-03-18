import os
import time
from datetime import datetime, timedelta
from dotenv import load_dotenv
from supabase import create_client
import schedule
from dateutil import parser
import sys
import re

# Load environment variables
load_dotenv()

# Initialize Supabase
supabase_url = os.getenv("SUPABASE_URL")
supabase_key = os.getenv("SUPABASE_KEY")
supabase = create_client(supabase_url, supabase_key)


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


def calculate_booking_time(booking_date, booking_window_text):
    """Calculate when to execute the booking based on the course's booking window"""
    try:
        # Parse the booking date
        tee_time_date = parser.parse(booking_date)

        # Extract number from text like "Public players can book up to 14 days in advance"
        numbers = re.findall(r'\d+', str(booking_window_text))

        if not numbers:
            print(f"Could not extract number from booking window: {booking_window_text}")
            return None

        booking_window_days = int(numbers[0])

        # Calculate the booking execution date (X days before)
        booking_execution_date = tee_time_date - timedelta(days=booking_window_days)

        return booking_execution_date
    except Exception as e:
        print(f"Error calculating booking time: {e}")
        return None


def check_and_schedule_bookings():
    """Check for new bookings and schedule them"""
    try:
        # Get all pending bookings
        response = supabase.table("Client_Bookings").select("*").eq("booking_status", "pending").execute()

        bookings = response.data

        if not bookings:
            print("No pending bookings found")
            return

        for booking in bookings:
            facility_id = booking.get("facility_id")
            booking_date = booking.get("booking_date")
            booking_id = booking.get("id")

            if not facility_id or not booking_date:
                print(f"Booking {booking_id} missing facility_id or booking_date")
                continue

            # Get course info
            course_info = get_course_info(facility_id)

            if not course_info:
                print(f"No course info found for facility_id: {facility_id}")
                continue

            booking_window = course_info.get("Booking Window")

            if not booking_window:
                print(f"No booking window for course: {course_info.get('Course Name')}")
                continue

            # Calculate when to execute booking
            execution_time = calculate_booking_time(booking_date, booking_window)

            if not execution_time:
                continue

            # Check if it's time to book
            now = datetime.now()

            if now >= execution_time:
                print(f"Time to book! Booking ID: {booking_id}")
                execute_booking(booking, course_info)
            else:
                time_until_booking = execution_time - now
                print(f"Booking {booking_id} for {course_info.get('Course Name')} scheduled for {execution_time.strftime('%Y-%m-%d %H:%M')} ({time_until_booking} from now)")

    except Exception as e:
        print(f"Error checking bookings: {e}")


def execute_booking(booking, course_info):
    """Execute the actual booking using the Selenium script"""
    try:
        booking_id = booking.get("id")

        # Update status to 'processing'
        supabase.table("Client_Bookings").update({
            "booking_status": "processing",
            "updated_at": datetime.now().isoformat()
        }).eq("id", booking_id).execute()

        print(f"Executing booking for {course_info.get('Course Name')}")

        # Import the booking module
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'scripts'))
        from booking import book_facility

        # Execute the booking in headless mode
        success = book_facility(booking_id=booking_id, headless=True)

        if success:
            supabase.table("Client_Bookings").update({
                "booking_status": "confirmed",
                "updated_at": datetime.now().isoformat()
            }).eq("id", booking_id).execute()

            print(f"Booking {booking_id} completed successfully!")

            # TODO: Send confirmation email
            return True
        else:
            raise Exception("Booking function returned False")

    except Exception as e:
        print(f"Error executing booking {booking.get('id')}: {e}")

        # Update status to 'failed'
        supabase.table("Client_Bookings").update({
            "booking_status": "failed",
            "updated_at": datetime.now().isoformat()
        }).eq("id", booking.get("id")).execute()

        return False


def main():
    """Main function to run the worker"""
    print("Holzey Golf Booking Worker Started!")
    print(f"Monitoring Supabase for new bookings...")
    print(f"Current time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # Check for bookings every 5 minutes
    schedule.every(5).minutes.do(check_and_schedule_bookings)

    # Run immediately on startup
    check_and_schedule_bookings()

    # Keep the worker running
    while True:
        schedule.run_pending()
        time.sleep(60)  # Check every minute


if __name__ == "__main__":
    main()
