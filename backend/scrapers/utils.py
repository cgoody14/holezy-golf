# =============================================================================
# scrapers/utils.py
# =============================================================================
# Shared helpers for all course scrapers.
#
# Key functions:
#   get_db()              → Supabase client (service-role key)
#   upsert_courses(rows)  → bulk upsert into Course_Database
#   normalize_phone(p)    → strip formatting from phone numbers
#   normalize_address(a)  → strip extra whitespace from addresses
# =============================================================================

import os
import re
import time
from typing import Optional

from dotenv import load_dotenv, find_dotenv
from supabase import create_client, Client

load_dotenv(find_dotenv())

# Course_Database columns we write/update per platform row
COURSE_COLUMNS = [
    "Course Name",
    "Address",
    "Phone",
    "Course Website",
    "booking_platform",
    "platform_course_id",
    "platform_booking_url",
]

_UPSERT_BATCH = 200   # rows per Supabase upsert call


def get_db() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_KEY"],
    )


def normalize_phone(phone: Optional[str]) -> Optional[str]:
    if not phone:
        return None
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    if len(digits) == 11 and digits[0] == "1":
        return f"({digits[1:4]}) {digits[4:7]}-{digits[7:]}"
    return phone.strip() or None


def normalize_address(address: Optional[str]) -> Optional[str]:
    if not address:
        return None
    return re.sub(r"\s+", " ", address).strip()


def upsert_courses(db: Client, rows: list[dict], platform: str) -> int:
    """
    Upsert a list of course dicts into Course_Database.

    Each row must have at minimum:
        "Course Name", "booking_platform", "platform_course_id"

    Matching key: (booking_platform, platform_course_id) — so we can upsert
    GolfNow courses without clobbering ChronoGolf courses that share a name.

    Returns the total number of rows processed.
    """
    if not rows:
        return 0

    total = 0
    for i in range(0, len(rows), _UPSERT_BATCH):
        batch = rows[i : i + _UPSERT_BATCH]
        try:
            db.table("Course_Database").upsert(
                batch,
                on_conflict="booking_platform,platform_course_id",
            ).execute()
            total += len(batch)
            print(f"  [{platform}] upserted {total}/{len(rows)} courses...")
        except Exception as e:
            print(f"  [{platform}] upsert error on batch {i//200}: {e}")

    return total


def rate_limit(secs: float = 1.0) -> None:
    """Polite delay between API pages to avoid rate-limiting."""
    time.sleep(secs)
