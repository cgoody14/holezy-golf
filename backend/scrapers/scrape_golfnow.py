# =============================================================================
# scrapers/scrape_golfnow.py
# =============================================================================
# Scrape GolfNow facilities by recursively walking their sitemap tree.
# The course directory sitemap is nested 2-3 levels deep.
# =============================================================================

import re
import time
import xml.etree.ElementTree as ET

import requests
from dotenv import load_dotenv, find_dotenv

from .utils import get_db, upsert_courses

load_dotenv(find_dotenv())

GOLFNOW_BASE = "https://www.golfnow.com"
SITEMAP_ROOT = "https://www.golfnow.com/sitemap.xml"

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
        print(f"  [golfnow] HTTP {resp.status_code}: {url}")
    except Exception as e:
        print(f"  [golfnow] Fetch error: {e}")
    return None


def _is_sitemap_index(root: ET.Element) -> bool:
    tag = root.tag.split("}")[-1] if "}" in root.tag else root.tag
    return tag == "sitemapindex"


def _get_locs(root: ET.Element) -> list[str]:
    return [el.text.strip() for el in root.findall(".//sm:loc", _NS) if el.text]


def _collect_all_urls(url: str, depth: int = 0, max_depth: int = 3) -> list[str]:
    """Recursively walk sitemap indexes, collecting all leaf URLs."""
    if depth > max_depth:
        return []

    root = _fetch_xml(url)
    if root is None:
        return []

    locs = _get_locs(root)

    if _is_sitemap_index(root):
        all_urls = []
        for loc in locs:
            time.sleep(0.2)
            all_urls.extend(_collect_all_urls(loc, depth + 1, max_depth))
        return all_urls
    else:
        return locs


def _slug_to_name(slug: str) -> str:
    name = re.sub(r"-\d+$", "", slug)
    name = re.sub(r"^\d+-", "", name)
    return name.replace("-", " ").title().strip()


def _rows_from_urls(urls: list[str]) -> list[dict]:
    rows = []
    seen: set[str] = set()

    for loc in urls:
        # Pattern: /tee-times/facility/1234-slug  or  /tee-times/facility/1234
        m = re.search(r"/tee-times/facility/(\d+)(?:-([^/?#]+))?", loc)
        if m:
            fid  = m.group(1)
            slug = m.group(2) or fid
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

        # Pattern: /golf-courses/{state}/{city}/{slug}  (deepest level)
        m2 = re.search(r"/golf-courses/[a-z-]+/[a-z-]+/([^/?#]+)", loc)
        if m2:
            slug = m2.group(1)
            id_m = re.search(r"-(\d+)$", slug)
            fid  = id_m.group(1) if id_m else None
            if fid and fid not in seen:
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

    # Only walk the course directory branch — skip destinations/spotlight/static
    print("[scrape_golfnow] Fetching course directory sitemap tree…")
    course_dir_urls = _collect_all_urls(
        "https://www.golfnow.com/sitemap_coursedirectory.xml",
        max_depth=4
    )

    print(f"[scrape_golfnow] {len(course_dir_urls)} total URLs collected")
    if course_dir_urls:
        print(f"  Sample: {course_dir_urls[:5]}")

    rows = _rows_from_urls(course_dir_urls)
    print(f"[scrape_golfnow] {len(rows)} unique facilities matched")

    if rows:
        # Upsert in batches
        batch_size = 500
        for i in range(0, len(rows), batch_size):
            upsert_courses(db, rows[i:i + batch_size], "golfnow")
            print(f"  [golfnow] Upserted {min(i + batch_size, len(rows))}/{len(rows)}")

    print(f"[scrape_golfnow] Done — {len(rows)} GolfNow facilities upserted.")
    return len(rows)


if __name__ == "__main__":
    run()
