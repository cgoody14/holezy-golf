# =============================================================================
# booking_golfnow.py
# =============================================================================
# GolfNow Playwright booking engine for Holezy.
#
# Same public interface as booking_chronogolf.py:
#
#   login(page, email, password)
#   search_slots(page, course_url, date, players, time_window) → list[dict]
#   book_slot(page, slot) → str   (returns confirmation code)
#
# course_url format expected in scheduled_jobs.course_url:
#   "https://www.golfnow.com/tee-times/facility/12345-course-name#filter"
#   or bare facility ID: "12345"
#
# GolfNow API notes:
#   - Auth: POST /api/account/login  (JSON body)
#   - Tee times: GET /api/tee-times/tee-time-results (query params)
#   - Reserve: POST /api/tee-times/reserve
#   - Confirm: POST /api/tee-times/confirm
# =============================================================================

import json
import re
import asyncio
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv, find_dotenv
from playwright.async_api import Page

load_dotenv(find_dotenv())


GOLFNOW_BASE = "https://www.golfnow.com"
LOGIN_URL    = f"{GOLFNOW_BASE}/account/login"

_API_HEADERS = {
    "Accept":           "application/json, text/plain, */*",
    "Content-Type":     "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "Origin":           GOLFNOW_BASE,
    "Referer":          f"{GOLFNOW_BASE}/",
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

def _extract_facility_id(course_url: str) -> str:
    """
    Extract GolfNow numeric facility ID from a URL or bare ID string.

    Accepted formats:
      "12345"
      "https://www.golfnow.com/tee-times/facility/12345-some-course-name"
      "https://www.golfnow.com/tee-times/facility/12345"
    """
    s = str(course_url).strip()
    if s.isdigit():
        return s
    match = re.search(r"/facility/(\d+)", s)
    if match:
        return match.group(1)
    raise ValueError(
        f"Cannot extract GolfNow facility ID from '{course_url}'. "
        "Store course_url as 'https://www.golfnow.com/tee-times/facility/<id>' "
        "in the scheduled_jobs table."
    )


def _time_to_minutes(hhmm: str) -> int:
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m


async def _screenshot(page: Page, label: str) -> None:
    ts   = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = str(SCREENSHOT_DIR / f"holezy_golfnow_{label}_{ts}.png")
    try:
        await page.screenshot(path=path, full_page=True)
        print(f"[booking_golfnow] Screenshot → {path}")
    except Exception as ss_err:
        print(f"[booking_golfnow] Screenshot failed: {ss_err}")


# ─────────────────────────────────────────────────────────────────────────────
# 1.  LOGIN
# ─────────────────────────────────────────────────────────────────────────────

async def login(page: Page, email: str, password: str) -> None:
    """
    Authenticate with GolfNow via their login form.

    GolfNow uses a React SPA — we wait for the email/password inputs to
    appear, fill them, submit, and wait for the redirect/auth cookie.
    """
    try:
        print(f"[booking_golfnow] login → {LOGIN_URL}")
        await page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=30_000)

        await page.wait_for_selector("input[type='email'], input[name='email'], #email", timeout=15_000)
        await page.fill("input[type='email'], input[name='email'], #email", email)

        await page.wait_for_selector("input[type='password'], input[name='password'], #password", timeout=5_000)
        await page.fill("input[type='password'], input[name='password'], #password", password)

        async with page.expect_response(
            lambda r: (
                ("login" in r.url or "session" in r.url or "auth" in r.url)
                and r.request.method in ("POST", "post")
            ),
            timeout=20_000,
        ) as resp_info:
            await page.click("button[type='submit'], input[type='submit']")

        resp = await resp_info.value
        if not resp.ok:
            body = await resp.text()
            raise RuntimeError(
                f"GolfNow login failed (HTTP {resp.status}): {body[:300]}"
            )

        print(f"[booking_golfnow] Authenticated as {email}")

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
    Fetch available tee times from GolfNow's tee-times API.

    Returns a list of slot dicts with the same shape as booking_chronogolf,
    plus _facility_id and _player_count injected for use by book_slot.
    """
    try:
        facility_id = _extract_facility_id(course_url)
        url = f"{GOLFNOW_BASE}/api/tee-times/tee-time-results"
        params = {
            "facilityId": facility_id,
            "date":        date,
            "players":     str(players),
            "holes":       "18",
        }

        print(
            f"[booking_golfnow] search_slots facility={facility_id} "
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
            print(f"[booking_golfnow] Tee times API → HTTP {resp.status}: {body[:300]}")
            return []

        raw = await resp.json()

        # GolfNow returns {teeTimes: [...]} or a bare array
        if isinstance(raw, list):
            slots_raw = raw
        elif isinstance(raw, dict):
            slots_raw = (
                raw.get("teeTimes")
                or raw.get("tee_times")
                or raw.get("results")
                or []
            )
        else:
            slots_raw = []

        slots: list[dict] = []
        for s in slots_raw:
            rate = s.get("rate") or {}
            slots.append({
                "id":              str(s.get("teeTimeId") or s.get("id", "")),
                "start_time":      s.get("time") or s.get("startTime") or s.get("teeTime", ""),
                "green_fee":       (
                    rate.get("greenFeePerPlayer")
                    or s.get("greenFee")
                    or s.get("price")
                    or 0
                ),
                "available_spots": s.get("maxPlayers") or s.get("availableSpots") or 4,
                "nb_holes":        s.get("holes") or 18,
                "rate_type":       rate.get("name") or s.get("rateType") or "standard",
                "_facility_id":    facility_id,
                "_player_count":   players,
            })

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
                # GolfNow may return times as "08:30" without a date
                try:
                    parts     = start.split(":")
                    slot_mins = int(parts[0]) * 60 + int(parts[1][:2])
                except Exception:
                    continue

            if (earliest_mins <= slot_mins <= latest_mins
                    and slot["available_spots"] >= players):
                filtered.append(slot)

        print(
            f"[booking_golfnow] {len(slots_raw)} raw slots → "
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
    Reserve and confirm a tee time via GolfNow's API.

    Uses the saved payment method on the GolfNow company account.
    Returns a confirmation code string.
    """
    try:
        facility_id  = slot["_facility_id"]
        player_count = slot["_player_count"]
        slot_id      = slot["id"]
        start_time   = slot.get("start_time", "unknown")

        print(f"[booking_golfnow] book_slot {start_time} facility={facility_id} players={player_count}")

        # ── Step 1: Reserve (hold) the slot ──────────────────────────────
        reserve_url  = f"{GOLFNOW_BASE}/api/tee-times/reserve"
        reserve_body = json.dumps({
            "teeTimeId":  slot_id,
            "facilityId": facility_id,
            "players":    player_count,
            "holes":      slot.get("nb_holes", 18),
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
                f"GolfNow reservation POST failed (HTTP {res.status}): {body[:400]}"
            )

        res_data       = await res.json()
        reservation_id = (
            res_data.get("reservationId")
            or res_data.get("id")
            or (res_data.get("reservation") or {}).get("id")
        )
        if not reservation_id:
            raise RuntimeError(
                f"No reservation ID in GolfNow response. Got keys: {list(res_data.keys())}"
            )

        print(f"[booking_golfnow] Reservation created id={reservation_id} — confirming...")

        # ── Step 2: Confirm with saved payment method ─────────────────────
        confirm_url  = f"{GOLFNOW_BASE}/api/tee-times/confirm"
        confirm_body = json.dumps({
            "reservationId": reservation_id,
            "paymentMethod": "saved",
        })

        conf = await page.request.post(
            confirm_url,
            data=confirm_body,
            headers=_API_HEADERS,
            timeout=20_000,
        )

        if not conf.ok:
            body = await conf.text()
            raise RuntimeError(
                f"GolfNow confirmation POST failed (HTTP {conf.status}): {body[:400]}"
            )

        conf_data = await conf.json()
        code = (
            conf_data.get("confirmationNumber")
            or conf_data.get("confirmation_number")
            or conf_data.get("bookingNumber")
            or str(reservation_id)
        )

        print(f"[booking_golfnow] Booked! Confirmation code: {code}")
        return str(code)

    except Exception:
        await _screenshot(page, "book_slot_error")
        raise
