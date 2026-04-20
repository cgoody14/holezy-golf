# =============================================================================
# booking.py
# =============================================================================
# ChronoGolf Playwright booking engine for Holezy.
#
# Three async functions consumed by scheduler.py:
#
#   login(page, email, password)
#       Navigates ChronoGolf's login form. After this call the browser
#       session is authenticated and page.request carries auth cookies.
#
#   search_slots(page, course_url, date, players, time_window)
#       Calls ChronoGolf's widget API via page.request (inherits browser
#       session). Returns a filtered list of available tee time slot dicts.
#       Each slot includes _club_id and _player_count so it can be passed
#       directly to book_slot without extra context.
#
#   book_slot(page, slot)
#       POSTs to ChronoGolf's reservation + confirm endpoints using the
#       golfer's saved payment method. Returns a confirmation code string.
#
# Rules enforced throughout:
#   - headless=True is set in scheduler.py (browser is created there)
#   - Never time.sleep() — only page.wait_for_selector() or asyncio.sleep()
#   - On any exception: take a screenshot to /tmp/, log, then re-raise
#   - load_dotenv(find_dotenv()) at module level
# =============================================================================

import json
import re
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv, find_dotenv
from playwright.async_api import Page, Error as PlaywrightError

load_dotenv(find_dotenv())


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────────────────────────────────────

CHRONO_BASE = "https://www.chronogolf.com"
LOGIN_URL   = f"{CHRONO_BASE}/users/sign_in"

# Headers that mirror what ChronoGolf's own widget sends.
# page.request automatically adds cookies/session on top of these.
_API_HEADERS = {
    "Accept":           "application/json, text/plain, */*",
    "Content-Type":     "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "Origin":           CHRONO_BASE,
    "Referer":          f"{CHRONO_BASE}/",
    "User-Agent": (
        "Mozilla/5.0 (X11; Linux x86_64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}

SCREENSHOT_DIR = Path("/tmp")

# Playwright selector tried in order for email/password fields.
# ChronoGolf uses Devise (Rails), so standard Devise IDs are first.
_EMAIL_SELECTORS = [
    "#user_email",
    "input[name='user[email]']",
    "input[type='email']",
]
_PASSWORD_SELECTORS = [
    "#user_password",
    "input[name='user[password]']",
    "input[type='password']",
]
_SUBMIT_SELECTORS = [
    "input[type='submit']",
    "button[type='submit']",
]


# ─────────────────────────────────────────────────────────────────────────────
# PRIVATE HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _extract_club_id(course_url: str) -> str:
    """
    Extract the ChronoGolf numeric club ID from a URL or bare ID string.

    Accepted formats:
      "1482"
      "https://www.chronogolf.com/club/1482"
      "https://www.chronogolf.com/club/rattlesnake-point/1482"

    For slug-only URLs (no numeric ID), store the numeric club ID in the
    scheduled_jobs.course_url column as:  https://www.chronogolf.com/club/{id}
    """
    s = str(course_url).strip()
    if s.isdigit():
        return s
    match = re.search(r"/(?:club|clubs)/(\d+)", s)
    if match:
        return match.group(1)
    raise ValueError(
        f"Cannot extract numeric ChronoGolf club ID from '{course_url}'. "
        "Store course_url as 'https://www.chronogolf.com/club/<numeric_id>' "
        "in the scheduled_jobs table."
    )


def _time_to_minutes(hhmm: str) -> int:
    """'HH:MM' → minutes since midnight."""
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m


def _first_selector(selectors: list[str]) -> str:
    """Return a comma-joined CSS selector string (Playwright tries each)."""
    return ", ".join(selectors)


async def _screenshot(page: Page, label: str) -> None:
    """Capture a timestamped screenshot to /tmp/ for post-mortem debugging."""
    ts   = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = str(SCREENSHOT_DIR / f"holezy_{label}_{ts}.png")
    try:
        await page.screenshot(path=path, full_page=True)
        print(f"[booking] Screenshot → {path}")
    except Exception as ss_err:
        print(f"[booking] Screenshot failed: {ss_err}")


# ─────────────────────────────────────────────────────────────────────────────
# 1.  LOGIN
# ─────────────────────────────────────────────────────────────────────────────

async def login(page: Page, email: str, password: str) -> None:
    """
    Navigate ChronoGolf's login form and authenticate.

    After a successful call the browser page carries a valid session;
    all subsequent page.request calls will include the auth cookies.

    Raises RuntimeError on bad credentials or unexpected HTTP status.
    Raises PlaywrightError / TimeoutError on navigation problems.
    """
    try:
        print(f"[booking] login → {LOGIN_URL}")
        await page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=30_000)

        # ── Fill email ────────────────────────────────────────────────────
        email_sel = _first_selector(_EMAIL_SELECTORS)
        await page.wait_for_selector(email_sel, timeout=10_000)
        await page.fill(email_sel, email)

        # ── Fill password ─────────────────────────────────────────────────
        pw_sel = _first_selector(_PASSWORD_SELECTORS)
        await page.wait_for_selector(pw_sel, timeout=5_000)
        await page.fill(pw_sel, password)

        # ── Submit and capture the sign-in response ───────────────────────
        # We intercept the POST response so we can inspect the status code
        # without having to parse page state after redirect.
        submit_sel = _first_selector(_SUBMIT_SELECTORS)
        await page.wait_for_selector(submit_sel, timeout=5_000)

        async with page.expect_response(
            lambda r: (
                "sign_in" in r.url
                and r.request.method in ("POST", "post")
            ),
            timeout=20_000,
        ) as resp_info:
            await page.click(submit_sel)

        resp = await resp_info.value
        if not resp.ok:
            body = await resp.text()
            raise RuntimeError(
                f"ChronoGolf login failed (HTTP {resp.status}): {body[:300]}"
            )

        print(f"[booking] Authenticated as {email}")

    except Exception:
        await _screenshot(page, "login_error")
        raise


# ─────────────────────────────────────────────────────────────────────────────
# 2.  SEARCH SLOTS
# ─────────────────────────────────────────────────────────────────────────────

async def search_slots(
    page: Page,
    course_url: str,
    date: str,           # "YYYY-MM-DD"
    players: int,
    time_window: dict,   # {"earliest": "HH:MM", "latest": "HH:MM"}
) -> list[dict]:
    """
    Fetch available tee times from ChronoGolf's widget API.

    Uses page.request so the browser's auth session (cookies) is included
    automatically — no separate token management needed.

    Returns a list of slot dicts filtered to the requested time window and
    player count. Each slot dict has:
        id, start_time, green_fee, available_spots, nb_holes, rate_type,
        _club_id      (injected — needed by book_slot)
        _player_count (injected — needed by book_slot)

    Returns [] when the API is reachable but no matching slots exist.
    Raises on network or unexpected parse errors.
    """
    try:
        club_id = _extract_club_id(course_url)
        url     = f"{CHRONO_BASE}/api/v1/clubs/{club_id}/tee_times"
        params  = {
            "date":       date,
            "nb_holes":   "18",
            "nb_players": str(players),
        }

        print(
            f"[booking] search_slots club={club_id} "
            f"date={date} players={players} window={time_window}"
        )

        resp = await page.request.get(
            url,
            params=params,
            headers=_API_HEADERS,
            timeout=15_000,
        )

        if not resp.ok:
            body = await resp.text()
            print(f"[booking] Tee times API → HTTP {resp.status}: {body[:300]}")
            return []

        raw = await resp.json()

        # Normalise: ChronoGolf returns either a bare array or {tee_times: [...]}
        if isinstance(raw, list):
            slots_raw = raw
        elif isinstance(raw, dict):
            slots_raw = raw.get("tee_times") or raw.get("results") or []
        else:
            slots_raw = []

        # ── Normalise field names ─────────────────────────────────────────
        slots: list[dict] = []
        for s in slots_raw:
            slots.append({
                "id":              str(s.get("id", "")),
                "start_time":      (
                    s.get("start_time")
                    or s.get("datetime")
                    or s.get("tee_time", "")
                ),
                "green_fee":       (
                    s.get("green_fee_per_player")
                    or s.get("price")
                    or s.get("green_fee")
                    or 0
                ),
                "available_spots": (
                    s.get("available_spots")
                    or s.get("nb_available_spots")
                    or 4
                ),
                "nb_holes":        s.get("nb_holes") or 18,
                "rate_type":       (
                    s.get("rate_type")
                    or (s.get("rate") or {}).get("name")
                    or "standard"
                ),
                # Injected context so book_slot needs no extra arguments
                "_club_id":        club_id,
                "_player_count":   players,
            })

        # ── Filter by time window and available spots ─────────────────────
        earliest_mins = _time_to_minutes(time_window.get("earliest", "00:00"))
        latest_mins   = _time_to_minutes(time_window.get("latest",   "23:59"))

        filtered: list[dict] = []
        for slot in slots:
            start = slot["start_time"]
            if not start:
                continue
            try:
                dt        = datetime.fromisoformat(start)
                slot_mins = dt.hour * 60 + dt.minute
            except (ValueError, TypeError):
                continue

            in_window    = earliest_mins <= slot_mins <= latest_mins
            has_spots    = slot["available_spots"] >= players

            if in_window and has_spots:
                filtered.append(slot)

        print(
            f"[booking] {len(slots_raw)} raw slots → "
            f"{len(filtered)} in window "
            f"{time_window.get('earliest')}–{time_window.get('latest')}"
        )
        return filtered

    except Exception:
        await _screenshot(page, "search_slots_error")
        raise


# ─────────────────────────────────────────────────────────────────────────────
# 3.  BOOK SLOT
# ─────────────────────────────────────────────────────────────────────────────

async def book_slot(page: Page, slot: dict) -> str:
    """
    Reserve and confirm a tee time slot via ChronoGolf's widget API.

    Expects slot to have _club_id and _player_count (injected by search_slots).
    Payment is processed using the golfer's saved card on their ChronoGolf
    account — no card data is handled here.

    Returns the confirmation code string on success.
    Raises RuntimeError if the reservation or confirmation step fails.
    """
    try:
        club_id      = slot["_club_id"]
        player_count = slot["_player_count"]
        slot_id      = slot["id"]
        nb_holes     = slot.get("nb_holes", 18)
        start_time   = slot.get("start_time", "unknown")

        print(f"[booking] book_slot {start_time} club={club_id} players={player_count}")

        # ── Step 1: Create reservation (holds the slot) ───────────────────
        reserve_url  = f"{CHRONO_BASE}/api/v1/clubs/{club_id}/reservations"
        reserve_body = json.dumps({
            "reservation": {
                "tee_time_id": slot_id,
                "nb_players":  player_count,
                "nb_holes":    nb_holes,
            }
        })

        res = await page.request.post(
            reserve_url,
            data=reserve_body,
            headers=_API_HEADERS,
            timeout=20_000,
        )

        if not res.ok:
            body = await res.text()
            raise RuntimeError(
                f"Reservation POST failed (HTTP {res.status}): {body[:400]}"
            )

        res_data       = await res.json()
        reservation_id = (
            res_data.get("id")
            or (res_data.get("reservation") or {}).get("id")
        )
        if not reservation_id:
            raise RuntimeError(
                f"No reservation ID in response. Got keys: {list(res_data.keys())}"
            )

        print(f"[booking] Reservation created id={reservation_id} — confirming...")

        # ── Step 2: Confirm and pay ───────────────────────────────────────
        # ChronoGolf charges the golfer's saved card on their account.
        confirm_url  = (
            f"{CHRONO_BASE}/api/v1/clubs/{club_id}"
            f"/reservations/{reservation_id}/confirm"
        )
        confirm_body = json.dumps({"payment_method": "saved_card"})

        conf = await page.request.post(
            confirm_url,
            data=confirm_body,
            headers=_API_HEADERS,
            timeout=20_000,
        )

        if not conf.ok:
            body = await conf.text()
            raise RuntimeError(
                f"Confirmation POST failed (HTTP {conf.status}): {body[:400]}"
            )

        conf_data = await conf.json()
        code = (
            conf_data.get("confirmation_number")
            or conf_data.get("booking_number")
            or (conf_data.get("reservation") or {}).get("confirmation_number")
            or str(reservation_id)   # fallback: reservation ID as reference
        )

        print(f"[booking] Booked! Confirmation code: {code}")
        return str(code)

    except Exception:
        await _screenshot(page, "book_slot_error")
        raise
