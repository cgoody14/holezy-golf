#!/usr/bin/env python
# =============================================================================
# test_book_chronogolf.py  —  manual test harness for the ChronoGolf engine
# =============================================================================
# Drive one booking end-to-end against a real course, visibly, so you can watch
# every step and screenshots land in /tmp. This is how you validate the engine
# BEFORE it ever touches a customer's scheduled_jobs row.
#
# Requires backend/.env with:  CHRONOGOLF_EMAIL, CHRONOGOLF_PASSWORD
#   (and CARD_* only for courses that force a card-to-hold)
#
# Examples
#   # Watch it run, stop right before the final confirm (safe — books nothing):
#   HEADLESS=false python test_book_chronogolf.py \
#       --course "https://www.chronogolf.com/club/oak-meadows-golf-course" \
#       --date 2026-09-18 --earliest 10:00 --latest 11:45 --players 4 --dry-run
#
#   # Real booking (removes the dry-run guard):
#   python test_book_chronogolf.py --course "<url>" --date 2026-09-20 \
#       --earliest 07:00 --latest 12:00 --players 2
# =============================================================================

import argparse
import asyncio
import os
import sys

from dotenv import load_dotenv, find_dotenv
from playwright.async_api import async_playwright

import booking_chronogolf as engine

load_dotenv(find_dotenv())


def _args():
    p = argparse.ArgumentParser(description="Test the Holezy ChronoGolf booking engine against one course.")
    p.add_argument("--course",   required=True, help="ChronoGolf course URL (slug or numeric id both fine)")
    p.add_argument("--date",     required=True, help="Booking date YYYY-MM-DD")
    p.add_argument("--earliest", default="06:00", help="Earliest acceptable tee time HH:MM (default 06:00)")
    p.add_argument("--latest",   default="18:00", help="Latest acceptable tee time HH:MM (default 18:00)")
    p.add_argument("--players",  type=int, default=2, help="Number of players (default 2)")
    p.add_argument("--dry-run",  action="store_true",
                   help="Do everything EXCEPT the final booking (find + select only). Safe to run anytime.")
    return p.parse_args()


async def main() -> int:
    a = _args()

    state_file = os.getenv("CHRONOGOLF_STATE", "chronogolf_state.json")
    if not os.path.exists(state_file):
        print(f"❌ No saved session ({state_file}).")
        print("   Export your ChronoGolf cookies once, then run:  python import_chronogolf_cookies.py")
        return 2

    headless = os.getenv("HEADLESS", "true").lower() != "false"
    slow_mo  = int(os.getenv("SLOW_MO_MS", "0"))

    print("=" * 66)
    print(f"Holezy engine test · {a.course}")
    print(f"{a.date} · {a.earliest}-{a.latest} · {a.players} players"
          f"{'  [DRY RUN — will not book]' if a.dry_run else ''}")
    print("=" * 66)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=headless, slow_mo=slow_mo,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        context = await browser.new_context(storage_state=state_file)   # ← reuse your saved login
        page = await context.new_page()
        try:
            await engine.login(page)   # verifies the saved session

            slots = await engine.search_slots(
                page, a.course, a.date, a.players,
                {"earliest": a.earliest, "latest": a.latest},
            )
            if not slots:
                print("\n📭 No tee times in window. (In production the scheduler retries at release time.)")
                return 0

            print(f"\n🎯 Best slot in window: {slots[0]['start_label']}")

            if a.dry_run:
                print("🛑 Dry run — stopping before booking. Engine reached the slot cleanly.")
                await engine._shot(page, "dryrun_stop")
                return 0

            code = await engine.book_slot(page, slots[0])
            print(f"\n🎉 BOOKED — confirmation: {code}")
            return 0

        except Exception as e:
            print(f"\n❌ FAILED: {e}")
            print("   Check the /tmp/holezy_*.png screenshots to see where it stopped.")
            return 1
        finally:
            if not headless:
                await asyncio.sleep(2)  # let you see the final state
            await browser.close()


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
