# =============================================================================
# scrapers/scrape_golfnow.py
# =============================================================================
# Scrape GolfNow facilities from their sitemap XML (no Playwright needed).
# =============================================================================

import re
import sys
import time
import xml.etree.ElementTree as ET

import requests
from dotenv import load_dotenv, find_dotenv

from .utils import get_db, normalize_address, upsert_courses

load_dotenv(find_dotenv())

GOLFNOW_BASE  = "https://www.golfnow.com"
SITEMAP_ROOT  = "https://www.golfnow.com/sitemap.xml"

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}

_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


def _fetch_xml(url: str) -> ET.Element | None:
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=30)
        if resp.status_code == 200:
            return ET.fromstring(resp.content)
        print(f"  [golfnow] HTTP {resp.status_code} for {url}")
    except Exception as e:
        print(f"  [golfnow] Fetch error: {e}")
    return None


def _all_urls_from_sitemap(root: ET.Element) -> list[str]:
    return [
        el.text.strip()
        for el in root.findall(".//sm:loc", _NS)
        if el.text
    ]


def _slug_to_name(slug: str) -> str:
    name = re.sub(r"-\d+$", "", slug)   # remove trailing id if present
    name = re.sub(r"^\d+-", "", name)   # remove leading id if present
    return name.replace("-", " ").title().strip()


def _rows_from_urls(urls: list[str]) -> list[dict]:
    rows = []
    seen = set()

    for loc in urls:
        # Pattern 1: /tee-times/facility/1234-slug
        m = re.search(r"/tee-times/facility/(\d+)-([^/?#]+)", loc)
        if m:
            fid, slug = m.group(1), m.group(2)
            if fid not in seen:
                seen.add(fid)
                rows.append({
                    "Course Name":          _slug_to_name(slug),
                    "Address":              None,
                    "Phone":                None,
                    "Course Website":       None,
                    "booking_platform":     "golfnow",
                    "platform_course_id":   fid,
                    "platform_booking_url": f"{GOLFNOW_BASE}/tee-times/facility/{fid}-{slug}",
                })
            continue

        # Pattern 2: /golf-courses/state/city/slug-id  or  /golf-courses/state/city/slug
        m2 = re.search(r"/golf-courses/[a-z]{2}/[^/]+/([^/?#]+)", loc)
        if m2:
            slug = m2.group(1)
            id_m = re.search(r"-(\d+)$", slug)
            fid  = id_m.group(1) if id_m else re.sub(r"[^a-z0-9]", "", slug)
            if fid not in seen:
                seen.add(fid)
                rows.append({
                    "Course Name":          _slug_to_name(slug),
                    "Address":              None,
                    "Phone":                None,
                    "Course Website":       None,
                    "booking_platform":     "golfnow",
                    "platform_course_id":   fid,
                    "platform_booking_url": loc,
                })

    return rows


def run(states: list[str] | None = None) -> int:
    db = get_db()

    print("[scrape_golfnow] Fetching sitemap…")
    root = _fetch_xml(SITEMAP_ROOT)
    if root is None:
        print("[scrape_golfnow] ERROR: Could not fetch sitemap.")
        return 0

    tag = root.tag.split("}")[-1] if "}" in root.tag else root.tag

    all_urls: list[str] = []

    if tag == "sitemapindex":
        child_urls = _all_urls_from_sitemap(root)
        print(f"[scrape_golfnow] Sitemap index with {len(child_urls)} children")
        for i, sm_url in enumerate(child_urls, 1):
            print(f"  [golfnow] {i}/{len(child_urls)}: {sm_url}")
            child = _fetch_xml(sm_url)
            if child:
                urls = _all_urls_from_sitemap(child)
                # Debug: show first 3 URLs from each sitemap
                if urls:
                    print(f"    Sample URLs: {urls[:3]}")
                all_urls.extend(urls)
            time.sleep(0.3)
    else:
        all_urls = _all_urls_from_sitemap(root)
        print(f"[scrape_golfnow] Direct sitemap with {len(all_urls)} URLs")
        if all_urls:
            print(f"  Sample URLs: {all_urls[:5]}")

    rows = _rows_from_urls(all_urls)
    print(f"[scrape_golfnow] {len(rows)} facilities matched")

    if rows:
        upsert_courses(db, rows, "golfnow")

    print(f"[scrape_golfnow] Done — {len(rows)} GolfNow facilities upserted.")
    return len(rows)


if __name__ == "__main__":
    run()
