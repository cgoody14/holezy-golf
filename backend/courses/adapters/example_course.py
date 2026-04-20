# =============================================================================
# HOW TO ADD A NEW ONE-OFF COURSE
# =============================================================================
# 1. Copy this file:  cp example_course.py my_course_name.py
# 2. Set course_id to match the platform_course_id in Course_Database
# 3. Set course_name to the human-readable course name
# 4. Fill in login(), search_slots(), book_slot() for this course's website
# 5. Add ONE line to registry.py:
#      from .adapters import my_course_name  # noqa: F401
# That's it. Nothing else changes.
# =============================================================================

import asyncio

from playwright.async_api import Page

from courses.base import BaseCourseAdapter
from courses.registry import register


@register
class PineviewGolfClubAdapter(BaseCourseAdapter):

    course_id   = "pineview-golf-club"   # must match platform_course_id in Course_Database
    course_name = "Pineview Golf Club"

    # ── STEP 1: Login ─────────────────────────────────────────────────────────
    async def login(self, page: Page, credentials: dict) -> bool:
        """
        HOW TO FIND LOGIN SELECTORS:
        1. Open DevTools (F12) → Elements tab
        2. Click the username field, note its id= or name= attribute
        3. Do the same for password field and submit button
        4. Update the selectors below
        """
        await page.goto("https://www.pineviewgolf.com/login", wait_until="networkidle")

        # Fill in credentials — replace selectors with what DevTools shows
        await page.fill("#email",    credentials["email"])
        await page.fill("#password", credentials["password"])
        await page.click('button[type="submit"]')

        # Wait for redirect / dashboard element that confirms login succeeded
        try:
            await page.wait_for_selector(".dashboard-header", timeout=10_000)
            return True
        except Exception:
            return False

    # ── STEP 2: Search ────────────────────────────────────────────────────────
    async def search_slots(
        self,
        page: Page,
        date: str,
        players: int,
        time_window: tuple[str, str],
    ) -> list[dict]:
        """
        HOW TO FIND AVAILABLE TEE TIMES:
        1. Open DevTools → Network tab → filter by XHR/Fetch
        2. Manually search for a tee time on the site
        3. Look for the API call that returns tee time data (usually JSON)
        4. Copy the URL and params; replicate with page.request.get() or
           just navigate to the booking page with Playwright and scrape the DOM

        Returns list of slot dicts — include whatever the site gives you.
        The only required keys are "time" and "price"; add others freely.
        """
        earliest, latest = time_window

        # Option A: API call (fastest — check Network tab for an XHR request)
        resp = await page.request.get(
            "https://www.pineviewgolf.com/api/tee-times",
            params={
                "date":    date,
                "players": players,
            },
        )
        if resp.ok:
            data = await resp.json()
            slots = []
            for item in data.get("tee_times", []):
                t = item.get("time", "")
                if earliest <= t <= latest:
                    slots.append({
                        "time":    t,
                        "price":   float(item.get("price", 0)),
                        "slot_id": item.get("id", ""),
                        "holes":   item.get("holes", 18),
                    })
            return slots

        # Option B: DOM scraping fallback (if no clean API)
        # await page.goto(f"https://www.pineviewgolf.com/book?date={date}&players={players}")
        # cards = await page.query_selector_all(".tee-time-card")
        # ...parse each card...
        return []

    # ── STEP 3: Book ──────────────────────────────────────────────────────────
    async def book_slot(self, page: Page, slot: dict, golfer_info: dict) -> dict:
        """
        HOW TO TRACE THE BOOKING FLOW:
        1. In DevTools → Network tab, manually complete a booking
        2. Identify the POST request that submits the reservation
        3. Copy the payload structure
        4. Replicate it with page.request.post() (session cookies carry over)
           OR drive the UI with Playwright clicks/fills

        golfer_info keys: "name", "email", "phone"
        Return {"success": bool, "confirmation": str, "error": str | None}
        """
        try:
            resp = await page.request.post(
                "https://www.pineviewgolf.com/api/reservations",
                data={
                    "slot_id":      slot["slot_id"],
                    "player_count": 2,          # or pass from caller
                    "name":         golfer_info["name"],
                    "email":        golfer_info["email"],
                    "phone":        golfer_info.get("phone", ""),
                },
            )
            if resp.ok:
                body = await resp.json()
                return {
                    "success":      True,
                    "confirmation": body.get("confirmation_number", ""),
                    "error":        None,
                }
            return {"success": False, "confirmation": "", "error": f"HTTP {resp.status}"}
        except Exception as exc:
            return {"success": False, "confirmation": "", "error": str(exc)}

    # ── Optional: pre-search setup ────────────────────────────────────────────
    async def pre_search_hook(self, page: Page) -> None:
        """
        Use this for anything the site needs before searching:
        - accepting cookie banners
        - navigating to a specific booking section
        - waiting for a specific element to load
        """
        await asyncio.sleep(0.5)   # small polite delay; remove if unneeded
