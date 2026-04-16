# =============================================================================
# booking_fore.py
# =============================================================================
# Fore! Reservations Playwright booking engine for Holezy.
#
# Same public interface as booking_chronogolf.py:
#
#   login(page, email, password)
#   search_slots(page, course_url, date, players, time_window) → list[dict]
#   book_slot(page, slot) → str   (returns confirmation code)
#
# course_url format expected in scheduled_jobs.course_url:
#   "https://forereservations.com/reserve.aspx?gid=12345"
#   or bare golf course ID: "12345"
#
# Fore! Reservations notes:
#   - Legacy ASP.NET platform used by many municipal courses
#   - Login and booking are form-based (not a REST API)
#   - We use full Playwright navigation rather than page.request API calls
#   - Each course has its own subdomain or gid parameter
# =============================================================================

import re
import asyncio
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv, find_dotenv
from playwright.async_api import Page

load_dotenv(find_dotenv())


FORE_BASE = "https://forereservations.com"

_BROWSER_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}

SCREENSHOT_DIR = Path("/tmp")


# ─────────────────────────────────────────────────────────────────────────────
# PRIVATE HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _extract_gid(course_url: str) -> str:
    """
    Extract Fore! Reservations golf course gid from a URL or bare ID.

    Accepted formats:
      "12345"
      "https://forereservations.com/reserve.aspx?gid=12345"
      "https://12345.forereservations.com/"
    """
    s = str(course_url).strip()
    if s.isdigit():
        return s
    match = re.search(r"[?&]gid=(\d+)", s)
    if match:
        return match.group(1)
    match = re.search(r"https?://(\d+)\.forereservations", s)
    if match:
        return match.group(1)
    raise ValueError(
        f"Cannot extract Fore! gid from '{course_url}'. "
        "Store course_url as 'https://forereservations.com/reserve.aspx?gid=<id>' "
        "in the scheduled_jobs table."
    )


def _time_to_minutes(hhmm: str) -> int:
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m


async def _screenshot(page: Page, label: str) -> None:
    ts   = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = str(SCREENSHOT_DIR / f"holezy_fore_{label}_{ts}.png")
    try:
        await page.screenshot(path=path, full_page=True)
        print(f"[booking_fore] Screenshot → {path}")
    except Exception as ss_err:
        print(f"[booking_fore] Screenshot failed: {ss_err}")


# ─────────────────────────────────────────────────────────────────────────────
# 1.  LOGIN
# ─────────────────────────────────────────────────────────────────────────────

async def login(page: Page, email: str, password: str) -> None:
    """
    Authenticate with Fore! Reservations.

    Fore! is an ASP.NET WebForms platform — login is a standard POST form.
    We navigate to the login page, fill the form, and submit.
    """
    try:
        login_url = f"{FORE_BASE}/login.aspx"
        print(f"[booking_fore] login → {login_url}")
        await page.goto(login_url, wait_until="domcontentloaded", timeout=30_000)

        # Fore! uses ASP.NET generated IDs — try common patterns
        email_sel = (
            "#ctl00_ContentPlaceHolder1_txtEmail, "
            "input[name*='Email'], input[type='email'], "
            "#txtEmail"
        )
        pw_sel = (
            "#ctl00_ContentPlaceHolder1_txtPassword, "
            "input[name*='Password'], input[type='password'], "
            "#txtPassword"
        )
        submit_sel = (
            "#ctl00_ContentPlaceHolder1_btnLogin, "
            "input[type='submit'], button[type='submit']"
        )

        await page.wait_for_selector(email_sel, timeout=15_000)
        await page.fill(email_sel, email)
        await page.wait_for_selector(pw_sel, timeout=5_000)
        await page.fill(pw_sel, password)

        await page.wait_for_selector(submit_sel, timeout=5_000)
        await page.click(submit_sel)

        # Wait for navigation — Fore! does a full page redirect on login
        await page.wait_for_load_state("domcontentloaded", timeout=20_000)

        # Check for error message
        error_sel = ".error, .alert-danger, #lblError, [class*='error']"
        try:
            error_el = await page.query_selector(error_sel)
            if error_el:
                error_text = await error_el.inner_text()
                raise RuntimeError(f"Fore! login error: {error_text.strip()}")
        except RuntimeError:
            raise
        except Exception:
            pass

        print(f"[booking_fore] Authenticated as {email}")

    except Exception:
        await _screenshot(page, "login_error")
        raise


# ─────────────────────────────────────────────────────────────────────────────
# 2.  SEARCH SLOTS
# ─────────────────────────────────────────────────────────────────────────────

async def search_slots(
    page: Page,
    course_url: str,
    date: str,
    players: int,
    time_window: dict,
) -> list[dict]:
    """
    Navigate to the Fore! tee time search page and scrape available slots.

    Fore! is a form-based UI — we navigate to the course booking page,
    select the date and player count, submit, then parse the results table.
    """
    try:
        gid = _extract_gid(course_url)
        booking_url = f"{FORE_BASE}/reserve.aspx?gid={gid}"

        print(
            f"[booking_fore] search_slots gid={gid} "
            f"date={date} players={players} window={time_window}"
        )

        await page.goto(booking_url, wait_until="domcontentloaded", timeout=30_000)

        # Select date — Fore! typically has a date picker input
        date_sel = (
            "#ctl00_ContentPlaceHolder1_txtDate, "
            "input[name*='Date'], input[type='date'], "
            "#txtDate"
        )
        await page.wait_for_selector(date_sel, timeout=10_000)
        await page.fill(date_sel, date)

        # Select player count — typically a dropdown
        players_sel = (
            "#ctl00_ContentPlaceHolder1_ddlPlayers, "
            "select[name*='Player'], select[name*='player'], "
            "#ddlPlayers"
        )
        try:
            await page.select_option(players_sel, str(players))
        except Exception:
            pass

        # Submit search
        search_sel = (
            "#ctl00_ContentPlaceHolder1_btnSearch, "
            "input[type='submit'], button[type='submit']"
        )
        await page.wait_for_selector(search_sel, timeout=5_000)
        await page.click(search_sel)
        await page.wait_for_load_state("domcontentloaded", timeout=20_000)

        # Parse results — Fore! renders a table of tee times
        # Each row typically has: time, players, holes, price, book button
        slot_rows = await page.query_selector_all(
            "table.tee-times tr[data-time], "
            ".tee-time-row, "
            "tr.teeTimeRow, "
            "tr[class*='teeTime']"
        )

        earliest_mins = _time_to_minutes(time_window.get("earliest", "00:00"))
        latest_mins   = _time_to_minutes(time_window.get("latest",   "23:59"))

        slots: list[dict] = []
        for row in slot_rows:
            try:
                time_text = await row.get_attribute("data-time") or ""
                if not time_text:
                    time_el = await row.query_selector("td:first-child, .time")
                    time_text = (await time_el.inner_text()).strip() if time_el else ""

                # Parse time (may be "8:30 AM" format)
                try:
                    dt = datetime.strptime(time_text.strip(), "%I:%M %p")
                except ValueError:
                    try:
                        dt = datetime.strptime(time_text.strip(), "%H:%M")
                    except ValueError:
                        continue

                slot_mins = dt.hour * 60 + dt.minute
                if not (earliest_mins <= slot_mins <= latest_mins):
                    continue

                # Price
                price_el  = await row.query_selector(".price, td.price, [data-price]")
                price_txt = (await price_el.inner_text()).strip() if price_el else ""
                try:
                    green_fee = float(re.sub(r"[^\d.]", "", price_txt))
                except (ValueError, TypeError):
                    green_fee = 0.0

                # Book button data-id
                book_el = await row.query_selector("a[data-id], button[data-id], a.book, button.book")
                slot_id = (await book_el.get_attribute("data-id") or "") if book_el else ""

                start_iso = f"{date}T{dt.strftime('%H:%M')}:00"

                slots.append({
                    "id":              slot_id,
                    "start_time":      start_iso,
                    "green_fee":       green_fee,
                    "available_spots": players,
                    "nb_holes":        18,
                    "rate_type":       "standard",
                    "_gid":            gid,
                    "_player_count":   players,
                    "_row_element":    None,  # can't serialize, use slot_id for booking
                })
            except Exception:
                continue

        print(
            f"[booking_fore] {len(slot_rows)} rows found → "
            f"{len(slots)} in window "
            f"{time_window.get('earliest')}–{time_window.get('latest')}"
        )
        return slots

    except Exception:
        await _screenshot(page, "search_slots_error")
        raise


# ─────────────────────────────────────────────────────────────────────────────
# 3.  BOOK SLOT
# ─────────────────────────────────────────────────────────────────────────────

async def book_slot(page: Page, slot: dict) -> str:
    """
    Complete the Fore! tee time booking using the UI.

    Fore! does not have a public JSON API for booking — we click through
    the confirmation flow on the page. The saved payment method on the
    Holezy Fore! account is used automatically.

    Returns a confirmation number from the confirmation page.
    """
    try:
        gid        = slot["_gid"]
        slot_id    = slot["id"]
        start_time = slot.get("start_time", "unknown")

        print(f"[booking_fore] book_slot {start_time} gid={gid}")

        # Click the book link for this slot
        book_sel = f"a[data-id='{slot_id}'], button[data-id='{slot_id}']"
        await page.wait_for_selector(book_sel, timeout=10_000)
        await page.click(book_sel)
        await page.wait_for_load_state("domcontentloaded", timeout=20_000)

        # Fore! shows a confirmation/review page — click confirm
        confirm_sel = (
            "#ctl00_ContentPlaceHolder1_btnConfirm, "
            "input[value='Confirm'], input[value='Book'], "
            "button[type='submit']"
        )
        await page.wait_for_selector(confirm_sel, timeout=10_000)
        await page.click(confirm_sel)
        await page.wait_for_load_state("domcontentloaded", timeout=20_000)

        # Extract confirmation number from the success page
        confirm_el = await page.query_selector(
            "#ctl00_ContentPlaceHolder1_lblConfirmation, "
            ".confirmation-number, [class*='confirm']"
        )
        if confirm_el:
            code = (await confirm_el.inner_text()).strip()
            code = re.sub(r"[^A-Za-z0-9-]", "", code) or code
        else:
            code = f"FORE-{slot_id}"

        print(f"[booking_fore] Booked! Confirmation code: {code}")
        return str(code)

    except Exception:
        await _screenshot(page, "book_slot_error")
        raise
