#!/usr/bin/env python3
"""
test_chronogolf_tee_times.py
────────────────────────────
Test script for pulling tee time availability from the ChronoGolf widget API.
No API key or partner credentials required for public clubs.

Requirements:
    pip install requests

Usage:
    # Basic (unauthenticated, public clubs):
    python test_chronogolf_tee_times.py

    # With a specific club and date:
    python test_chronogolf_tee_times.py --club-id 1234 --date 2026-04-15 --players 4

    # Authenticated (needed for some private clubs, or to test booking flow):
    python test_chronogolf_tee_times.py --email you@example.com --password secret

    # Fetch a range of dates:
    python test_chronogolf_tee_times.py --club-id 1234 --date 2026-04-10 --days 7

    # Filter results:
    python test_chronogolf_tee_times.py --earliest 07:00 --latest 12:00 --max-fee 80
"""

import argparse
import json
import os
import sys
from datetime import date, timedelta
from typing import Optional

try:
    import requests
except ImportError:
    print("Error: 'requests' library not found. Install it with:\n  pip install requests")
    sys.exit(1)


# ─────────────────────────────────────────────
# CONSTANTS
# ─────────────────────────────────────────────

CHRONO_BASE = "https://www.chronogolf.com"

BASE_HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Content-Type": "application/json",
    "Origin": "https://www.chronogolf.com",
    "Referer": "https://www.chronogolf.com/",
    "X-Requested-With": "XMLHttpRequest",
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}


# ─────────────────────────────────────────────
# AUTHENTICATION
# ─────────────────────────────────────────────

def login_golfer(email: str, password: str) -> Optional[str]:
    """
    Authenticate with ChronoGolf and return an auth token.
    Only required for private clubs or to proceed to booking.
    """
    url = f"{CHRONO_BASE}/users/sign_in.json"
    payload = {
        "user": {
            "email": email,
            "password": password,
            "remember_me": True,
        }
    }

    print(f"\nLogging in as {email}...")
    resp = requests.post(url, headers=BASE_HEADERS, json=payload, timeout=15)

    if not resp.ok:
        print(f"  Login failed: {resp.status_code} {resp.reason}")
        try:
            print(f"  Response: {resp.json()}")
        except Exception:
            print(f"  Response: {resp.text[:300]}")
        return None

    data = resp.json()
    token = data.get("authentication_token") or (data.get("user") or {}).get("authentication_token")

    if token:
        print(f"  Authenticated. Token: {token[:12]}...")
    else:
        print(f"  Login OK but no token found. Keys returned: {list(data.keys())}")

    return token


# ─────────────────────────────────────────────
# FETCH TEE TIMES
# ─────────────────────────────────────────────

def fetch_tee_times(
    club_id: str,
    date_str: str,
    players: int = 1,
    nb_holes: int = 18,
    auth_token: Optional[str] = None,
) -> list[dict]:
    """
    Fetch available tee times for a club on a given date.

    Args:
        club_id:    ChronoGolf club ID (numeric string)
        date_str:   Date in "YYYY-MM-DD" format
        players:    Number of players (default 1)
        nb_holes:   9 or 18 (default 18)
        auth_token: Optional — most public clubs work without it

    Returns:
        List of normalized tee time dicts.
    """
    params = {
        "date": date_str,
        "nb_holes": str(nb_holes),
        "nb_players": str(players),
    }

    headers = dict(BASE_HEADERS)
    if auth_token:
        headers["X-User-Token"] = auth_token

    url = f"{CHRONO_BASE}/api/v1/clubs/{club_id}/tee_times"
    resp = requests.get(url, headers=headers, params=params, timeout=15)

    if not resp.ok:
        print(f"  Fetch failed: {resp.status_code} {resp.reason}")
        print(f"  URL: {resp.url}")
        try:
            print(f"  Body: {resp.text[:500]}")
        except Exception:
            pass
        return []

    raw = resp.json()
    if isinstance(raw, list):
        slots = raw
    elif isinstance(raw, dict):
        slots = raw.get("tee_times") or raw.get("results") or []
    else:
        slots = []

    normalized = []
    for slot in slots:
        normalized.append({
            "id": str(slot.get("id", "")),
            "start_time": slot.get("start_time") or slot.get("datetime") or slot.get("tee_time", ""),
            "green_fee": slot.get("green_fee_per_player") or slot.get("price") or slot.get("green_fee") or 0,
            "available_spots": slot.get("available_spots") or slot.get("nb_available_spots") or 4,
            "nb_holes": slot.get("nb_holes") or nb_holes,
            "rate_type": slot.get("rate_type") or (slot.get("rate") or {}).get("name") or "standard",
            "_raw": slot,
        })

    return normalized


# ─────────────────────────────────────────────
# FETCH ACROSS A DATE RANGE
# ─────────────────────────────────────────────

def fetch_tee_times_range(
    club_id: str,
    start_date: str,
    days: int,
    players: int = 1,
    nb_holes: int = 18,
    auth_token: Optional[str] = None,
) -> dict[str, list[dict]]:
    """
    Fetch tee times across multiple consecutive dates.

    Returns:
        Dict mapping "YYYY-MM-DD" → list of tee time slots
    """
    results = {}
    start = date.fromisoformat(start_date)

    for i in range(days):
        d = start + timedelta(days=i)
        date_str = d.isoformat()
        print(f"  Fetching {date_str}...", end=" ", flush=True)
        slots = fetch_tee_times(club_id, date_str, players, nb_holes, auth_token)
        print(f"{len(slots)} slot(s)")
        results[date_str] = slots

    return results


# ─────────────────────────────────────────────
# FILTER HELPERS
# ─────────────────────────────────────────────

def filter_tee_times(
    slots: list[dict],
    earliest_time: Optional[str] = None,
    latest_time: Optional[str] = None,
    min_spots: Optional[int] = None,
    max_fee: Optional[float] = None,
) -> list[dict]:
    """
    Filter tee time slots by time window, available spots, or max fee.

    Args:
        earliest_time: "HH:MM" — exclude slots before this time
        latest_time:   "HH:MM" — exclude slots after this time
        min_spots:     minimum available spots needed
        max_fee:       maximum green fee per player
    """
    from datetime import datetime

    def time_to_mins(t: str) -> int:
        h, m = map(int, t.split(":"))
        return h * 60 + m

    filtered = []
    for slot in slots:
        start = slot.get("start_time", "")
        if not start:
            continue

        try:
            dt = datetime.fromisoformat(start)
            slot_mins = dt.hour * 60 + dt.minute
        except ValueError:
            continue

        if earliest_time and slot_mins < time_to_mins(earliest_time):
            continue
        if latest_time and slot_mins > time_to_mins(latest_time):
            continue
        if min_spots is not None and slot.get("available_spots", 0) < min_spots:
            continue
        if max_fee is not None and slot.get("green_fee", 0) > max_fee:
            continue

        filtered.append(slot)

    return filtered


# ─────────────────────────────────────────────
# DISPLAY HELPERS
# ─────────────────────────────────────────────

def print_slots(slots: list[dict], label: str = "") -> None:
    from datetime import datetime

    if label:
        print(f"\n{label}")
    if not slots:
        print("  (no tee times)")
        return

    print(f"  {'Time':<10} {'Fee/Player':<14} {'Spots':<8} {'Type'}")
    print("  " + "─" * 44)
    for slot in slots:
        try:
            dt = datetime.fromisoformat(slot["start_time"])
            time_str = dt.strftime("%I:%M %p")
        except Exception:
            time_str = slot["start_time"]

        fee = f"${slot['green_fee']:.2f}" if slot["green_fee"] else "unknown"
        spots = str(slot["available_spots"])
        rate = slot.get("rate_type", "standard")
        print(f"  {time_str:<10} {fee:<14} {spots:<8} {rate}")


def print_raw(slot: dict) -> None:
    """Pretty-print the raw API response for a single slot."""
    raw = slot.get("_raw", slot)
    print(json.dumps(raw, indent=2, default=str))


# ─────────────────────────────────────────────
# DISCOVER CLUB LIST (find club IDs)
# ─────────────────────────────────────────────

def fetch_club_list(page: int = 1, per_page: int = 10) -> list[dict]:
    """
    Fetch a page of ChronoGolf clubs. Useful for discovering club IDs.
    """
    url = f"{CHRONO_BASE}/api/v1/clubs"
    params = {
        "page": str(page),
        "per_page": str(per_page),
        "online_booking": "true",
    }
    resp = requests.get(url, headers=BASE_HEADERS, params=params, timeout=15)

    if not resp.ok:
        print(f"Club list fetch failed: {resp.status_code} {resp.reason}")
        return []

    raw = resp.json()
    if isinstance(raw, list):
        return raw
    return raw.get("clubs") or raw.get("results") or []


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description="Fetch tee times from the ChronoGolf API",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--club-id", default=None, help="ChronoGolf club ID (omit to auto-discover)")
    parser.add_argument("--date", default=None, help="Date in YYYY-MM-DD (default: 7 days from today)")
    parser.add_argument("--players", type=int, default=2, help="Number of players (default: 2)")
    parser.add_argument("--holes", type=int, default=18, choices=[9, 18], help="9 or 18 holes (default: 18)")
    parser.add_argument("--days", type=int, default=1, help="Number of days to fetch (default: 1)")
    parser.add_argument("--email", default=os.getenv("CG_EMAIL"), help="ChronoGolf account email (or set CG_EMAIL)")
    parser.add_argument("--password", default=os.getenv("CG_PASSWORD"), help="ChronoGolf password (or set CG_PASSWORD)")
    parser.add_argument("--earliest", default=None, metavar="HH:MM", help="Filter: earliest tee time (e.g. 07:00)")
    parser.add_argument("--latest", default=None, metavar="HH:MM", help="Filter: latest tee time (e.g. 12:00)")
    parser.add_argument("--max-fee", type=float, default=None, help="Filter: max green fee per player")
    parser.add_argument("--min-spots", type=int, default=None, help="Filter: min available spots")
    parser.add_argument("--raw", action="store_true", help="Print raw JSON for the first slot")
    parser.add_argument("--list-clubs", action="store_true", help="List available clubs and exit")
    return parser.parse_args()


def main():
    args = parse_args()

    print("ChronoGolf Tee Time Test")
    print("=" * 50)

    # ── Authenticate (optional) ──────────────────────
    auth_token = None
    if args.email and args.password:
        auth_token = login_golfer(args.email, args.password)
    else:
        print("\nNo credentials provided — fetching public availability.")
        print("(Use --email / --password or set CG_EMAIL / CG_PASSWORD env vars to authenticate)\n")

    # ── List clubs mode ──────────────────────────────
    if args.list_clubs:
        print("\nFetching available clubs (page 1)...")
        clubs = fetch_club_list(per_page=20)
        if not clubs:
            print("Could not retrieve club list.")
            sys.exit(1)
        print(f"\n{'ID':<8} {'Name':<40} {'City':<20} State")
        print("─" * 80)
        for c in clubs:
            print(f"{c.get('id', ''):<8} {str(c.get('name', ''))[:39]:<40} "
                  f"{str(c.get('city', ''))[:19]:<20} {c.get('state_province', '')}")
        sys.exit(0)

    # ── Auto-discover club ID if not given ───────────
    club_id = args.club_id
    club_name = ""
    if not club_id:
        print("No --club-id specified. Fetching first available club...")
        clubs = fetch_club_list(per_page=5)
        if not clubs:
            print("Could not find any clubs. Try specifying --club-id explicitly.")
            sys.exit(1)
        club_id = str(clubs[0].get("id"))
        club_name = clubs[0].get("name", "")
        print(f"Using: [{club_id}] {club_name} — {clubs[0].get('city')}, {clubs[0].get('state_province')}")

    # ── Default date: 7 days from today ─────────────
    if args.date:
        start_date = args.date
    else:
        start_date = (date.today() + timedelta(days=7)).isoformat()

    print(f"\nClub ID : {club_id} {('— ' + club_name) if club_name else ''}")
    print(f"Date    : {start_date}" + (f" (+{args.days - 1} days)" if args.days > 1 else ""))
    print(f"Players : {args.players}")
    print(f"Holes   : {args.holes}")
    if auth_token:
        print("Auth    : yes")

    # ── Fetch ────────────────────────────────────────
    print()
    if args.days > 1:
        print(f"Fetching {args.days} days of tee times...")
        range_results = fetch_tee_times_range(
            club_id, start_date, args.days, args.players, args.holes, auth_token
        )

        total = sum(len(v) for v in range_results.values())
        print(f"\nTotal slots across all dates: {total}")

        for day, slots in range_results.items():
            filtered = filter_tee_times(slots, args.earliest, args.latest, args.min_spots, args.max_fee)
            label = f"{day}  ({len(filtered)} slot(s)"
            if filtered != slots:
                label += f", filtered from {len(slots)}"
            label += ")"
            print_slots(filtered, label=label)

    else:
        print(f"Fetching tee times for {start_date}...")
        slots = fetch_tee_times(club_id, start_date, args.players, args.holes, auth_token)

        if not slots:
            print("\nNo tee times returned.")
            print("This may mean:")
            print("  • The club requires authentication (use --email / --password)")
            print("  • No availability on this date")
            print("  • The club ID is invalid (use --list-clubs to discover IDs)")
            sys.exit(0)

        # Apply filters
        filtered = filter_tee_times(slots, args.earliest, args.latest, args.min_spots, args.max_fee)

        label = f"\n{len(slots)} tee time(s) available"
        if filtered != slots:
            label += f"  ({len(filtered)} after filtering)"
        print_slots(filtered, label=label)

        # Print raw JSON for the first slot if requested
        if args.raw and filtered:
            print("\nRaw API response (first slot):")
            print_raw(filtered[0])

    print("\nDone.")


if __name__ == "__main__":
    main()
