# =============================================================================
# scrapers/scrape_supreme.py
# =============================================================================
# Fetch all Supreme Golf courses and upsert into Course_Database.
#
# Supreme Golf (supremegolf.com) is an aggregator that surfaces tee times
# from GolfNow, TeeOff, and direct course systems. Its course directory
# covers courses across all those underlying platforms.
#
# Two strategies tried in order:
#   1. JSON API:   GET /api/v3/courses?state=XX&page=N
#   2. Sitemap:    https://www.supremegolf.com/sitemap.xml (contains all
#                  course page URLs from which we extract IDs + names)
#
# Note: Since Supreme Golf aggregates GolfNow/TeeOff courses, there will be
# overlap with those scrapers. The (booking_platform, platform_course_id) key
# prevents duplicates within each platform's namespace.
#
# Usage:
#   cd backend/
#   python -m scrapers.scrape_supreme
# =============================================================================

import re
import xml.etree.ElementTree as ET
import requests
from dotenv import load_dotenv, find_dotenv

from .utils import get_db, normalize_phone, normalize_address, upsert_courses, rate_limit

load_dotenv(find_dotenv())

SUPREME_BASE = "https://www.supremegolf.com"
PER_PAGE     = 100

_HEADERS = {
    "Accept":     "application/json",
    "Referer":    f"{SUPREME_BASE}/",
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}

_US_STATES = [
    "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA",
    "HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
    "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
    "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
    "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
]


def _build_row_api(course: dict) -> dict:
    cid     = str(course.get("id") or course.get("courseId") or "")
    slug    = course.get("slug") or course.get("urlSlug") or cid
    name    = (course.get("name") or course.get("courseName") or "").strip()
    city    = (course.get("city") or "").strip()
    state   = (course.get("state") or course.get("stateCode") or "").strip()
    zip_    = (course.get("zip") or course.get("postalCode") or "").strip()
    street  = (course.get("address") or course.get("street") or "").strip()
    address = normalize_address(", ".join(filter(None, [street, city, state, zip_])))
    phone   = normalize_phone(course.get("phone"))
    website = course.get("website") or course.get("websiteUrl") or ""
    book_url = f"{SUPREME_BASE}/golf-courses/{slug}/{cid}" if slug != cid else f"{SUPREME_BASE}/golf-courses/{cid}"

    return {
        "Course Name":          name,
        "Address":              address,
        "Phone":                phone,
        "Course Website":       website or None,
        "booking_platform":     "supreme",
        "platform_course_id":   cid,
        "platform_booking_url": book_url,
    }


def _scrape_api() -> tuple[bool, list]:
    """Try state-by-state API pagination. Returns (success, rows)."""
    rows     = []
    seen_ids = set()

    for state in _US_STATES:
        page = 1
        while True:
            url    = f"{SUPREME_BASE}/api/v3/courses"
            params = {"state": state, "page": page, "per_page": PER_PAGE}

            try:
                resp = requests.get(url, params=params, headers=_HEADERS, timeout=20)
            except requests.RequestException as e:
                print(f"  [supreme] Network error {state} page {page}: {e}")
                break

            if resp.status_code in (401, 403, 404):
                return False, []

            if not resp.ok:
                break

            try:
                data = resp.json()
            except Exception:
                break

            courses = (
                data.get("courses")
                or data.get("results")
                or data.get("data")
                or (data if isinstance(data, list) else [])
            )

            if not courses:
                break

            for c in courses:
                cid = str(c.get("id") or c.get("courseId") or "")
                if not cid or cid in seen_ids:
                    continue
                seen_ids.add(cid)
                row = _build_row_api(c)
                if row["Course Name"]:
                    rows.append(row)

            print(f"  [supreme] {state} page {page}: {len(courses)} courses (total {len(rows)})")

            if len(courses) < PER_PAGE:
                break

            page += 1
            rate_limit(0.4)

        rate_limit(0.2)

    return bool(rows), rows


def _scrape_sitemap() -> list:
    """
    Fallback: parse Supreme Golf's XML sitemap to extract course URLs.

    Course URLs follow the pattern:
      https://www.supremegolf.com/golf-courses/{slug}/{id}
    """
    print("[supreme] Trying sitemap scrape...")
    rows = []

    sitemap_urls = [
        f"{SUPREME_BASE}/sitemap.xml",
        f"{SUPREME_BASE}/sitemap-courses.xml",
        f"{SUPREME_BASE}/sitemap-index.xml",
    ]

    course_urls = []
    for sitemap_url in sitemap_urls:
        try:
            resp = requests.get(sitemap_url, headers=_HEADERS, timeout=30)
            if not resp.ok:
                continue

            root = ET.fromstring(resp.content)
            ns   = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}

            # Could be a sitemap index — look for nested sitemaps
            for sitemap_el in root.findall("sm:sitemap/sm:loc", ns):
                sub_url = sitemap_el.text.strip()
                if "course" in sub_url.lower():
                    try:
                        sub_resp = requests.get(sub_url, headers=_HEADERS, timeout=30)
                        if sub_resp.ok:
                            sub_root = ET.fromstring(sub_resp.content)
                            for url_el in sub_root.findall("sm:url/sm:loc", ns):
                                course_urls.append(url_el.text.strip())
                    except Exception:
                        pass
                rate_limit(0.3)

            # Direct URL listing
            for url_el in root.findall("sm:url/sm:loc", ns):
                loc = url_el.text.strip()
                if "/golf-courses/" in loc:
                    course_urls.append(loc)

        except Exception as e:
            print(f"  [supreme] Sitemap error {sitemap_url}: {e}")

    print(f"  [supreme] Found {len(course_urls)} course URLs in sitemap")

    # Parse IDs and slugs from URLs
    # Pattern: /golf-courses/{slug}/{id}  or  /golf-courses/{slug-with-id}
    seen_ids = set()
    for url in course_urls:
        match = re.search(r"/golf-courses/([^/]+)/(\d+)", url)
        if match:
            slug, cid = match.group(1), match.group(2)
        else:
            match = re.search(r"/golf-courses/([^/?#]+)", url)
            if not match:
                continue
            slug = match.group(1)
            cid  = re.sub(r"\D", "", slug.split("-")[-1])  # last numeric segment

        if not cid or cid in seen_ids:
            continue
        seen_ids.add(cid)

        # Derive a readable name from the slug
        name = re.sub(r"-\d+$", "", slug).replace("-", " ").title()
        rows.append({
            "Course Name":          name,
            "Address":              None,
            "Phone":                None,
            "Course Website":       None,
            "booking_platform":     "supreme",
            "platform_course_id":   cid,
            "platform_booking_url": url,
        })

    return rows


def run() -> int:
    """Fetch all Supreme Golf courses and upsert. Returns count."""
    print("[scrape_supreme] Starting...")
    db = get_db()

    success, rows = _scrape_api()
    if not success or not rows:
        rows = _scrape_sitemap()

    total = upsert_courses(db, rows, "supreme")
    print(f"[scrape_supreme] Done — {total} courses upserted.")
    return total


if __name__ == "__main__":
    run()
