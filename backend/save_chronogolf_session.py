#!/usr/bin/env python
# =============================================================================
# save_chronogolf_session.py  —  one-time human login → saved session
# =============================================================================
# ChronoGolf's login form is protected by a CAPTCHA, which a bot cannot solve.
# So you log in ONCE by hand here; this script saves the resulting browser
# session (cookies) to a file. From then on the booking engine loads that file
# and is already authenticated — it never touches the login form again.
#
# Run it whenever the saved session stops working (you'll see a "SessionExpired"
# message from the engine). Sessions typically last days to weeks.
#
#   cd backend
#   python save_chronogolf_session.py
#
# A real Chrome window opens on ChronoGolf's sign-in page. Log in and solve the
# CAPTCHA like normal. Once you're logged in (you can see your account), come
# back to the Terminal and press Enter. The session is saved to
# chronogolf_state.json (gitignored — it's like a password, keep it private).
# =============================================================================

import asyncio
import os
from playwright.async_api import async_playwright

STATE_FILE = os.getenv("CHRONOGOLF_STATE", "chronogolf_state.json")
CHRONO_BASE = "https://www.chronogolf.com"


async def main() -> int:
    print("=" * 64)
    print("Holezy · save ChronoGolf session")
    print("A Chrome window will open. Log in + solve the CAPTCHA, then come")
    print("back here and press Enter to save your session.")
    print("=" * 64)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()
        await page.goto(f"{CHRONO_BASE}/users/sign_in", wait_until="domcontentloaded")

        # Wait for the human to finish logging in.
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None, input, "\n👉 Log in in the browser, then press Enter here… "
        )

        # Confirm we're actually authenticated before saving.
        sess = await page.request.get(
            f"{CHRONO_BASE}/marketplace/sessions",
            headers={"Accept": "application/json", "X-Requested-With": "XMLHttpRequest"},
        )
        ok = False
        who = None
        if sess.ok:
            data = await sess.json()
            who = data.get("email")
            ok = bool(data.get("id"))

        if not ok:
            print("\n⚠  Doesn't look logged in yet (no active session detected).")
            again = await loop.run_in_executor(
                None, input, "   Finish logging in, then press Enter to try again (or type 'q' to quit): "
            )
            if again.strip().lower() == "q":
                await browser.close()
                return 1

        await context.storage_state(path=STATE_FILE)
        await browser.close()
        print(f"\n✅ Session saved to {STATE_FILE}" + (f" (logged in as {who})" if who else ""))
        print("   You can now run test_book_chronogolf.py — it will reuse this session.")
        return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
