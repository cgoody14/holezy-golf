# =============================================================================
# scrapers/scrape_teeoff.py
# =============================================================================
# Fetch all TeeOff (EZLinks) facilities and upsert into Course_Database.
#
# TeeOff and GolfNow are owned by the same parent (NBC Sports / Endeavor).
# TeeOff's API is similar in structure but uses different endpoints.
#
# Primary endpoint:
#   GET https://www.teeoff.com/api/v1/facilities
#   Params: state (2-letter), page, per_page
#
#   Also supports lat/lng + radius search as a fallback.
#
# Usage:
#   cd backend/
#   python -m scrapers.scrape_teeoff
# =============================================================================

import requests
from dotenv import load_dotenv, find_dotenv

from .utils import get_db, normalize_phone, normalize_address, upsert_courses, rate_limit

load_dotenv(find_dotenv())

TEEOFF_BASE = "https://www.teeoff.com"
PER_PAGE    = 100

_HEADERS = {
    "Accept":     "application/json",
    "Referer":    f"{TEEOFF_BASE}/",
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
    "DC",
]

# Fallback grid if state-based endpoint fails (same as GolfNow)
_US_GRID = [
    (lat, lng)
    for lat in range(25, 50, 3)
    for lng in range(-125, -65, 3)
]


def _build_row(facility: dict) -> dict:
    fid     = str(facility.get("id") or facility.get("facilityId") or "")
    name    = (facility.get("name") or facility.get("facilityName") or "").strip()
    city    = (facility.get("city") or "").strip()
    state   = (facility.get("state") or facility.get("stateCode") or "").strip()
    zip_    = (facility.get("zip") or facility.get("postalCode") or "").strip()
    street  = (facility.get("address") or facility.get("street") or "").strip()
    address = normalize_address(", ".join(filter(None, [street, city, state, zip_])))
    phone   = normalize_phone(facility.get("phone") or facility.get("phoneNumber"))
    website = facility.get("website") or facility.get("websiteUrl") or ""
    slug    = facility.get("slug") or facility.get("facilitySlug") or fid
    book_url = (
        f"{TEEOFF_BASE}/tee-times/facility/{fid}-{slug}/daily-results"
        if slug != fid
        else f"{TEEOFF_BASE}/tee-times/facility/{fid}/daily-results"
    )

    return {
        "Course Name":          name,
        "Address":              address,
        "Phone":                phone,
        "Course Website":       website or None,
        "booking_platform":     "teeoff",
        "platform_course_id":   fid,
        "platform_booking_url": book_url,
    }


def _scrape_by_state(db) -> tuple[set, list]:
    """Primary strategy: paginate through each US state."""
    seen_ids = set()
    all_rows = []

    for state in _US_STATES:
        page = 1
        while True:
            url    = f"{TEEOFF_BASE}/api/v1/facilities"
            params = {"state": state, "page": page, "per_page": PER_PAGE}

            try:
                resp = requests.get(url, params=params, headers=_HEADERS, timeout=20)
            except requests.RequestException as e:
                print(f"  [teeoff] Network error {state} page {page}: {e}")
                break

            if resp.status_code == 404:
                break  # no more pages
            if not resp.ok:
                print(f"  [teeoff] HTTP {resp.status_code} for state {state}")
                break

            try:
                data = resp.json()
            except Exception:
                break

            facilities = (
                data.get("facilities")
                or data.get("results")
                or data.get("data")
                or (data if isinstance(data, list) else [])
            )

            if not facilities:
                break

            for f in facilities:
                fid = str(f.get("id") or f.get("facilityId") or "")
                if not fid or fid in seen_ids:
                    continue
                seen_ids.add(fid)
                row = _build_row(f)
                if row["Course Name"]:
                    all_rows.append(row)

            print(f"  [teeoff] {state} page {page}: {len(facilities)} facilities (total {len(seen_ids)})")

            if len(facilities) < PER_PAGE:
                break

            page += 1
            rate_limit(0.4)

        rate_limit(0.2)

    return seen_ids, all_rows


def _scrape_by_grid(db) -> tuple[set, list]:
    """Fallback strategy: lat/lng grid search."""
    print("[teeoff] State search failed — trying grid fallback...")
    seen_ids = set()
    all_rows = []

    for i, (lat, lng) in enumerate(_US_GRID):
        url    = f"{TEEOFF_BASE}/api/v1/facilities"
        params = {"lat": lat, "lng": lng, "radius": 75, "per_page": PER_PAGE}

        try:
            resp = requests.get(url, params=params, headers=_HEADERS, timeout=20)
            if not resp.ok:
                continue
            data = resp.json()
        except Exception:
            continue

        facilities = (
            data.get("facilities")
            or data.get("results")
            or data.get("data")
            or (data if isinstance(data, list) else [])
        )

        for f in facilities:
            fid = str(f.get("id") or f.get("facilityId") or "")
            if not fid or fid in seen_ids:
                continue
            seen_ids.add(fid)
            row = _build_row(f)
            if row["Course Name"]:
                all_rows.append(row)

        if i % 20 == 0:
            print(f"  [teeoff] Grid point {i+1}/{len(_US_GRID)}: total {len(seen_ids)}")

        rate_limit(0.5)

    return seen_ids, all_rows


def run() -> int:
    """Fetch all TeeOff facilities and upsert. Returns count."""
    print("[scrape_teeoff] Starting...")
    db = get_db()

    seen_ids, all_rows = _scrape_by_state(db)

    # If state-based got nothing, fall back to grid
    if not all_rows:
        seen_ids, all_rows = _scrape_by_grid(db)

    total = upsert_courses(db, all_rows, "teeoff")
    print(f"[scrape_teeoff] Done — {len(seen_ids)} unique facilities, {total} upserted.")
    return total


if __name__ == "__main__":
    run()
