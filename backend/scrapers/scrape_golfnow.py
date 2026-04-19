# =============================================================================
# scrapers/scrape_golfnow.py
# =============================================================================
# Scrape all GolfNow facilities from their US course directory and upsert
# into Course_Database.
#
# Approach (mirrors the original GolfNow_scraper.py but uses Playwright):
#   1. Navigate to https://www.golfnow.com/golf-courses/{state} for each US state
#   2. Collect all city links from the state page
#   3. For each city page: scrape course cards to extract:
#        - facility_id, course_name, address, tee_times_url, tee_time_booking
#   4. Upsert into Course_Database using (booking_platform, platform_course_id)
#
# Usage:
#   cd backend/
#   python -m scrapers.scrape_golfnow
#   python -m scrapers.scrape_golfnow ma ca tx   # specific states only
# =============================================================================

import asyncio
import re
import sys
from pathlib import Path

from dotenv import load_dotenv, find_dotenv
from playwright.async_api import async_playwright, Page, TimeoutError as PWTimeout

from .utils import get_db, normalize_phone, normalize_address, upsert_courses

load_dotenv(find_dotenv())

GOLFNOW_BASE = "https://www.golfnow.com"
SCREENSHOT_DIR = Path("/tmp")

_BROWSER_ARGS = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]

_US_STATES = [
    "al","ak","az","ar","ca","co","ct","de","fl","ga",
    "hi","id","il","in","ia","ks","ky","la","me","md",
    "ma","mi","mn","ms","mo","mt","ne","nv","nh","nj",
    "nm","ny","nc","nd","oh","ok","or","pa","ri","sc",
    "sd","tn","tx","ut","vt","va","wa","wv","wi","wy","dc",
]


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Get city links from a state page
# ─────────────────────────────────────────────────────────────────────────────

async def _get_city_links(page: Page, state: str) -> list[str]:
    """Return all city-level course listing URLs for a given state."""
    url = f"{GOLFNOW_BASE}/golf-courses/{state}"
    try:
        await page.goto(url, wait_until="networkidle", timeout=45_000)
    except PWTimeout:
        print(f"  [golfnow] Timeout on state page: {state}")
        return []

    # Allow JS-rendered content extra time to appear
    await asyncio.sleep(2)

    links = []
    try:
        anchors = await page.query_selector_all('a[href*="/golf-courses/"]')
        for a in anchors:
            href = await a.get_attribute("href") or ""
            parts = href.rstrip("/").split("/golf-courses/")
            if len(parts) == 2 and "/" in parts[1]:
                full = href if href.startswith("http") else f"{GOLFNOW_BASE}{href}"
                if full not in links:
                    links.append(full)

        # Fallback: try tee-times links if no city links found
        if not links:
            tee_anchors = await page.query_selector_all('a[href*="/tee-times/"]')
            for a in tee_anchors:
                href = await a.get_attribute("href") or ""
                id_match = re.search(r"/facility/(\d+)", href)
                if id_match:
                    # Treat each facility link as its own "city" to scrape
                    full = href if href.startswith("http") else f"{GOLFNOW_BASE}{href}"
                    if full not in links:
                        links.append(full)

    except Exception as e:
        print(f"  [golfnow] City link error for {state}: {e}")

    return links


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Scrape course cards from a city page
# ─────────────────────────────────────────────────────────────────────────────

async def _scrape_city(page: Page, city_url: str, seen_ids: set) -> list[dict]:
    """Scrape all course cards from a GolfNow city page. Returns new rows."""
    try:
        await page.goto(city_url, wait_until="domcontentloaded", timeout=30_000)
    except PWTimeout:
        return []

    # Scroll to load lazy content
    for _ in range(5):
        await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
        await asyncio.sleep(1)

    rows = []

    try:
        # GolfNow course cards have facility links: /tee-times/facility/{id}-{slug}
        cards = await page.query_selector_all(
            'a[href*="/tee-times/facility/"], '
            'div[class*="facility"], '
            'div[class*="course-card"]'
        )

        for card in cards:
            try:
                # Get the booking link
                link_el = card if await card.get_attribute("href") else \
                          await card.query_selector('a[href*="/tee-times/facility/"]')
                if not link_el:
                    continue

                href = await link_el.get_attribute("href") or ""
                id_match = re.search(r"/facility/(\d+)", href)
                if not id_match:
                    continue

                fid = id_match.group(1)
                if fid in seen_ids:
                    continue
                seen_ids.add(fid)

                slug_match = re.search(r"/facility/(\d+-[^/?#]+)", href)
                slug = slug_match.group(1) if slug_match else fid
                book_url = f"{GOLFNOW_BASE}/tee-times/facility/{slug}"

                # Course name
                name = ""
                for sel in ["h2", "h3", ".facility-name", "[class*='name']", "strong"]:
                    el = await card.query_selector(sel)
                    if el:
                        name = (await el.inner_text()).strip()
                        if name:
                            break

                # Address
                address = ""
                for sel in [".address", "[class*='address']", "[class*='location']", "p"]:
                    el = await card.query_selector(sel)
                    if el:
                        address = (await el.inner_text()).strip()
                        if address:
                            break

                if not name:
                    name = slug.replace("-", " ").title()
                    name = re.sub(r"^\d+\s*", "", name).strip()

                rows.append({
                    "Course Name":          name,
                    "Address":              normalize_address(address) or None,
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


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

async def _run_async(states: list[str] | None = None) -> int:
    db       = get_db()
    seen_ids = set()
    states   = states or _US_STATES

    print(f"[scrape_golfnow] Starting — {len(states)} states to scrape")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True, args=_BROWSER_ARGS)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        )
        page = await context.new_page()

        all_rows = []
        for state in states:
            print(f"  [golfnow] State: {state.upper()}")
            city_links = await _get_city_links(page, state)
            print(f"  [golfnow]   {len(city_links)} cities found")

            for city_url in city_links:
                rows = await _scrape_city(page, city_url, seen_ids)
                all_rows.extend(rows)
                await asyncio.sleep(0.5)

                # Batch upsert every 500 rows
                if len(all_rows) >= 500:
                    upsert_courses(db, all_rows, "golfnow")
                    print(f"  [golfnow] Upserted batch — total unique: {len(seen_ids)}")
                    all_rows = []

        await browser.close()

    # Final batch
    upsert_courses(db, all_rows, "golfnow")
    print(f"[scrape_golfnow] Done — {len(seen_ids)} unique GolfNow facilities.")
    return len(seen_ids)


def run(states: list[str] | None = None) -> int:
    return asyncio.run(_run_async(states))


if __name__ == "__main__":
    state_args = [s.lower() for s in sys.argv[1:]] if len(sys.argv) > 1 else None
    run(state_args)
