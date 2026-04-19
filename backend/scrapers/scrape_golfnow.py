# =============================================================================
# scrapers/scrape_golfnow.py
# =============================================================================
# Scrape GolfNow facilities with online booking using Playwright.
#
# URL flow:
#   https://www.golfnow.com/course-directory/us
#     → /course-directory/us/{state}          (state pages)
#       → /course-directory/us/{state}/{city} (city pages)
#         → section#on-platform               (courses with online booking)
#           → a[data-facilityid]              (individual course tiles)
#
# Usage:
#   python -m scrapers.scrape_golfnow
#   python -m scrapers.scrape_golfnow al tx ca   # specific states only
# =============================================================================

import asyncio
import re
import sys

from dotenv import load_dotenv, find_dotenv
from playwright.async_api import async_playwright, Page, TimeoutError as PWTimeout

from .utils import get_db, upsert_courses

load_dotenv(find_dotenv())

BASE        = "https://www.golfnow.com"
DIR_ROOT    = f"{BASE}/course-directory/us"

_BROWSER_ARGS = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]

_US_STATES = [
    "al","ak","az","ar","ca","co","ct","de","fl","ga",
    "hi","id","il","in","ia","ks","ky","la","me","md",
    "ma","mi","mn","ms","mo","mt","ne","nv","nh","nj",
    "nm","ny","nc","nd","oh","ok","or","pa","ri","sc",
    "sd","tn","tx","ut","vt","va","wa","wv","wi","wy","dc",
]


async def _get_city_links(page: Page, state: str) -> list[str]:
    """Return all city page URLs for a state."""
    url = f"{DIR_ROOT}/{state}"
    try:
        await page.goto(url, wait_until="networkidle", timeout=45_000)
    except PWTimeout:
        print(f"  [golfnow] Timeout on state: {state}")
        return []

    await asyncio.sleep(1)

    links = []
    try:
        anchors = await page.query_selector_all(f'a[href*="/course-directory/us/{state}/"]')
        for a in anchors:
            href = await a.get_attribute("href") or ""
            full = href if href.startswith("http") else f"{BASE}{href}"
            if full not in links:
                links.append(full)
    except Exception as e:
        print(f"  [golfnow] City link error ({state}): {e}")

    return links


async def _scrape_city(page: Page, city_url: str, seen: set) -> list[dict]:
    """Scrape online-booking courses from a city page's #on-platform section."""
    try:
        await page.goto(city_url, wait_until="networkidle", timeout=45_000)
    except PWTimeout:
        return []

    await asyncio.sleep(1)

    rows = []
    try:
        # Only courses in the #on-platform section have online booking
        platform_section = await page.query_selector("section#on-platform")
        if not platform_section:
            return []

        # Each course tile has an anchor with data-facilityid
        tiles = await platform_section.query_selector_all("a[data-facilityid]")

        for tile in tiles:
            try:
                fid   = await tile.get_attribute("data-facilityid") or ""
                name  = await tile.get_attribute("data-facilityname") or ""
                city  = await tile.get_attribute("data-city") or ""
                state = await tile.get_attribute("data-state") or ""

                if not fid or fid in seen:
                    continue
                seen.add(fid)

                # Build slug from name for clean booking URL
                slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
                book_url = f"{BASE}/tee-times/facility/{fid}-{slug}/search"

                address = f"{city}, {state}" if city and state else None

                rows.append({
                    "Course Name":          name,
                    "Address":              address,
                    "Phone":                None,
                    "Course Website":       None,
                    "booking_platform":     "golfnow",
                    "platform_course_id":   fid,
                    "platform_booking_url": book_url,
                })
            except Exception:
                continue

    except Exception as e:
        print(f"  [golfnow] Scrape error on {city_url}: {e}")

    return rows


async def _run_async(states: list[str] | None = None) -> int:
    db       = get_db()
    seen: set[str] = set()
    states   = states or _US_STATES

    print(f"[scrape_golfnow] Starting — {len(states)} states")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=_BROWSER_ARGS)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        )
        page = await context.new_page()

        all_rows: list[dict] = []

        for state in states:
            print(f"  [golfnow] State: {state.upper()}")
            city_links = await _get_city_links(page, state)
            print(f"  [golfnow]   {len(city_links)} cities found")

            for city_url in city_links:
                rows = await _scrape_city(page, city_url, seen)
                all_rows.extend(rows)
                await asyncio.sleep(0.5)

                if len(all_rows) >= 500:
                    upsert_courses(db, all_rows, "golfnow")
                    print(f"  [golfnow] Upserted batch — {len(seen)} unique so far")
                    all_rows = []

        await browser.close()

    upsert_courses(db, all_rows, "golfnow")
    print(f"[scrape_golfnow] Done — {len(seen)} unique GolfNow facilities.")
    return len(seen)


def run(states: list[str] | None = None) -> int:
    return asyncio.run(_run_async(states))


if __name__ == "__main__":
    state_args = [s.lower() for s in sys.argv[1:]] if len(sys.argv) > 1 else None
    run(state_args)
