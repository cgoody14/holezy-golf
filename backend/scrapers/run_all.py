# =============================================================================
# scrapers/run_all.py
# =============================================================================
# Run all course scrapers and report results.
#
# Usage:
#   python -m scrapers.run_all                        # all platforms
#   python -m scrapers.run_all golfnow                # single platform
#   python -m scrapers.run_all golfnow teeoff         # specific platforms
#   python -m scrapers.run_all golfnow --workers 5    # parallel state workers
# =============================================================================

import importlib
import sys
import time
from concurrent.futures import ProcessPoolExecutor, as_completed
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

# Platforms whose scrapers accept a states list for parallel splitting
_STATE_AWARE = {"golfnow", "teeoff", "fore", "supreme"}

_US_STATES = [
    "al","ak","az","ar","ca","co","ct","de","fl","ga",
    "hi","id","il","in","ia","ks","ky","la","me","md",
    "ma","mi","mn","ms","mo","mt","ne","nv","nh","nj",
    "nm","ny","nc","nd","oh","ok","or","pa","ri","sc",
    "sd","tn","tx","ut","vt","va","wa","wv","wi","wy","dc",
]


def _run_states(platform: str, states: list[str]) -> int:
    """Worker function: runs one platform scraper for a subset of states."""
    load_dotenv(find_dotenv())
    mod = importlib.import_module(SCRAPERS[platform])
    return mod.run(states)


def _run_platform_parallel(platform: str, workers: int) -> int:
    """Split US states across N workers and run in parallel."""
    chunks: list[list[str]] = [[] for _ in range(workers)]
    for i, state in enumerate(_US_STATES):
        chunks[i % workers].append(state)

    total = 0
    with ProcessPoolExecutor(max_workers=workers) as pool:
        futures = {pool.submit(_run_states, platform, chunk): chunk for chunk in chunks if chunk}
        for future in as_completed(futures):
            try:
                total += future.result()
            except Exception as e:
                print(f"  [{platform}] Worker error: {e}")
    return total


def main():
    args    = sys.argv[1:]
    workers = 5  # default parallel workers for state-aware scrapers

    # Parse --workers flag
    if "--workers" in args:
        idx     = args.index("--workers")
        workers = int(args[idx + 1])
        args    = [a for i, a in enumerate(args) if i not in (idx, idx + 1)]

    targets = args if args else list(SCRAPERS.keys())
    invalid = [t for t in targets if t not in SCRAPERS]
    if invalid:
        print(f"Unknown platform(s): {invalid}")
        print(f"Valid: {list(SCRAPERS.keys())}")
        sys.exit(1)

    print("=" * 60)
    print("  Holezy Course Scraper")
    print(f"  {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    print(f"  Platforms: {', '.join(targets)}  |  Workers: {workers}")
    print("=" * 60)

    results = {}
    for platform in targets:
        print(f"\n── {platform.upper()} {'─' * (50 - len(platform))}")
        t0 = time.time()
        try:
            if platform in _STATE_AWARE and workers > 1:
                print(f"  Running with {workers} parallel workers…")
                count = _run_platform_parallel(platform, workers)
            else:
                mod   = importlib.import_module(SCRAPERS[platform])
                count = mod.run()
            elapsed = time.time() - t0
            results[platform] = ("OK", count, elapsed)
        except Exception as e:
            elapsed = time.time() - t0
            results[platform] = ("FAIL", 0, elapsed)
            print(f"  [{platform}] ERROR: {e}")

    print("\n" + "=" * 60)
    print("  Summary")
    print("=" * 60)
    for platform, (status, count, elapsed) in results.items():
        print(f"  {status:4}  {platform:12}  {count:6} courses  ({elapsed:.1f}s)")
    print("=" * 60)


if __name__ == "__main__":
    main()
