# =============================================================================
# booking_teeoff.py
# =============================================================================
# TeeOff.com Playwright booking engine for Holezy.
#
# Same public interface as booking_chronogolf.py:
#
#   login(page, email, password)
#   search_slots(page, course_url, date, players, time_window) → list[dict]
#   book_slot(page, slot) → str   (returns confirmation code)
#
# course_url format expected in scheduled_jobs.course_url:
#   "https://www.teeoff.com/tee-times/facility/12345-course-slug/daily-results"
#   or bare facility ID: "12345"
#
# TeeOff API notes (EZLinks platform):
#   - Auth: POST /auth/sign_in  (JSON)
#   - Tee times: GET /api/v1/tee_times (query params)
#   - Reserve: POST /api/v1/reservations
#   - Confirm: POST /api/v1/reservations/{id}/purchase
# =============================================================================

import json
import re
import asyncio
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv, find_dotenv
from playwright.async_api import Page

load_dotenv(find_dotenv())


TEEOFF_BASE = "https://www.teeoff.com"
LOGIN_URL   = f"{TEEOFF_BASE}/auth/sign_in"

_API_HEADERS = {
    "Accept":           "application/json, text/plain, */*",
    "Content-Type":     "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "Origin":           TEEOFF_BASE,
    "Referer":          f"{TEEOFF_BASE}/",
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
    Extract TeeOff numeric facility ID from a URL or bare ID string.

    Accepted formats:
      "12345"
      "https://www.teeoff.com/tee-times/facility/12345-course-name/daily-results"
      "https://www.teeoff.com/tee-times/facility/12345"
    """
    s = str(course_url).strip()
    if s.isdigit():
        return s
    match = re.search(r"/facility/(\d+)", s)
    if match:
        return match.group(1)
    raise ValueError(
        f"Cannot extract TeeOff facility ID from '{course_url}'. "
        "Store course_url as 'https://www.teeoff.com/tee-times/facility/<id>' "
        "in the scheduled_jobs table."
    )


def _time_to_minutes(hhmm: str) -> int:
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m


async def _screenshot(page: Page, label: str) -> None:
    ts   = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = str(SCREENSHOT_DIR / f"holezy_teeoff_{label}_{ts}.png")
    try:
        await page.screenshot(path=path, full_page=True)
        print(f"[booking_teeoff] Screenshot → {path}")
    except Exception as ss_err:
        print(f"[booking_teeoff] Screenshot failed: {ss_err}")


# ─────────────────────────────────────────────────────────────────────────────
# 1.  LOGIN
# ─────────────────────────────────────────────────────────────────────────────

async def login(page: Page, email: str, password: str) -> None:
    """
    Authenticate with TeeOff (EZLinks platform).

    TeeOff uses a token-based auth — the sign_in endpoint returns a
    bearer token which the browser stores and includes on subsequent requests.
    We navigate the login form so the browser handles token storage naturally.
    """
    try:
        print(f"[booking_teeoff] login → {LOGIN_URL}")
        await page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=30_000)

        await page.wait_for_selector("input[type='email'], input[name='email'], #email", timeout=15_000)
        await page.fill("input[type='email'], input[name='email'], #email", email)

        await page.wait_for_selector("input[type='password'], input[name='password'], #password", timeout=5_000)
        await page.fill("input[type='password'], input[name='password'], #password", password)

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
                f"TeeOff login failed (HTTP {resp.status}): {body[:300]}"
            )

        print(f"[booking_teeoff] Authenticated as {email}")

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
    Fetch available tee times from TeeOff's API.
    """
    try:
        facility_id = _extract_facility_id(course_url)
        url = f"{TEEOFF_BASE}/api/v1/tee_times"
        params = {
            "facility_id": facility_id,
            "date":         date,
            "players":      str(players),
            "holes":        "18",
        }

        print(
            f"[booking_teeoff] search_slots facility={facility_id} "
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
            print(f"[booking_teeoff] Tee times API → HTTP {resp.status}: {body[:300]}")
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
                "id":              str(s.get("id") or s.get("teeTimeId", "")),
                "start_time":      start,
                "green_fee":       s.get("green_fee") or s.get("greenFee") or s.get("price") or 0,
                "available_spots": available,
                "nb_holes":        s.get("holes") or 18,
                "rate_type":       s.get("rate_type") or s.get("rateType") or "standard",
                "_facility_id":    facility_id,
                "_player_count":   players,
            })

        print(
            f"[booking_teeoff] {len(slots_raw)} raw slots → "
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
    Reserve and confirm a tee time via TeeOff's API.
    Returns a confirmation code string.
    """
    try:
        facility_id  = slot["_facility_id"]
        player_count = slot["_player_count"]
        slot_id      = slot["id"]
        start_time   = slot.get("start_time", "unknown")

        print(f"[booking_teeoff] book_slot {start_time} facility={facility_id} players={player_count}")

        # ── Step 1: Create reservation ────────────────────────────────────
        reserve_url  = f"{TEEOFF_BASE}/api/v1/reservations"
        reserve_body = json.dumps({
            "tee_time_id": slot_id,
            "facility_id": facility_id,
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
                f"TeeOff reservation POST failed (HTTP {res.status}): {body[:400]}"
            )

        res_data       = await res.json()
        reservation_id = res_data.get("id") or (res_data.get("reservation") or {}).get("id")
        if not reservation_id:
            raise RuntimeError(
                f"No reservation ID in TeeOff response. Got keys: {list(res_data.keys())}"
            )

        print(f"[booking_teeoff] Reservation created id={reservation_id} — purchasing...")

        # ── Step 2: Purchase with saved payment method ────────────────────
        purchase_url  = f"{TEEOFF_BASE}/api/v1/reservations/{reservation_id}/purchase"
        purchase_body = json.dumps({"payment_method": "saved"})

        conf = await page.request.post(
            purchase_url,
            data=purchase_body,
            headers=_API_HEADERS,
            timeout=20_000,
        )

        if not conf.ok:
            body = await conf.text()
            raise RuntimeError(
                f"TeeOff purchase POST failed (HTTP {conf.status}): {body[:400]}"
            )

        conf_data = await conf.json()
        code = (
            conf_data.get("confirmation_number")
            or conf_data.get("confirmationNumber")
            or conf_data.get("booking_number")
            or str(reservation_id)
        )

        print(f"[booking_teeoff] Booked! Confirmation code: {code}")
        return str(code)

    except Exception:
        await _screenshot(page, "book_slot_error")
        raise
