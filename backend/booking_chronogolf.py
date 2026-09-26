# =============================================================================
# booking_chronogolf.py  —  API-DRIVEN ENGINE (built from a real HAR capture)
# =============================================================================
# ChronoGolf / Lightspeed runs a clean JSON API under /marketplace. This engine
# was reverse-engineered from a REAL, completed booking (ref 2Q0U-2B3K) captured
# in a browser HAR, so the endpoints, payloads and field names below are what
# ChronoGolf actually uses — not guesses.
#
# Strategy: Playwright logs in (establishing the session cookie + CSRF token),
# then every booking step is a direct JSON call via page.request, which inherits
# the browser's cookies automatically. No brittle clicking through the UI.
#
# The three functions scheduler.py already calls, unchanged:
#   await login(page, email, password)
#   slots = await search_slots(page, course_url, date, players, time_window)
#   code  = await book_slot(page, slot)
#
# ── THE REAL FLOW (confirmed from the HAR) ────────────────────────────────────
#   1. login (UI)  → session cookie; then GET /marketplace/sessions for user id,
#      and read <meta name="csrf-token"> for the CSRF token.
#   2. GET  /marketplace/v2/teetimes?start_date=&course_ids=<uuid>&holes=18
#          → { status, teetimes:[ { id, start_time, max_player_size,
#                                   default_price:{ subtotal, player_type_id } } ] }
#   3. POST /marketplace/reservations/options  { nb_holes, teetime_id,
#          rounds_attributes:[{affiliation_type_id}×players], source, medium }
#          → preview with club_id, club{}, rounds[].round_lines[] (product ids + price)
#   4. POST /marketplace/reservations  { reservation:{ …, rounds_attributes[] } }
#          with X-CSRF-Token header → 201 { id, booking_reference }
#
# ── PAYMENT ───────────────────────────────────────────────────────────────────
# The captured course booked with force_online_payment=false — no card at
# checkout (pay at the course). If a course returns force_online_payment=true,
# this engine raises RequiresOnlinePayment so the caller can route it to the
# Stripe-Issuing path (a later phase) instead of failing silently.
# =============================================================================

import asyncio
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv, find_dotenv
from playwright.async_api import Page, TimeoutError as PWTimeout

load_dotenv(find_dotenv())

CHRONO_BASE    = "https://www.chronogolf.com"
LOGIN_URL      = f"{CHRONO_BASE}/users/sign_in"
SCREENSHOT_DIR = Path("/tmp")

# ChronoGolf gates its login form with a CAPTCHA, so a bot can't log in from
# scratch. Instead a human logs in once (save_chronogolf_session.py) and the
# resulting cookies are saved as a Playwright storage_state file; every run
# loads that state and is already authenticated. STATE_FILE is that file.
STATE_FILE = os.getenv("CHRONOGOLF_STATE", "chronogolf_state.json")


class RequiresOnlinePayment(Exception):
    """Raised when a course forces online payment (needs the card/Issuing path)."""


class SessionExpired(Exception):
    """Raised when no valid ChronoGolf session is loaded (re-run save_chronogolf_session.py)."""


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _mins(hhmm: str) -> int:
    """'8:20' / '08:20' / '08:20:00' → minutes since midnight."""
    parts = str(hhmm).strip().split(":")
    return int(parts[0]) * 60 + int(parts[1])


async def _shot(page: Page, label: str) -> None:
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = str(SCREENSHOT_DIR / f"holezy_{label}_{ts}.png")
    try:
        await page.screenshot(path=path, full_page=True)
        print(f"[chronogolf]  📸 {path}")
    except Exception as e:
        print(f"[chronogolf]  (screenshot failed: {e})")


def _api_headers(csrf: str | None = None) -> dict:
    h = {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": CHRONO_BASE,
        "Referer": f"{CHRONO_BASE}/",
    }
    if csrf:
        h["X-CSRF-Token"] = csrf
    return h


# ─────────────────────────────────────────────────────────────────────────────
# 1 · LOGIN  (also captures user id + CSRF token onto the page object)
# ─────────────────────────────────────────────────────────────────────────────

async def login(page: Page, email: str = "", password: str = "") -> None:
    """
    Verify the saved ChronoGolf session (loaded via storage_state at context
    creation) and cache the numeric user id + CSRF token on the page for the
    API calls that follow. Because ChronoGolf's login form has a CAPTCHA, we do
    NOT fill it here — the session comes from a one-time human login captured by
    save_chronogolf_session.py.

    Raises SessionExpired if no valid session is present.
    """
    print("[chronogolf] ① verifying saved session…")
    try:
        # Land on a marketplace page so the CSRF meta tag + cookies are active.
        await page.goto(f"{CHRONO_BASE}/marketplace", wait_until="domcontentloaded", timeout=30_000)

        sess = await page.request.get(f"{CHRONO_BASE}/marketplace/sessions", headers=_api_headers())
        user = await sess.json() if sess.ok else {}
        user_id = user.get("id")
        if not user_id:
            await _shot(page, "session_expired")
            raise SessionExpired(
                "No valid ChronoGolf session (not logged in). "
                "Log in to ChronoGolf in your own browser, export your cookies, and run:  "
                "python import_chronogolf_cookies.py"
            )

        csrf = await page.evaluate(
            "() => { const m = document.querySelector('meta[name=\"csrf-token\"]'); return m ? m.content : null; }"
        )

        page._holezy = {"user_id": user_id, "csrf": csrf,
                        "name": f"{user.get('first_name','')} {user.get('last_name','')}".strip(),
                        "email": user.get("email")}
        print(f"[chronogolf]    ✅ session OK — {user.get('email')} (id={user_id})")
        # CSRF is captured from live API requests during search_slots (below).
    except SessionExpired:
        raise
    except Exception:
        await _shot(page, "login_error")
        raise


# ─────────────────────────────────────────────────────────────────────────────
# 2 · SEARCH SLOTS
# ─────────────────────────────────────────────────────────────────────────────

async def search_slots(
    page: Page,
    course_url: str,
    date: str,                 # "YYYY-MM-DD"
    players: int,
    time_window: dict,         # {"earliest": "HH:MM", "latest": "HH:MM"}
) -> list[dict]:
    """
    Return tee times in the window, earliest first. We let the course page make
    its own /marketplace/v2/teetimes request (which resolves the course UUID for
    us) and read the response — then fall back to a direct API call if needed.

    Each returned slot carries everything book_slot needs:
        teetime_id, start_label, affiliation_type_id, subtotal, _players, _holes
    Returns [] when the API responds but nothing matches (→ retry later).
    """
    earliest = time_window.get("earliest", "00:00")
    latest   = time_window.get("latest", "23:59")
    holes    = "18"

    nav = f"{course_url}?date={date}&nb_holes={holes}"
    print(f"[chronogolf] ② search → {nav}")

    # Capture the CSRF token from the app's own API requests as the page loads.
    # ChronoGolf sends X-CSRF-Token on its XHRs; we collect the requests and read
    # their FULL headers (all_headers() — the sync .headers property drops custom
    # headers) after load. book_slot needs this token for the POSTs.
    seen_reqs: list = []
    def _collect(req):
        if "chronogolf.com" in req.url:
            seen_reqs.append(req)
    page.on("request", _collect)

    data = None
    try:
        # Let the SPA fire its own teetimes call and capture the response — this
        # avoids having to know the course UUID up front.
        try:
            async with page.expect_response(
                lambda r: "/marketplace/v2/teetimes?" in r.url and r.status == 200,
                timeout=20_000,
            ) as resp_info:
                await page.goto(nav, wait_until="domcontentloaded", timeout=30_000)
            data = await (await resp_info.value).json()
        except PWTimeout:
            # Fallback: pull the course UUID out of the page and call the API directly.
            uuid = await _course_uuid(page)
            if not uuid:
                await _shot(page, "no_course_uuid")
                print("[chronogolf]    ⚠ could not resolve course UUID from page")
                return []
            url = (f"{CHRONO_BASE}/marketplace/v2/teetimes"
                   f"?start_date={date}&course_ids={uuid}&holes=9%2C18&page=1")
            resp = await page.request.get(url, headers=_api_headers())
            if not resp.ok:
                print(f"[chronogolf]    teetimes API → HTTP {resp.status}")
                return []
            data = await resp.json()

        teetimes = (data or {}).get("teetimes") or []
        lo, hi = _mins(earliest), _mins(latest)
        slots = []
        for t in teetimes:
            st = t.get("start_time")
            if not st:
                continue
            try:
                m = _mins(st)
            except (ValueError, IndexError):
                continue
            if not (lo <= m <= hi):
                continue
            if (t.get("max_player_size") or 4) < players:
                continue
            price = t.get("default_price") or {}
            slots.append({
                "teetime_id":         t.get("id"),
                "start_label":        f"{m // 60:02d}:{m % 60:02d}",
                "start_minutes":      m,
                "affiliation_type_id": price.get("player_type_id"),
                "subtotal":           price.get("subtotal"),
                "_players":           players,
                "_holes":             int(holes),
            })

        slots.sort(key=lambda s: s["start_minutes"])
        pretty = [f"{s['start_label']}(${s['subtotal']})" for s in slots]
        print(f"[chronogolf]    {len(teetimes)} slot(s) → {len(slots)} in {earliest}-{latest}: {pretty or '—'}")

        # Brief settle for a couple more XHRs (NOT networkidle — this SPA never idles).
        await asyncio.sleep(2)

        # Read the CSRF token off any captured API request (full headers).
        csrf, checked = None, 0
        for r in seen_reqs:
            if "/marketplace" not in r.url and "/private_api" not in r.url:
                continue
            try:
                h = await r.all_headers()
            except Exception:
                continue
            checked += 1
            if h.get("x-csrf-token"):
                csrf = h["x-csrf-token"]
                break
        if csrf:
            try:
                page._holezy["csrf"] = csrf
            except Exception:
                pass
        print(f"[chronogolf]    csrf for booking: {'captured ✅' if csrf else 'NOT captured ⚠'} "
              f"(checked {checked} api requests)")

        # Always print diagnostics this run so we can pinpoint the token source.
        try:
            metas = await page.evaluate(
                "() => Array.from(document.querySelectorAll('meta')).map(m => (m.name||m.getAttribute('property')||'?') + '=' + (m.content||'').slice(0,24))"
            )
            print(f"[chronogolf]    (debug) meta tags: {metas}")
        except Exception as e:
            print(f"[chronogolf]    (debug) meta read failed: {e}")
        try:
            api_hits = [r.url.split('chronogolf.com')[-1][:55] for r in seen_reqs
                        if '/marketplace' in r.url or '/private_api' in r.url][:14]
            print(f"[chronogolf]    (debug) api requests seen: {api_hits}")
        except Exception:
            pass

        return slots

    except Exception:
        await _shot(page, "search_error")
        raise
    finally:
        try:
            page.remove_listener("request", _collect)
        except Exception:
            pass


async def _course_uuid(page: Page) -> str | None:
    """Best-effort: read the ChronoGolf course UUID the SPA has loaded."""
    try:
        return await page.evaluate(
            """() => {
                const s = document.body.innerHTML.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
                return s ? s[0] : null;
            }"""
        )
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# 3 · BOOK SLOT
# ─────────────────────────────────────────────────────────────────────────────

async def book_slot(page: Page, slot: dict) -> str:
    """
    Reserve `slot` for `_players` players. Returns the ChronoGolf booking
    reference (e.g. "2Q0U-2B3K"). Raises RequiresOnlinePayment if the course
    forces online payment; raises RuntimeError on any API failure.
    """
    holezy      = getattr(page, "_holezy", {}) or {}
    csrf        = holezy.get("csrf")
    user_id     = holezy.get("user_id")
    teetime_id  = slot["teetime_id"]
    players     = slot["_players"]
    holes       = slot.get("_holes", 18)
    aff_id      = slot["affiliation_type_id"]
    label       = slot.get("start_label", "?")
    print(f"[chronogolf] ③ book {label} · {players} players · teetime={teetime_id}")

    if not csrf:
        raise RuntimeError(
            "No CSRF token — call search_slots first (it captures the token from ChronoGolf's API)."
        )

    try:
        # ── Step A: reservation options → the exact line items + club info ────
        options_body = {
            "nb_holes": str(holes),
            "rounds_attributes": [
                {"affiliation_type_id": str(aff_id), "extras": [], "discounts": []}
                for _ in range(players)
            ],
            "source": "chronogolf",
            "medium": "profile",
            "teetime_id": str(teetime_id),
        }
        opt_resp = await page.request.post(
            f"{CHRONO_BASE}/marketplace/reservations/options",
            data=json.dumps(options_body), headers=_api_headers(csrf), timeout=20_000,
        )
        if not opt_resp.ok:
            body = await opt_resp.text()
            raise RuntimeError(f"reservations/options → HTTP {opt_resp.status}: {body[:300]}")
        preview = await opt_resp.json()
        preview = preview[0] if isinstance(preview, list) else preview

        if preview.get("force_online_payment"):
            raise RequiresOnlinePayment(
                f"Course requires online payment for teetime {teetime_id} — route to the card path."
            )

        club       = preview.get("club") or {}
        club_id    = preview.get("club_id") or club.get("id")
        rounds_in  = preview.get("rounds") or []
        if not rounds_in:
            raise RuntimeError("options returned no rounds — slot may be gone")

        # ── Step B: build the reservation from the preview's line items ───────
        rounds_attributes = []
        for i, r in enumerate(rounds_in):
            lines = []
            for ln in (r.get("round_lines") or []):
                lines.append({
                    "id": None, "round_id": None, "discount_id": None,
                    "discount_rule_id": None, "kit_id": None, "kit_reference": None,
                    "product_id": ln.get("product_id"),
                    "product_rule_id": ln.get("product_rule_id"),
                    "original_unit_price": ln.get("original_unit_price", ln.get("unit_price")),
                    "unit_price": ln.get("unit_price"),
                    "quantity": ln.get("quantity", 1),
                    "refunded_at": None, "refundable": False,
                    "unit_quantity": ln.get("unit_quantity", 1),
                })
            rounds_attributes.append({
                "id": None,
                "affiliation_type_id": r.get("affiliation_type_id", aff_id),
                "guest": None, "reservation_id": None, "state": "reserved",
                "raincheck_issued_at": None,
                "user_id": user_id if i == 0 else None,   # booker on the first round only
                "cancelled_at": None, "requires_payment": r.get("requires_payment", True),
                "check_in_medium": None, "check_in_kiosk_id": None, "checked_in_at": None,
                "fully_refunded": False,
                "round_lines_attributes": lines,
            })

        reservation = {
            "reservation": {
                "club_id": club_id, "teetime_id": teetime_id, "recurrence_id": None,
                "state": "confirmed", "holes": holes,
                "eligible_for_mobile_self_check_in": False, "made_online": True,
                "origin_reservation_id": None, "created_user_id": None,
                "reminder_chronodeal_chosen_at": None, "source": "chronogolf",
                "online_note": None, "booking_reference": None, "confirmed_at": None,
                "cancellable": True, "editable": True, "force_online_payment": False,
                "discount_type": None,
                "club": {"id": club_id, "name": club.get("name"),
                         "currency_code": club.get("currency_code", "USD")},
                "lottery_choices_attributes": None,
                "rounds_attributes": rounds_attributes,
            }
        }

        # ── Step C: create the reservation ───────────────────────────────────
        res = await page.request.post(
            f"{CHRONO_BASE}/marketplace/reservations",
            data=json.dumps(reservation), headers=_api_headers(csrf), timeout=25_000,
        )
        if res.status not in (200, 201):
            body = await res.text()
            raise RuntimeError(f"reservations POST → HTTP {res.status}: {body[:400]}")
        confirmed = await res.json()
        ref = confirmed.get("booking_reference") or str(confirmed.get("id") or "")
        print(f"[chronogolf]    ✅ BOOKED — reference {ref} (reservation {confirmed.get('id')})")
        return ref

    except RequiresOnlinePayment:
        raise
    except Exception:
        await _shot(page, "book_error")
        raise
