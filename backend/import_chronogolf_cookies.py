#!/usr/bin/env python
# =============================================================================
# import_chronogolf_cookies.py  —  reuse a login YOU made in your own browser
# =============================================================================
# ChronoGolf's login is behind Cloudflare, which blocks automated browsers.
# So instead of automating the login, you log in normally in your OWN browser
# (Cloudflare is happy — you're a real person), export your ChronoGolf cookies
# once, and this script turns them into the session file the booking engine
# reuses. No automation of the login, no bot-detection to fight.
#
# ── HOW TO EXPORT YOUR COOKIES (one time, ~1 min) ─────────────────────────────
#   1. In Chrome, install the free "Cookie-Editor" extension.
#   2. Log in to https://www.chronogolf.com in that same Chrome (normally).
#   3. On a ChronoGolf page, click the Cookie-Editor icon → "Export" (bottom
#      right) → choose "JSON". It copies all ChronoGolf cookies to your clipboard.
#   4. Paste into a file called  cookies.json  inside this backend/ folder
#      (open a text editor, paste, save as cookies.json).
#
# ── THEN RUN ──────────────────────────────────────────────────────────────────
#   cd backend
#   python import_chronogolf_cookies.py            # reads cookies.json
#   python import_chronogolf_cookies.py path/to/cookies.json   # or a custom path
#
# It writes chronogolf_state.json (gitignored) and verifies the session works.
# Re-do this whenever the engine says "SessionExpired" (sessions last a while).
# =============================================================================

import asyncio
import json
import os
import sys

STATE_FILE  = os.getenv("CHRONOGOLF_STATE", "chronogolf_state.json")
CHRONO_BASE = "https://www.chronogolf.com"

# Cookie-Editor sameSite values → Playwright's expected values.
_SAMESITE = {
    "no_restriction": "None", "none": "None",
    "lax": "Lax", "strict": "Strict",
    "unspecified": "Lax", "": "Lax", None: "Lax",
}


def _to_storage_state(raw_cookies: list) -> dict:
    """Convert a Cookie-Editor JSON export into a Playwright storage_state dict."""
    cookies = []
    for c in raw_cookies:
        name = c.get("name")
        if not name:
            continue
        domain = c.get("domain") or ".chronogolf.com"
        cookie = {
            "name": name,
            "value": c.get("value", ""),
            "domain": domain,
            "path": c.get("path", "/"),
            "httpOnly": bool(c.get("httpOnly", False)),
            "secure": bool(c.get("secure", True)),
            "sameSite": _SAMESITE.get(str(c.get("sameSite", "")).lower(), "Lax"),
        }
        # Expiry: Cookie-Editor uses expirationDate (float seconds). Omit for session cookies.
        exp = c.get("expirationDate") or c.get("expires")
        if exp and float(exp) > 0:
            cookie["expires"] = float(exp)
        cookies.append(cookie)
    return {"cookies": cookies, "origins": []}


async def _verify(state_path: str) -> tuple[bool, str | None]:
    """Load the session in a headless browser and confirm we're logged in."""
    from playwright.async_api import async_playwright
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        ctx = await browser.new_context(storage_state=state_path)
        page = await ctx.new_page()
        who, ok = None, False
        try:
            resp = await page.request.get(
                f"{CHRONO_BASE}/marketplace/sessions",
                headers={"Accept": "application/json", "X-Requested-With": "XMLHttpRequest"},
            )
            if resp.ok:
                data = await resp.json()
                who = data.get("email")
                ok = bool(data.get("id"))
        except Exception as e:
            print(f"   (verify error: {str(e)[:100]})")
        await browser.close()
        return ok, who


def main() -> int:
    src = sys.argv[1] if len(sys.argv) > 1 else "cookies.json"
    if not os.path.exists(src):
        print(f"❌ Can't find '{src}'.")
        print("   Export your ChronoGolf cookies with the Cookie-Editor extension")
        print("   (JSON) and save them as cookies.json in this folder. See the top")
        print("   of this file for the 4 steps.")
        return 2

    with open(src) as f:
        raw = json.load(f)
    # Cookie-Editor exports a bare array; tolerate {"cookies":[...]} too.
    if isinstance(raw, dict):
        raw = raw.get("cookies", [])
    if not isinstance(raw, list) or not raw:
        print(f"❌ '{src}' doesn't look like a cookie export (expected a JSON array).")
        return 2

    state = _to_storage_state(raw)
    chrono = [c for c in state["cookies"] if "chronogolf" in c["domain"]]
    print(f"   parsed {len(state['cookies'])} cookies ({len(chrono)} for chronogolf.com)")

    with open(STATE_FILE, "w") as f:
        json.dump(state, f, indent=1)
    print(f"   wrote {STATE_FILE}")

    print("   verifying the session works…")
    ok, who = asyncio.run(_verify(STATE_FILE))
    if ok:
        print(f"\n✅ Session valid — logged in as {who}.")
        print("   Now run:  python test_book_chronogolf.py … --dry-run")
        return 0
    print("\n⚠  Cookies imported but the session didn't verify as logged in.")
    print("   Make sure you exported the cookies WHILE logged in to ChronoGolf,")
    print("   from a chronogolf.com page. Re-export and run this again.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
