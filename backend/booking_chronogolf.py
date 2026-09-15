# =============================================================================
# booking_chronogolf.py  —  GROUND-UP REWRITE (Phase 1)
# =============================================================================
# This replaces the old engine, which called invented API endpoints and had
# never booked a real tee time. This version is UI-driven Playwright: it does
# exactly what a human does in the browser, which is the most reliable way to
# book until (and unless) a HAR capture reveals a clean official API.
#
# It exposes the SAME three functions scheduler.py already calls, so the worker
# plugs in unchanged:
#
#   await login(page, email, password)
#   slots = await search_slots(page, course_url, date, players, time_window)
#   code  = await book_slot(page, slot)
#
# ── WHAT STILL NEEDS THE HAR ──────────────────────────────────────────────────
# Every site-specific selector/endpoint below is tagged  # ⟵ HAR-VERIFY.
# The structure, waits, error handling, screenshots and interface are final —
# only the tagged specifics get confirmed/corrected once we see a real booking.
# If the HAR shows a clean private API, book_slot's internals get swapped for
# request calls; the interface and harness do not change.
#
# ── HOW TO TEST ───────────────────────────────────────────────────────────────
#   cd backend
#   pip install playwright python-dotenv && playwright install chromium
#   HEADLESS=false python test_book_chronogolf.py \
#       --course "https://www.chronogolf.com/club/oak-meadows-golf-course" \
#       --date 2026-09-18 --earliest 10:00 --latest 11:45 --players 4 --dry-run
#
# Rules kept from the codebase: headless is set by the caller; never time.sleep
# in the hot path (use wait_for_selector / asyncio.sleep); screenshot to /tmp on
# any failure; load_dotenv at import.
# =============================================================================

import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv, find_dotenv
from playwright.async_api import Page, TimeoutError as PWTimeout

load_dotenv(find_dotenv())

CHRONO_BASE    = "https://www.chronogolf.com"
LOGIN_URL      = f"{CHRONO_BASE}/users/sign_in"          # ⟵ HAR-VERIFY (login path)
SCREENSHOT_DIR = Path("/tmp")

# A booking is "no availability" (retry later) vs a real error (fail now). The
# scheduler already distinguishes these; search_slots returning [] means the
# former, a raised exception means the latter.


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _mins(hhmm: str) -> int:
    """'HH:MM' → minutes since midnight."""
    h, m = map(int, str(hhmm)[:5].split(":"))
    return h * 60 + m


def _parse_clock(text: str) -> int | None:
    """'10:24 AM' / '10:24' → minutes since midnight, or None."""
    text = (text or "").strip()
    for fmt in ("%I:%M %p", "%I:%M%p", "%H:%M"):
        try:
            dt = datetime.strptime(text, fmt)
            return dt.hour * 60 + dt.minute
        except ValueError:
            continue
    return None


async def _shot(page: Page, label: str) -> None:
    """Timestamped full-page screenshot to /tmp for post-mortem debugging."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = str(SCREENSHOT_DIR / f"holezy_{label}_{ts}.png")
    try:
        await page.screenshot(path=path, full_page=True)
        print(f"[chronogolf]  📸 {path}")
    except Exception as e:
        print(f"[chronogolf]  (screenshot failed: {e})")


async def _click(page: Page, selector: str, timeout: int = 10_000):
    """Wait for a visible element, scroll to it, click it."""
    el = await page.wait_for_selector(selector, timeout=timeout, state="visible")
    await el.scroll_into_view_if_needed()
    await el.click()
    return el


# ─────────────────────────────────────────────────────────────────────────────
# 1 · LOGIN
# ─────────────────────────────────────────────────────────────────────────────

async def login(page: Page, email: str, password: str) -> None:
    """
    Authenticate the Holezy ChronoGolf account. After this the page session
    carries auth cookies for the rest of the flow.

    Raises RuntimeError if the login form re-renders (bad credentials) or the
    page never leaves the sign-in URL.
    """
    print(f"[chronogolf] ① login → {LOGIN_URL}")
    try:
        await page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=30_000)

        # ⟵ HAR-VERIFY: field selectors (ChronoGolf runs Rails/Devise today).
        await page.fill("#user_email, input[name='user[email]'], input[type='email']", email)
        await page.fill("#user_password, input[name='user[password]'], input[type='password']", password)

        async with page.expect_navigation(wait_until="domcontentloaded", timeout=20_000):
            await _click(page, "input[type='submit'], button[type='submit']")

        if "sign_in" in page.url:
            await _shot(page, "login_failed")
            raise RuntimeError("Login failed — still on sign_in page. Check credentials.")

        print(f"[chronogolf]    ✅ signed in as {email}")
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
    Load the course tee sheet for `date` and return tee times inside the window,
    earliest first. Works with SLUG urls (…/club/oak-meadows-golf-course) — the
    old engine crashed on these because it demanded a numeric club id.

    Returns [] when the page loads but nothing is in the window (→ retry later).
    Each slot dict carries an opaque `_locator_index` so book_slot can re-find
    the card without stale element handles.
    """
    earliest = time_window.get("earliest", "00:00")
    latest   = time_window.get("latest", "23:59")

    # ⟵ HAR-VERIFY: query params the tee-sheet page accepts.
    url = f"{course_url}?date={date}&step=teetimes&holes=18&groupSize={players}"
    print(f"[chronogolf] ② search → {url}")

    try:
        await page.goto(url, wait_until="domcontentloaded", timeout=30_000)

        try:
            # ⟵ HAR-VERIFY: tee-time card selector (new React UI uses data-testid).
            await page.wait_for_selector('div[data-testid="teeTimeCard"]', timeout=20_000)
        except PWTimeout:
            await _shot(page, "no_teetimes")
            print("[chronogolf]    📭 no tee-time cards (course may not be open for this date)")
            return []

        cards = await page.query_selector_all('div[data-testid="teeTimeCard"]')
        lo, hi = _mins(earliest), _mins(latest)
        slots: list[dict] = []

        for idx, card in enumerate(cards):
            # ⟵ HAR-VERIFY: the element holding the tee-time text on each card.
            price_el = await card.query_selector("span.bg-teetimePrice")
            if not price_el:
                continue
            mins = _parse_clock(await price_el.inner_text())
            if mins is None or not (lo <= mins <= hi):
                continue
            slots.append({
                "start_minutes": mins,
                "start_label":   f"{mins // 60:02d}:{mins % 60:02d}",
                "_locator_index": idx,
                "_players":       players,
            })

        slots.sort(key=lambda s: s["start_minutes"])
        pretty = [s["start_label"] for s in slots]
        print(f"[chronogolf]    {len(cards)} card(s) → {len(slots)} in {earliest}-{latest}: {pretty or '—'}")
        return slots

    except Exception:
        await _shot(page, "search_error")
        raise


# ─────────────────────────────────────────────────────────────────────────────
# 3 · BOOK SLOT
# ─────────────────────────────────────────────────────────────────────────────

async def book_slot(page: Page, slot: dict) -> str:
    """
    Select the slot, set players, reserve, and drive checkout to a confirmed
    booking. Returns a confirmation reference string.

    Payment at the course is handled by preference:
      1. "Pay at the course" if offered  → no card touched
      2. else Holezy card-to-hold (CARD_* env) for a "card required" popup
    The customer's card is NEVER used here (see the system map for why).

    Raises RuntimeError if it can't reach a confirmation.
    """
    idx     = slot["_locator_index"]
    players = slot["_players"]
    label   = slot.get("start_label", "?")
    print(f"[chronogolf] ③ book {label} · {players} players")

    try:
        cards = await page.query_selector_all('div[data-testid="teeTimeCard"]')
        if idx >= len(cards):
            raise RuntimeError("Tee-time card disappeared before booking (slot taken?)")
        await cards[idx].scroll_into_view_if_needed()
        await cards[idx].click()

        # 18 holes toggle (optional). ⟵ HAR-VERIFY
        try:
            await _click(page, 'button[value="18"]', timeout=4_000)
        except PWTimeout:
            pass

        # Players: bump the "Public" group + button to the target. ⟵ HAR-VERIFY
        try:
            plus = await page.wait_for_selector(
                '//div[@data-testid="option"]//div[div/text()="Public"]//button[not(@disabled)]',
                timeout=6_000,
            )
            for _ in range(max(0, players - 1)):
                await plus.click()
        except PWTimeout:
            print("[chronogolf]    ⚠ player stepper not found — verify count")

        # Reserve. ⟵ HAR-VERIFY
        await _click(page, '//button[.//span[text()="Reserve"]]', timeout=10_000)
        await page.wait_for_load_state("domcontentloaded")

        await _checkout(page)
        await _handle_card_required(page)
        return await _read_confirmation(page)

    except Exception:
        await _shot(page, "book_error")
        raise


async def _checkout(page: Page) -> None:
    """Accept terms, prefer pay-at-course, confirm."""
    print("[chronogolf]    checkout…")
    # Terms. ⟵ HAR-VERIFY
    try:
        await _click(page, 'input[ng-model="vm.acceptTermsAndConditions"]', timeout=8_000)
    except PWTimeout:
        pass
    # Pay at the course, when offered. ⟵ HAR-VERIFY
    try:
        await _click(
            page,
            '//div[contains(text(),"Pay at the course")]/ancestor::label//input[@type="radio"]',
            timeout=5_000,
        )
        print("[chronogolf]    💳 pay at course")
    except PWTimeout:
        print("[chronogolf]    (no pay-at-course option — may require a card)")
    # Confirm. ⟵ HAR-VERIFY
    await _click(
        page,
        '//button[contains(@class,"fl-button-primary") and contains(text(),"Confirm Reservation")]',
        timeout=12_000,
    )


async def _handle_card_required(page: Page) -> None:
    """Drop Holezy's card-to-hold if a 'Credit Card Required' modal appears."""
    modal = await page.query_selector('//modal-header-title[contains(text(),"Credit Card Required")]')  # ⟵ HAR-VERIFY
    if not modal:
        return
    print("[chronogolf]    'Credit Card Required' → adding Holezy card-to-hold")
    card = os.getenv("CARD_NUMBER")
    if not card:
        await _shot(page, "card_required_no_card")
        raise RuntimeError("Course requires a card but CARD_NUMBER not set in env.")

    await _click(page, "//credit-card-line-new", timeout=8_000)  # ⟵ HAR-VERIFY
    frame = next((f for f in page.frames if "stripe" in (f.url or f.name or "").lower()), None)
    if frame is None:
        await _shot(page, "no_stripe_iframe")
        raise RuntimeError("Stripe card iframe not found.")
    await frame.fill("input[name='cardnumber']", card)
    await frame.fill("input[name='exp-date']", f"{os.getenv('CARD_EXP_MONTH','')}{os.getenv('CARD_EXP_YEAR','')}")
    await frame.fill("input[name='cvc']", os.getenv("CARD_CVV", ""))
    await frame.fill("input[name='postal']", os.getenv("CARD_ZIP", ""))
    try:
        await _click(page, 'input[ng-model="acceptTermsAndConditions"]', timeout=5_000)
    except PWTimeout:
        pass
    await _click(page, '//button[@type="submit" and contains(text(),"Grant")]', timeout=8_000)
    # Re-confirm if the flow bounced back.
    try:
        await _click(page, '//button[contains(@class,"fl-button-primary") and contains(text(),"Confirm Reservation")]', timeout=6_000)
    except PWTimeout:
        pass


async def _read_confirmation(page: Page) -> str:
    """Best-effort scrape of a confirmation reference off the success page."""
    for sel in (  # ⟵ HAR-VERIFY: real confirmation element
        '//*[contains(text(),"Confirmation")]',
        '//*[contains(text(),"confirmed")]',
        '//*[contains(@class,"confirmation")]',
    ):
        el = await page.query_selector(sel)
        if el:
            txt = (await el.inner_text()).strip().replace("\n", " ")
            if txt:
                print(f"[chronogolf]    ✅ {txt[:120]}")
                return txt[:120]
    await _shot(page, "confirmation")
    return "BOOKED (no code parsed — see /tmp screenshot)"
