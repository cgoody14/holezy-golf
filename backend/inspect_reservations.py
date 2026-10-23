#!/usr/bin/env python
# =============================================================================
# inspect_reservations.py  —  READ-ONLY probe to find ChronoGolf's
# "list my reservations" endpoint. Books nothing, changes nothing.
#
# ChronoGolf's reservation POST returns a 500 even when the booking actually
# succeeds, so the engine needs to CONFIRM the booking by looking it up after.
# This script finds which endpoint returns your bookings (and their field
# names) so we can wire that confirmation correctly.
#
# Run:  python inspect_reservations.py
# =============================================================================

from __future__ import annotations

import asyncio
import json
import os

from playwright.async_api import async_playwright

CHRONO_BASE = "https://www.chronogolf.com"
STATE_FILE  = os.getenv("CHRONOGOLF_STATE", "chronogolf_state.json")

HEADERS = {
    "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest",
}


async def main() -> int:
    if not os.path.exists(STATE_FILE):
        print(f"❌ No saved session ({STATE_FILE}). Run import_chronogolf_cookies.py first.")
        return 2

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        ctx = await browser.new_context(storage_state=STATE_FILE)
        page = await ctx.new_page()

        # who are we
        s = await page.request.get(f"{CHRONO_BASE}/marketplace/sessions", headers=HEADERS)
        me = await s.json() if s.ok else {}
        uid = me.get("id")
        print(f"logged in as {me.get('email')} (id={uid})\n")

        candidates = [
            f"/marketplace/users/{uid}/reservations?page=1",
            f"/marketplace/reservations?page=1",
            f"/marketplace/reservations?state=upcoming&page=1",
            f"/marketplace/users/{uid}/reservations?state=upcoming&page=1",
            f"/marketplace/v2/reservations?page=1",
        ]
        for path in candidates:
            try:
                r = await page.request.get(f"{CHRONO_BASE}{path}", headers=HEADERS)
                body = await r.text()
            except Exception as e:
                print(f"[{path}]  ERROR {e}")
                continue
            print(f"[{path}]  HTTP {r.status}")
            if r.ok:
                try:
                    data = json.loads(body)
                except Exception:
                    data = None
                if isinstance(data, list) and data:
                    print(f"   → list of {len(data)} items; first item keys: {list(data[0].keys())}")
                    print(f"   → first item sample: {json.dumps(data[0])[:400]}")
                elif isinstance(data, dict):
                    print(f"   → dict keys: {list(data.keys())}")
                    print(f"   → sample: {json.dumps(data)[:400]}")
                else:
                    print(f"   → body: {body[:200]}")
            else:
                print(f"   → {body[:150]}")
            print()

        await browser.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
