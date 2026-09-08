# =============================================================================
# examples/book_oak_meadows_example.py
# =============================================================================
# A CONCRETE, END-TO-END ChronoGolf booking flow — built around one real course
# so you can watch every step happen and tune selectors against the live site.
#
# Example scenario (edit CONFIG below to change):
#   Course : Oak Meadows Golf Course
#   URL    : https://www.chronogolf.com/club/oak-meadows-golf-course
#   Date   : 2026-09-18  (Sept 18, morning)
#   Window : 10:00–11:45 AM  (pick the EARLIEST tee time in this range)
#   Players: 4
#   Holes  : 18
#   Pay    : Prefer "Pay at the course"; if the course forces a card, drop
#            Holezy's card-to-hold (CARD_* env vars) — never the customer's.
#
# This targets the NEW React ChronoGolf UI (div[data-testid="teeTimeCard"]),
# which is what the URL above renders. It mirrors the proven Selenium
# book_url_1 flow, rewritten in async Playwright to match backend/ conventions.
#
# ── HOW TO RUN ───────────────────────────────────────────────────────────────
#   cd backend
#   pip install playwright python-dotenv && playwright install chromium
#   # put credentials in backend/.env (see keys below)
#   HEADLESS=false python examples/book_oak_meadows_example.py
#
#   Run with HEADLESS=false the first few times so you can SEE each step and
#   fix any selector the site has changed. Flip to true for automation.
#
# ── REQUIRED ENV (backend/.env) ──────────────────────────────────────────────
#   CHRONOGOLF_EMAIL      your Holezy ChronoGolf account email
#   CHRONOGOLF_PASSWORD   that account's password
#   # Only needed for "Credit Card Required" courses (card-to-hold):
#   CARD_NUMBER  CARD_EXP_MONTH  CARD_EXP_YEAR  CARD_CVV  CARD_ZIP
#
# ── HOW THIS MAPS TO THE WORKER ──────────────────────────────────────────────
#   login()        -> same role as booking_chronogolf.login()
#   find_slots()   -> same role as booking_chronogolf.search_slots()
#   book_slot()    -> same role as booking_chronogolf.book_slot()
#   Once tuned, drop these into backend/booking_chronogolf.py (UI variant) and
#   scheduler.py drives them unchanged.
# =============================================================================

import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv, find_dotenv
from playwright.async_api import async_playwright, Page, TimeoutError as PWTimeout

load_dotenv(find_dotenv())


# ─────────────────────────────────────────────────────────────────────────────
# CONFIG — the example booking. Change these to book anything else.
# ─────────────────────────────────────────────────────────────────────────────

COURSE_URL     = "https://www.chronogolf.com/club/oak-meadows-golf-course"
BOOKING_DATE   = "2026-09-18"     # YYYY-MM-DD
EARLIEST_TIME  = "10:00"          # HH:MM (24h)
LATEST_TIME    = "11:45"          # HH:MM (24h)
PLAYER_COUNT   = 4
NB_HOLES       = 18
PREFER_PAY_AT_COURSE = True       # False = go straight to card-hold

HEADLESS   = os.getenv("HEADLESS", "true").lower() != "false"
SLOW_MO_MS = int(os.getenv("SLOW_MO_MS", "0"))   # e.g. 400 to watch it move

SCREENSHOT_DIR = Path("/tmp")


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _mins(hhmm: str) -> int:
    """'HH:MM' → minutes since midnight."""
    h, m = map(int, hhmm.split(":"))
    return h * 60 + m


def _parse_teetime(text: str) -> int | None:
    """'10:24 AM' → minutes since midnight, or None if unparseable."""
    text = text.strip()
    for fmt in ("%I:%M %p", "%I:%M%p", "%H:%M"):
        try:
            dt = datetime.strptime(text, fmt)
            return dt.hour * 60 + dt.minute
        except ValueError:
            continue
    return None


async def _shot(page: Page, label: str) -> None:
    """Timestamped full-page screenshot to /tmp for debugging every step."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = str(SCREENSHOT_DIR / f"holezy_{label}_{ts}.png")
    try:
        await page.screenshot(path=path, full_page=True)
        print(f"   📸 {path}")
    except Exception as e:
        print(f"   (screenshot failed: {e})")


async def _click(page: Page, selector: str, timeout: int = 10_000) -> None:
    """Wait for an element to be clickable, then JS-click it (robust vs overlays)."""
    el = await page.wait_for_selector(selector, timeout=timeout, state="visible")
    await el.scroll_into_view_if_needed()
    await el.click()


# ─────────────────────────────────────────────────────────────────────────────
# STEP 1 — LOGIN
# ─────────────────────────────────────────────────────────────────────────────

async def login(page: Page, email: str, password: str) -> None:
    """Authenticate the Holezy ChronoGolf account so reservations are attributed."""
    print("① Logging in…")
    await page.goto("https://www.chronogolf.com/users/sign_in",
                    wait_until="domcontentloaded", timeout=30_000)

    await page.fill("#user_email, input[name='user[email]'], input[type='email']", email)
    await page.fill("#user_password, input[name='user[password]'], input[type='password']", password)

    async with page.expect_navigation(wait_until="domcontentloaded", timeout=20_000):
        await _click(page, "input[type='submit'], button[type='submit']")

    # Devise re-renders the sign-in form on bad credentials.
    if "sign_in" in page.url:
        await _shot(page, "login_failed")
        raise RuntimeError("Login failed — still on sign_in page. Check credentials.")
    print(f"   ✅ Signed in as {email}")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 2 — OPEN THE COURSE ON THE TARGET DATE & FIND TEE TIMES IN WINDOW
# ─────────────────────────────────────────────────────────────────────────────

async def find_slots(page: Page) -> list[tuple[int, object]]:
    """
    Navigate to the course for BOOKING_DATE, read every tee-time card, and
    return [(minutes_since_midnight, card_handle), …] for cards whose time
    falls inside the requested window — sorted earliest first.
    """
    url = f"{COURSE_URL}?date={BOOKING_DATE}&step=teetimes&holes={NB_HOLES}&groupSize={PLAYER_COUNT}"
    print(f"② Loading tee sheet → {url}")
    await page.goto(url, wait_until="domcontentloaded", timeout=30_000)

    try:
        await page.wait_for_selector('div[data-testid="teeTimeCard"]', timeout=20_000)
    except PWTimeout:
        await _shot(page, "no_teetimes")
        print("   ⚠ No tee-time cards rendered (course may not be open for this date yet).")
        return []

    cards = await page.query_selector_all('div[data-testid="teeTimeCard"]')
    print(f"   Found {len(cards)} tee-time card(s) on the page")

    lo, hi = _mins(EARLIEST_TIME), _mins(LATEST_TIME)
    in_window: list[tuple[int, object]] = []

    for card in cards:
        price_el = await card.query_selector("span.bg-teetimePrice")
        if not price_el:
            continue
        raw = (await price_el.inner_text()) or ""
        mins = _parse_teetime(raw)
        if mins is None:
            continue
        if lo <= mins <= hi:
            in_window.append((mins, card))

    in_window.sort(key=lambda x: x[0])
    pretty = [f"{m // 60:02d}:{m % 60:02d}" for m, _ in in_window]
    print(f"   {len(in_window)} tee time(s) in {EARLIEST_TIME}–{LATEST_TIME}: {pretty or '—'}")
    return in_window


# ─────────────────────────────────────────────────────────────────────────────
# STEP 3 — SELECT SLOT, HOLES, PLAYERS → RESERVE
# ─────────────────────────────────────────────────────────────────────────────

async def select_and_reserve(page: Page, card) -> None:
    """Click the chosen tee-time card, set 18 holes + 4 players, click Reserve."""
    print("③ Selecting tee time…")
    await card.scroll_into_view_if_needed()
    await card.click()

    # 18 holes (button labelled with value="18"). Optional — skip if absent.
    try:
        await _click(page, 'button[value="18"]', timeout=4_000)
        print("   ✅ 18 holes")
    except PWTimeout:
        print("   (holes toggle not shown — using default)")

    # Players: bump the "Public" group's + button until it reads PLAYER_COUNT.
    # The group starts at 1 player, so we click (PLAYER_COUNT - 1) times.
    try:
        plus = await page.wait_for_selector(
            '//div[@data-testid="option"]//div[div/text()="Public"]'
            '//button[not(@disabled)]',
            timeout=6_000,
        )
        for _ in range(max(0, PLAYER_COUNT - 1)):
            await plus.click()
            await asyncio.sleep(0.2)
        print(f"   ✅ {PLAYER_COUNT} players")
    except PWTimeout:
        print("   ⚠ Player stepper not found — verify group count manually.")

    print("   Clicking Reserve…")
    await _click(page, '//button[.//span[text()="Reserve"]]', timeout=10_000)
    await page.wait_for_load_state("domcontentloaded")


# ─────────────────────────────────────────────────────────────────────────────
# STEP 4 — CHECKOUT: TERMS + PAYMENT CHOICE + CONFIRM
# ─────────────────────────────────────────────────────────────────────────────

async def checkout(page: Page) -> None:
    """Accept terms, choose payment, confirm the reservation."""
    print("④ Checkout…")

    # Accept terms & conditions.
    try:
        await _click(page, 'input[ng-model="vm.acceptTermsAndConditions"]', timeout=8_000)
        print("   ☑️ Accepted terms")
    except PWTimeout:
        print("   (no terms checkbox on this checkout)")

    # Prefer "Pay at the course" when the course offers it.
    if PREFER_PAY_AT_COURSE:
        try:
            await _click(
                page,
                '//div[contains(text(),"Pay at the course")]/ancestor::label//input[@type="radio"]',
                timeout=5_000,
            )
            print("   💳 Selected 'Pay at the course' (no card needed)")
        except PWTimeout:
            print("   (no 'Pay at the course' option — course may require a card)")

    # Confirm.
    print("   Clicking Confirm Reservation…")
    await _click(
        page,
        '//button[contains(@class,"fl-button-primary") and contains(text(),"Confirm Reservation")]',
        timeout=12_000,
    )
    await asyncio.sleep(2)


# ─────────────────────────────────────────────────────────────────────────────
# STEP 5 — "CREDIT CARD REQUIRED" POPUP (card-to-hold only)
# ─────────────────────────────────────────────────────────────────────────────

async def handle_card_required(page: Page) -> None:
    """
    Some courses demand a card on file to hold the reservation (no-show
    guarantee). We drop HOLEZY'S card here — never the customer's, and never
    a card pulled from Stripe (Stripe never exposes raw digits).

    No-ops silently if the popup doesn't appear.
    """
    modal = await page.query_selector('//modal-header-title[contains(text(),"Credit Card Required")]')
    if not modal:
        return  # course accepted the reservation without a card

    print("⑤ 'Credit Card Required' popup — adding Holezy card-to-hold…")
    card_number = os.getenv("CARD_NUMBER")
    if not card_number:
        await _shot(page, "card_required_no_card")
        raise RuntimeError(
            "Course requires a card but CARD_NUMBER is not set. "
            "Add Holezy's card-to-hold to backend/.env."
        )

    await _click(page, "//credit-card-line-new", timeout=8_000)

    # Card fields live inside a Stripe iframe.
    frame = None
    for f in page.frames:
        if "stripe" in (f.name or "").lower() or "stripe" in (f.url or "").lower():
            frame = f
            break
    if frame is None:
        await _shot(page, "no_stripe_iframe")
        raise RuntimeError("Could not locate Stripe iframe for card entry.")

    await frame.fill("input[name='cardnumber']", card_number)
    await frame.fill("input[name='exp-date']",
                     f"{os.getenv('CARD_EXP_MONTH','')}{os.getenv('CARD_EXP_YEAR','')}")
    await frame.fill("input[name='cvc']", os.getenv("CARD_CVV", ""))
    await frame.fill("input[name='postal']", os.getenv("CARD_ZIP", ""))
    print("   ✅ Card entered")

    # Back on the main page: accept card terms + Grant.
    try:
        await _click(page, 'input[ng-model="acceptTermsAndConditions"]', timeout=5_000)
    except PWTimeout:
        pass
    await _click(page, '//button[@type="submit" and contains(text(),"Grant")]', timeout=8_000)
    print("   💳 Card granted")
    await asyncio.sleep(2)

    # Re-confirm if the checkout kicked us back to the confirm button.
    try:
        await _click(
            page,
            '//button[contains(@class,"fl-button-primary") and contains(text(),"Confirm Reservation")]',
            timeout=6_000,
        )
    except PWTimeout:
        pass


# ─────────────────────────────────────────────────────────────────────────────
# STEP 6 — READ THE CONFIRMATION
# ─────────────────────────────────────────────────────────────────────────────

async def read_confirmation(page: Page) -> str:
    """Best-effort scrape of a confirmation/booking reference off the success page."""
    print("⑥ Reading confirmation…")
    await asyncio.sleep(2)
    for sel in (
        '//*[contains(text(),"Confirmation")]',
        '//*[contains(text(),"confirmed")]',
        '//*[contains(@class,"confirmation")]',
    ):
        el = await page.query_selector(sel)
        if el:
            txt = (await el.inner_text()).strip().replace("\n", " ")
            if txt:
                print(f"   ✅ {txt[:120]}")
                return txt[:120]
    await _shot(page, "confirmation")
    return "BOOKED (no code parsed — see screenshot)"


# ─────────────────────────────────────────────────────────────────────────────
# ORCHESTRATION
# ─────────────────────────────────────────────────────────────────────────────

async def run() -> None:
    email = os.getenv("CHRONOGOLF_EMAIL")
    password = os.getenv("CHRONOGOLF_PASSWORD")
    if not email or not password:
        raise SystemExit("Set CHRONOGOLF_EMAIL and CHRONOGOLF_PASSWORD in backend/.env")

    print("=" * 64)
    print(f"Holezy booking · Oak Meadows · {BOOKING_DATE} "
          f"{EARLIEST_TIME}-{LATEST_TIME} · {PLAYER_COUNT} players")
    print("=" * 64)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=HEADLESS,
            slow_mo=SLOW_MO_MS,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        page = await browser.new_page()
        try:
            await login(page, email, password)

            slots = await find_slots(page)
            if not slots:
                print("\n📭 No tee times in window. In production: retry at the "
                      "course's release time, then mark 'failed' + auto-refund.")
                return

            _, card = slots[0]           # earliest in window
            await select_and_reserve(page, card)
            await checkout(page)
            await handle_card_required(page)
            code = await read_confirmation(page)

            print("\n🎉 DONE — confirmation:", code)
            # In production, scheduler.py would now:
            #   • update scheduled_jobs.status = 'booked' + confirmation_code
            #   • CAPTURE the customer's Stripe authorization (you get paid)
            #   • email the golfer

        except Exception as e:
            await _shot(page, "fatal")
            print(f"\n❌ Booking failed: {e}")
            # In production: mark 'failed' + CANCEL the Stripe authorization (refund).
            raise
        finally:
            await browser.close()


if __name__ == "__main__":
    asyncio.run(run())
