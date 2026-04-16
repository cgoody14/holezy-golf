# =============================================================================
# scrapers/scrape_chronogolf.py
# =============================================================================
# Scrape all ChronoGolf clubs from their US directory and upsert into
# Course_Database.
#
# Approach (mirrors the original chronogolf_scraper.py but uses Playwright):
#   1. Navigate to https://www.chronogolf.com/clubs/United-States (paginated)
#   2. Scroll-load each page to reveal all club cards
#   3. Collect every club URL (href^="https://www.chronogolf.com/club")
#   4. Visit each club page and extract:
#        - Course Name, Booking URL, Address, Phone, Course Website
#   5. Upsert into Course_Database using (booking_platform, platform_course_id)
#
# Also runs a fast backfill that sets platform_course_id on any existing rows
# that were imported from the original CSV (they have a Facility ID but no
# platform_course_id yet).
#
# Usage:
#   cd backend/
#   python -m scrapers.scrape_chronogolf
# =============================================================================

import asyncio
import re
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv, find_dotenv
from playwright.async_api import async_playwright, Page, TimeoutError as PWTimeout

from .utils import get_db, normalize_phone, normalize_address, upsert_courses

load_dotenv(find_dotenv())

CHRONO_BASE   = "https://www.chronogolf.com"
LIST_URL      = f"{CHRONO_BASE}/clubs/United-States?page={{page}}&filters=%257B%2522onlineBooking%2522%3Atrue%257D"
MAX_CLUBS     = 20_000
SCREENSHOT_DIR = Path("/tmp")

_BROWSER_ARGS = ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"]


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — Collect all club URLs from the paginated directory
# ─────────────────────────────────────────────────────────────────────────────

async def _collect_club_urls(page: Page) -> list[str]:
    """
    Paginate through the ChronoGolf US club directory.
    Returns a deduplicated list of club page URLs.
    """
    seen = set()
    all_urls = []
    pg = 1

    while len(all_urls) < MAX_CLUBS:
        url = LIST_URL.format(page=pg)
        print(f"  [chronogolf] Listing page {pg}: {url}")

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30_000)
        except PWTimeout:
            print(f"  [chronogolf] Timeout on listing page {pg} — stopping")
            break

        # Scroll to load all lazy-loaded cards
        prev_height = 0
        for _ in range(20):
            await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
            await asyncio.sleep(1.5)
            height = await page.evaluate("document.body.scrollHeight")
            if height == prev_height:
                break
            prev_height = height

        # Collect club links
        links = await page.query_selector_all('a[href^="https://www.chronogolf.com/club"]')
        new_count = 0
        for link in links:
            try:
                href = await link.get_attribute("href")
                if href and href not in seen:
                    seen.add(href)
                    all_urls.append(href)
                    new_count += 1
            except Exception:
                continue

        print(f"  [chronogolf] Page {pg}: {new_count} new clubs (total {len(all_urls)})")

        if new_count == 0:
            break  # no new clubs on this page — done

        # Try clicking "Next Page"
        try:
            next_btn = page.locator('button[aria-label="Next Page"]')
            if await next_btn.count() == 0:
                break
            await next_btn.click()
            await asyncio.sleep(2)
        except Exception:
            pg += 1  # fall back to URL-based pagination

    print(f"  [chronogolf] Total club URLs collected: {len(all_urls)}")
    return all_urls


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — Extract details from each club page
# ─────────────────────────────────────────────────────────────────────────────

async def _extract_club(page: Page, club_url: str, idx: int, total: int) -> dict | None:
    """
    Visit a single club page and return a Course_Database row dict.
    Returns None if extraction fails.
    """
    try:
        await page.goto(club_url, wait_until="domcontentloaded", timeout=30_000)
    except PWTimeout:
        print(f"  [{idx}/{total}] Timeout: {club_url}")
        return None
    except Exception as e:
        print(f"  [{idx}/{total}] Nav error: {e}")
        return None

    # Extract numeric club ID from URL
    id_match = re.search(r"/club(?:/[^/]+)?/(\d+)", club_url)
    if not id_match:
        # Try slug-only URL — use last path segment
        id_match = re.search(r"/club/([^/?#]+)", club_url)
    club_id = id_match.group(1) if id_match else ""

    # Course name
    name = ""
    try:
        el = await page.query_selector("h1.mb-2.page-title-s, h1[class*='page-title']")
        if el:
            name = (await el.inner_text()).strip()
    except Exception:
        pass
    if not name:
        name = club_url.rstrip("/").rsplit("/", 1)[-1].replace("-", " ").title()

    address = phone = website = ""

    # Contact block: address, phone, website
    try:
        await page.wait_for_selector("div.flex.flex-col.gap-3", timeout=5_000)
        links = await page.query_selector_all("div.flex.flex-col.gap-3 a.underline")
        for link in links:
            try:
                href = await link.get_attribute("href") or ""
                text = (await link.inner_text()).strip()
                if "maps" in href.lower() or "maps.google" in href:
                    address = text
                elif href.startswith("tel:"):
                    phone = text
                elif href.startswith("http") and "chronogolf" not in href:
                    website = href
            except Exception:
                continue
    except PWTimeout:
        pass

    current_url = page.url
    book_url    = current_url if "chronogolf.com" in current_url else f"{CHRONO_BASE}/club/{club_id}"

    row = {
        "Course Name":          name,
        "Address":              normalize_address(address) or None,
        "Phone":                normalize_phone(phone) or None,
        "Course Website":       website or None,
        "booking_platform":     "chronogolf",
        "platform_course_id":   club_id,
        "platform_booking_url": book_url,
    }

    print(f"  [{idx}/{total}] {name} | id={club_id}")
    return row


# ─────────────────────────────────────────────────────────────────────────────
# FAST BACKFILL — existing CSV rows
# ─────────────────────────────────────────────────────────────────────────────

def _backfill_existing_rows(db) -> int:
    """
    Set platform_course_id on rows already in Course_Database from the
    original CSV import (they have a numeric Facility ID but no platform fields).
    """
    print("[chronogolf] Backfilling platform fields on existing CSV rows...")
    try:
        result = (
            db.table("Course_Database")
            .select('"Facility ID", "Booking URL"')
            .is_("platform_course_id", "null")
            .not_.is_('"Facility ID"', "null")
            .limit(20000)
            .execute()
        )
        rows = result.data or []
        print(f"  {len(rows)} rows need backfill")

        count = 0
        for row in rows:
            fid = row.get("Facility ID")
            if not fid:
                continue
            booking_url = row.get("Booking URL") or f"{CHRONO_BASE}/club/{fid}"
            db.table("Course_Database").update({
                "booking_platform":     "chronogolf",
                "platform_course_id":   str(fid),
                "platform_booking_url": booking_url,
            }).eq('"Facility ID"', fid).execute()
            count += 1

            if count % 500 == 0:
                print(f"  Backfilled {count}/{len(rows)}...")

        print(f"  Backfill done: {count} rows updated")
        return count
    except Exception as e:
        print(f"  Backfill error: {e}")
        return 0


# ─────────────────────────────────────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────────────────────────────────────

async def _run_async() -> int:
    db = get_db()

    # Always backfill existing rows first (fast, no browser needed)
    _backfill_existing_rows(db)

    print("[chronogolf] Starting Playwright scrape of US club directory...")
    rows = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=_BROWSER_ARGS,
        )
        # Use a single page for listing, then detail pages
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (X11; Linux x86_64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            )
        )
        list_page = await context.new_page()

        # Collect all club URLs
        club_urls = await _collect_club_urls(list_page)
        await list_page.close()

        if not club_urls:
            print("[chronogolf] No club URLs found — check if ChronoGolf changed their layout")
            await browser.close()
            return 0

        # Visit each club page for details
        detail_page = await context.new_page()
        for i, url in enumerate(club_urls, 1):
            row = await _extract_club(detail_page, url, i, len(club_urls))
            if row:
                rows.append(row)

            # Save progress every 200 clubs
            if len(rows) >= 200:
                upsert_courses(db, rows, "chronogolf")
                rows = []

        await detail_page.close()
        await browser.close()

    # Final batch
    total = upsert_courses(db, rows, "chronogolf")
    print(f"[chronogolf] Done — {len(club_urls)} clubs scraped.")
    return len(club_urls)


def run() -> int:
    return asyncio.run(_run_async())


if __name__ == "__main__":
    run()
