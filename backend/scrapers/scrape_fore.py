# =============================================================================
# scrapers/scrape_fore.py
# =============================================================================
# Fetch all Fore! Reservations (foreUP) courses and upsert into Course_Database.
#
# foreUP (formerly Fore! Reservations) is used by thousands of municipal and
# daily-fee courses. They have two main booking portals:
#
#   1. forereservations.com  (legacy ASP.NET platform)
#   2. foreup.com            (modern React platform)
#
# This scraper targets the foreUP platform which has a course directory API.
#
# Primary endpoint:
#   GET https://foreupsoftware.com/index.php/api/booking/courses
#   Returns a paginated list of all foreUP golf courses.
#
# Fallback: scrape the course directory at https://www.foreup.com/courses
#
# Usage:
#   cd backend/
#   python -m scrapers.scrape_fore
# =============================================================================

import re
import requests
from dotenv import load_dotenv, find_dotenv

from .utils import get_db, normalize_phone, normalize_address, upsert_courses, rate_limit

load_dotenv(find_dotenv())

FOREUP_BASE = "https://foreupsoftware.com"
FORE_DIR    = "https://www.foreup.com"
PER_PAGE    = 200

_HEADERS = {
    "Accept":     "application/json",
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}

_HTML_HEADERS = {
    "Accept":     "text/html,application/xhtml+xml,*/*",
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}


def _build_row_api(course: dict) -> dict:
    cid     = str(course.get("course_id") or course.get("id") or "")
    name    = (course.get("name") or course.get("course_name") or "").strip()
    city    = (course.get("city") or "").strip()
    state   = (course.get("state") or "").strip()
    zip_    = (course.get("zip") or "").strip()
    street  = (course.get("address") or course.get("street_address") or "").strip()
    address = normalize_address(", ".join(filter(None, [street, city, state, zip_])))
    phone   = normalize_phone(course.get("phone"))
    website = course.get("website") or course.get("url") or ""
    book_url = f"{FOREUP_BASE}/index.php/booking#{cid}"

    return {
        "Course Name":          name,
        "Address":              address,
        "Phone":                phone,
        "Course Website":       website or None,
        "booking_platform":     "fore",
        "platform_course_id":   cid,
        "platform_booking_url": book_url,
    }


def _scrape_api() -> tuple[bool, list]:
    """Try the foreUP JSON API for course listing. Returns (success, rows)."""
    rows     = []
    seen_ids = set()
    page     = 1

    while True:
        url    = f"{FOREUP_BASE}/index.php/api/booking/courses"
        params = {"page": page, "per_page": PER_PAGE}

        try:
            resp = requests.get(url, params=params, headers=_HEADERS, timeout=20)
        except requests.RequestException as e:
            print(f"  [fore] API network error page {page}: {e}")
            return False, []

        if resp.status_code in (401, 403, 404):
            return False, []

        if not resp.ok:
            print(f"  [fore] API HTTP {resp.status_code} — stopping")
            break

        try:
            data = resp.json()
        except Exception:
            return False, []

        courses = (
            data.get("courses")
            or data.get("data")
            or data.get("results")
            or (data if isinstance(data, list) else [])
        )

        if not courses:
            break

        for c in courses:
            cid = str(c.get("course_id") or c.get("id") or "")
            if not cid or cid in seen_ids:
                continue
            seen_ids.add(cid)
            row = _build_row_api(c)
            if row["Course Name"]:
                rows.append(row)

        print(f"  [fore] API page {page}: {len(courses)} courses (total {len(rows)})")

        if len(courses) < PER_PAGE:
            break

        page += 1
        rate_limit(0.5)

    return bool(rows), rows


def _scrape_directory() -> list:
    """
    Fallback: scrape the foreUP course directory page.
    Parses the JSON embedded in the page's __NEXT_DATA__ or script tags.
    """
    print("[fore] Trying directory scrape at foreup.com/courses...")
    rows = []
    page = 1

    while True:
        try:
            resp = requests.get(
                f"{FORE_DIR}/courses",
                params={"page": page},
                headers=_HTML_HEADERS,
                timeout=30,
            )
        except requests.RequestException as e:
            print(f"  [fore] Directory network error page {page}: {e}")
            break

        if not resp.ok:
            break

        html = resp.text

        # Extract course data from embedded JSON (Next.js __NEXT_DATA__)
        match = re.search(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL)
        if match:
            import json
            try:
                next_data = json.loads(match.group(1))
                # Walk the props tree to find course arrays
                courses = _extract_courses_from_next_data(next_data)
                if courses:
                    rows.extend(courses)
                    print(f"  [fore] Directory page {page}: {len(courses)} courses")
                    page += 1
                    rate_limit(0.5)
                    continue
            except Exception:
                pass

        # If no Next.js data, try parsing course cards from HTML
        course_ids = re.findall(r'course[_-]id["\s]*[:=]["\s]*(\d+)', html)
        course_names = re.findall(r'<h[23][^>]*>\s*([^<]{5,80})\s*</h[23]>', html)
        if not course_ids:
            break

        for cid, name in zip(course_ids, course_names or [""]*len(course_ids)):
            rows.append({
                "Course Name":          name.strip(),
                "Address":              None,
                "Phone":                None,
                "Course Website":       None,
                "booking_platform":     "fore",
                "platform_course_id":   cid,
                "platform_booking_url": f"{FOREUP_BASE}/index.php/booking#{cid}",
            })

        page += 1
        rate_limit(0.5)

    return rows


def _extract_courses_from_next_data(data: dict, depth: int = 0) -> list:
    """Recursively search Next.js page data for a courses array."""
    if depth > 10:
        return []
    if isinstance(data, list):
        # Check if this looks like a course list
        if data and isinstance(data[0], dict) and (
            "course_id" in data[0] or "name" in data[0]
        ):
            rows = []
            for c in data:
                cid  = str(c.get("course_id") or c.get("id") or "")
                name = (c.get("name") or c.get("course_name") or "").strip()
                if cid and name:
                    rows.append({
                        "Course Name":          name,
                        "Address":              normalize_address(c.get("address")),
                        "Phone":                normalize_phone(c.get("phone")),
                        "Course Website":       c.get("website") or None,
                        "booking_platform":     "fore",
                        "platform_course_id":   cid,
                        "platform_booking_url": f"{FOREUP_BASE}/index.php/booking#{cid}",
                    })
            return rows
        return []
    if isinstance(data, dict):
        for v in data.values():
            result = _extract_courses_from_next_data(v, depth + 1)
            if result:
                return result
    return []


def run() -> int:
    """Fetch all Fore!/foreUP courses and upsert. Returns count."""
    print("[scrape_fore] Starting...")
    db = get_db()

    success, rows = _scrape_api()
    if not success or not rows:
        rows = _scrape_directory()

    total = upsert_courses(db, rows, "fore")
    print(f"[scrape_fore] Done — {total} courses upserted.")
    return total


if __name__ == "__main__":
    run()
