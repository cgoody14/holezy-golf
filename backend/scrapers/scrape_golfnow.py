# =============================================================================
# scrapers/scrape_golfnow.py
# =============================================================================
# Scrape GolfNow facilities from their sitemap XML (no Playwright needed).
#
# Approach:
#   1. Fetch https://www.golfnow.com/sitemap_index.xml
#   2. Find the sitemap file(s) containing /tee-times/facility/ URLs
#   3. Parse every facility URL → extract facility_id, slug, name
#   4. Upsert into Course_Database
#
# Usage:
#   cd backend/
#   python -m scrapers.scrape_golfnow
# =============================================================================

import re
import sys
import time
import xml.etree.ElementTree as ET
from urllib.parse import urljoin

import requests
from dotenv import load_dotenv, find_dotenv

from .utils import get_db, normalize_address, upsert_courses

load_dotenv(find_dotenv())

GOLFNOW_BASE   = "https://www.golfnow.com"
SITEMAP_INDEX  = "https://www.golfnow.com/sitemap_index.xml"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


def _fetch_xml(url: str, retries: int = 3) -> ET.Element | None:
    for attempt in range(retries):
        try:
            resp = requests.get(url, headers=_HEADERS, timeout=30)
            if resp.status_code == 200:
                return ET.fromstring(resp.content)
            print(f"  [golfnow] HTTP {resp.status_code} for {url}")
        except Exception as e:
            print(f"  [golfnow] Fetch error ({attempt+1}/{retries}): {e}")
        time.sleep(2 ** attempt)
    return None


def _slug_to_name(slug: str) -> str:
    """Convert URL slug like '1234-pine-valley-golf-club' → 'Pine Valley Golf Club'"""
    name = re.sub(r"^\d+-", "", slug)          # remove leading facility id
    name = name.replace("-", " ").title()
    return name.strip()


def _get_facility_sitemaps(index_root: ET.Element) -> list[str]:
    """Return sitemap URLs that likely contain facility/tee-times pages."""
    urls = []
    for sitemap in index_root.findall("sm:sitemap", _NS):
        loc = sitemap.findtext("sm:loc", namespaces=_NS) or ""
        if "facilit" in loc or "tee-time" in loc or "golf-course" in loc:
            urls.append(loc)
    # If none matched by name, return all sitemaps for full scan
    if not urls:
        urls = [
            s.findtext("sm:loc", namespaces=_NS) or ""
            for s in index_root.findall("sm:sitemap", _NS)
        ]
    return [u for u in urls if u]


def _parse_facilities_from_sitemap(sitemap_root: ET.Element) -> list[dict]:
    rows = []
    for url_el in sitemap_root.findall("sm:url", _NS):
        loc = url_el.findtext("sm:loc", namespaces=_NS) or ""
        # Match: /tee-times/facility/{id}-{slug}
        m = re.search(r"/tee-times/facility/(\d+)-([^/?#]+)", loc)
        if not m:
            continue
        fid  = m.group(1)
        slug = m.group(2)
        name = _slug_to_name(slug)
        book_url = f"{GOLFNOW_BASE}/tee-times/facility/{fid}-{slug}"
        rows.append({
            "Course Name":          name,
            "Address":              None,
            "Phone":                None,
            "Course Website":       None,
            "booking_platform":     "golfnow",
            "platform_course_id":   fid,
            "platform_booking_url": book_url,
        })
    return rows


def run(states: list[str] | None = None) -> int:
    """states param unused — sitemap covers all US facilities."""
    db = get_db()

    print("[scrape_golfnow] Fetching sitemap index…")
    index_root = _fetch_xml(SITEMAP_INDEX)

    if index_root is None:
        # Fallback: try direct sitemap
        print("[scrape_golfnow] Index not found, trying direct sitemap…")
        index_root = _fetch_xml(f"{GOLFNOW_BASE}/sitemap.xml")

    if index_root is None:
        print("[scrape_golfnow] ERROR: Could not fetch any sitemap.")
        return 0

    # Check if this is a sitemap index or a direct sitemap
    tag = index_root.tag.split("}")[-1] if "}" in index_root.tag else index_root.tag

    all_rows: list[dict] = []

    if tag == "sitemapindex":
        sitemap_urls = _get_facility_sitemaps(index_root)
        print(f"[scrape_golfnow] Found {len(sitemap_urls)} sitemap file(s) to scan")

        for i, sm_url in enumerate(sitemap_urls, 1):
            print(f"  [golfnow] Sitemap {i}/{len(sitemap_urls)}: {sm_url}")
            sm_root = _fetch_xml(sm_url)
            if sm_root is None:
                continue
            rows = _parse_facilities_from_sitemap(sm_root)
            all_rows.extend(rows)
            print(f"  [golfnow]   {len(rows)} facilities found")
            time.sleep(0.5)

            if len(all_rows) >= 500:
                upsert_courses(db, all_rows, "golfnow")
                print(f"  [golfnow] Upserted batch — running total: {len(all_rows)}")
                all_rows = []

    else:
        # Direct sitemap
        all_rows = _parse_facilities_from_sitemap(index_root)
        print(f"[scrape_golfnow] {len(all_rows)} facilities found in sitemap")

    upsert_courses(db, all_rows, "golfnow")
    total = len(all_rows)
    print(f"[scrape_golfnow] Done — {total} GolfNow facilities upserted.")
    return total


if __name__ == "__main__":
    run()
