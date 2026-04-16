# =============================================================================
# booking_supreme.py
# =============================================================================
# Supreme Golf Playwright booking engine for Holezy.
#
# Same public interface as booking_chronogolf.py:
#
#   login(page, email, password)
#   search_slots(page, course_url, date, players, time_window) → list[dict]
#   book_slot(page, slot) → str   (returns confirmation code)
#
# Supreme Golf is an aggregator that surfaces tee times from GolfNow,
# TeeOff, and direct course systems in one place. Booking through Supreme
# Golf redirects to the underlying platform for payment — we intercept
# that flow here.
#
# course_url format expected in scheduled_jobs.course_url:
#   "https://www.supremegolf.com/golf-courses/course-name/12345"
#   or bare course slug: "course-name/12345"
#
# Supreme Golf API notes:
#   - Auth: POST /api/v3/users/sign_in  (JSON)
#   - Tee times: GET /api/v3/tee_times (query params)
#   - Reserve: POST /api/v3/reservations
#   - Confirm: POST /api/v3/reservations/{id}/confirm
# =============================================================================

import json
import re
import asyncio
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv, find_dotenv
from playwright.async_api import Page

load_dotenv(find_dotenv())


SUPREME_BASE = "https://www.supremegolf.com"
LOGIN_URL    = f"{SUPREME_BASE}/login"

_API_HEADERS = {
    "Accept":           "application/json, text/plain, */*",
    "Content-Type":     "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "Origin":           SUPREME_BASE,
    "Referer":          f"{SUPREME_BASE}/",
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

def _extract_course_id(course_url: str) -> str:
    """
    Extract Supreme Golf course ID from a URL or bare ID string.

    Accepted formats:
      "12345"
      "https://www.supremegolf.com/golf-courses/course-name/12345"
      "course-name/12345"
    """
    s = str(course_url).strip()
    if s.isdigit():
        return s
    # Numeric ID at the end of the path
    match = re.search(r"/(\d+)(?:[/?#]|$)", s)
    if match:
        return match.group(1)
    raise ValueError(
        f"Cannot extract Supreme Golf course ID from '{course_url}'. "
        "Store course_url as 'https://www.supremegolf.com/golf-courses/<slug>/<id>' "
        "in the scheduled_jobs table."
    )


def _time_to_minutes(hhmm: str) -> int:
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m


async def _screenshot(page: Page, label: str) -> None:
    ts   = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = str(SCREENSHOT_DIR / f"holezy_supreme_{label}_{ts}.png")
    try:
        await page.screenshot(path=path, full_page=True)
        print(f"[booking_supreme] Screenshot → {path}")
    except Exception as ss_err:
        print(f"[booking_supreme] Screenshot failed: {ss_err}")


# ─────────────────────────────────────────────────────────────────────────────
# 1.  LOGIN
# ─────────────────────────────────────────────────────────────────────────────

async def login(page: Page, email: str, password: str) -> None:
    """
    Authenticate with Supreme Golf.

    Supreme Golf is a React SPA — we navigate the login form and wait
    for the auth token to be stored in browser storage.
    """
    try:
        print(f"[booking_supreme] login → {LOGIN_URL}")
        await page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=30_000)

        await page.wait_for_selector(
            "input[type='email'], input[name='email'], #email, input[placeholder*='email' i]",
            timeout=15_000,
        )
        await page.fill(
            "input[type='email'], input[name='email'], #email, input[placeholder*='email' i]",
            email,
        )

        await page.wait_for_selector(
            "input[type='password'], input[name='password'], #password",
            timeout=5_000,
        )
        await page.fill(
            "input[type='password'], input[name='password'], #password",
            password,
        )

        async with page.expect_response(
            lambda r: (
                ("sign_in" in r.url or "login" in r.url or "session" in r.url)
                and r.request.method in ("POST", "post")
            ),
            timeout=20_000,
        ) as resp_info:
            await page.click("button[type='submit'], input[type='submit']")

        resp = await resp_info.value
        if not resp.ok:
            body = await resp.text()
            raise RuntimeError(
                f"Supreme Golf login failed (HTTP {resp.status}): {body[:300]}"
            )

        print(f"[booking_supreme] Authenticated as {email}")

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
    Fetch available tee times from Supreme Golf's API.

    Supreme Golf returns aggregated results from multiple underlying platforms.
    Each slot includes a source_platform field indicating where the tee time
    came from (golfnow, teeoff, etc.) — stored in the slot dict for reference.
    """
    try:
        course_id = _extract_course_id(course_url)
        url = f"{SUPREME_BASE}/api/v3/tee_times"
        params = {
            "course_id": course_id,
            "date":      date,
            "players":   str(players),
            "holes":     "18",
        }

        print(
            f"[booking_supreme] search_slots course={course_id} "
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
            print(f"[booking_supreme] Tee times API → HTTP {resp.status}: {body[:300]}")
            return []

        raw = await resp.json()

        if isinstance(raw, list):
            slots_raw = raw
        elif isinstance(raw, dict):
            slots_raw = (
                raw.get("tee_times")
                or raw.get("teeTimes")
                or raw.get("results")
                or []
            )
        else:
            slots_raw = []

        earliest_mins = _time_to_minutes(time_window.get("earliest", "00:00"))
        latest_mins   = _time_to_minutes(time_window.get("latest",   "23:59"))

        slots: list[dict] = []
        for s in slots_raw:
            start = s.get("tee_time") or s.get("time") or s.get("startTime", "")
            if not start:
                continue
            try:
                dt        = datetime.fromisoformat(start)
                slot_mins = dt.hour * 60 + dt.minute
            except (ValueError, TypeError):
                try:
                    parts     = start.split(":")
                    slot_mins = int(parts[0]) * 60 + int(parts[1][:2])
                except Exception:
                    continue

            available = s.get("available_spots") or s.get("availableSpots") or s.get("maxPlayers") or 4
            if not (earliest_mins <= slot_mins <= latest_mins and available >= players):
                continue

            slots.append({
                "id":               str(s.get("id") or s.get("teeTimeId", "")),
                "start_time":       start,
                "green_fee":        s.get("price") or s.get("green_fee") or s.get("greenFee") or 0,
                "available_spots":  available,
                "nb_holes":         s.get("holes") or 18,
                "rate_type":        s.get("rate_type") or s.get("rateType") or "standard",
                "source_platform":  s.get("source") or s.get("provider") or "supreme",
                "_course_id":       course_id,
                "_player_count":    players,
            })

        print(
            f"[booking_supreme] {len(slots_raw)} raw slots → "
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
    Reserve and confirm a tee time via Supreme Golf's API.

    Supreme Golf handles payment routing to the underlying platform.
    The saved payment method on the Holezy Supreme Golf account is used.
    Returns a confirmation code string.
    """
    try:
        course_id    = slot["_course_id"]
        player_count = slot["_player_count"]
        slot_id      = slot["id"]
        start_time   = slot.get("start_time", "unknown")

        print(f"[booking_supreme] book_slot {start_time} course={course_id} players={player_count}")

        # ── Step 1: Create reservation ────────────────────────────────────
        reserve_url  = f"{SUPREME_BASE}/api/v3/reservations"
        reserve_body = json.dumps({
            "tee_time_id": slot_id,
            "course_id":   course_id,
            "players":     player_count,
            "holes":       slot.get("nb_holes", 18),
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
                f"Supreme Golf reservation POST failed (HTTP {res.status}): {body[:400]}"
            )

        res_data       = await res.json()
        reservation_id = res_data.get("id") or (res_data.get("reservation") or {}).get("id")
        if not reservation_id:
            raise RuntimeError(
                f"No reservation ID in Supreme Golf response. Got keys: {list(res_data.keys())}"
            )

        print(f"[booking_supreme] Reservation created id={reservation_id} — confirming...")

        # ── Step 2: Confirm with saved payment method ─────────────────────
        confirm_url  = f"{SUPREME_BASE}/api/v3/reservations/{reservation_id}/confirm"
        confirm_body = json.dumps({"payment_method": "saved"})

        conf = await page.request.post(
            confirm_url,
            data=confirm_body,
            headers=_API_HEADERS,
            timeout=20_000,
        )

        if not conf.ok:
            body = await conf.text()
            raise RuntimeError(
                f"Supreme Golf confirmation POST failed (HTTP {conf.status}): {body[:400]}"
            )

        conf_data = await conf.json()
        code = (
            conf_data.get("confirmation_number")
            or conf_data.get("confirmationNumber")
            or conf_data.get("booking_number")
            or str(reservation_id)
        )

        print(f"[booking_supreme] Booked! Confirmation code: {code}")
        return str(code)

    except Exception:
        await _screenshot(page, "book_slot_error")
        raise
