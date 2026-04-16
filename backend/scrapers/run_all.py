# =============================================================================
# scrapers/run_all.py
# =============================================================================
# Run all course scrapers in sequence and report results.
#
# Usage:
#   cd backend/
#   python -m scrapers.run_all                 # all platforms
#   python -m scrapers.run_all chronogolf      # single platform
#   python -m scrapers.run_all golfnow teeoff  # specific platforms
# =============================================================================

import sys
import time
from datetime import datetime, timezone

from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

SCRAPERS = {
    "chronogolf": "scrapers.scrape_chronogolf",
    "golfnow":    "scrapers.scrape_golfnow",
    "teeoff":     "scrapers.scrape_teeoff",
    "fore":       "scrapers.scrape_fore",
    "supreme":    "scrapers.scrape_supreme",
}


def main():
    targets = sys.argv[1:] if len(sys.argv) > 1 else list(SCRAPERS.keys())
    invalid = [t for t in targets if t not in SCRAPERS]
    if invalid:
        print(f"Unknown platform(s): {invalid}")
        print(f"Valid: {list(SCRAPERS.keys())}")
        sys.exit(1)

    print("=" * 60)
    print("  Holezy Course Scraper")
    print(f"  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"  Platforms: {', '.join(targets)}")
    print("=" * 60)

    results = {}
    for platform in targets:
        print(f"\n── {platform.upper()} {'─' * (50 - len(platform))}")
        t0 = time.time()
        try:
            import importlib
            mod    = importlib.import_module(SCRAPERS[platform])
            count  = mod.run()
            elapsed = time.time() - t0
            results[platform] = ("OK", count, elapsed)
        except Exception as e:
            elapsed = time.time() - t0
            results[platform] = ("FAIL", 0, elapsed)
            print(f"  [{platform}] ERROR: {e}")

    # Summary
    print("\n" + "=" * 60)
    print("  Summary")
    print("=" * 60)
    for platform, (status, count, elapsed) in results.items():
        print(f"  {status:4}  {platform:12}  {count:6} courses  ({elapsed:.1f}s)")
    print("=" * 60)


if __name__ == "__main__":
    main()
