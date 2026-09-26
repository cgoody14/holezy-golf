# Holezy Golf

Automated tee time booking — golfers submit their preferences once, Holezy books the moment the course's booking window opens.

## What is this?

Golfers pick a course, date, time window, and player count on the site. Holezy queues the request and, when the booking window opens, a worker attempts the reservation automatically on the golfer's behalf. No midnight alarms, no refreshing.

**Current coverage: ChronoGolf / Lightspeed.** Other platforms (GolfNow, foreUP, etc.) are deliberately out of scope until the ChronoGolf path is proven end to end.

## Architecture

Three deployables, one Supabase database. A booking flows: **site → edge function → `scheduled_jobs` table → worker → ChronoGolf**.

```
holezy-golf/
├── src/                         # React + Vite frontend  → deployed on Vercel
│   ├── pages/                   # Route pages (Checkout, BookingForm, Courses, …)
│   ├── components/              # UI components (shadcn/ui)
│   └── integrations/supabase/   # Supabase client + generated types
│
├── backend/                     # Python booking worker → deployed on Railway
│   ├── worker.py                # Polls scheduled_jobs every 30s, claims + dispatches
│   ├── scheduler.py             # Retry engine (≤20 attempts, no-availability vs error)
│   ├── booking_chronogolf.py    # ChronoGolf booking engine (Playwright, UI-driven)
│   ├── test_book_chronogolf.py  # Manual harness to test the engine against a course
│   ├── notifications.py         # Resend email / Twilio SMS on outcome
│   ├── courses/                 # Per-course custom adapter system (registry + base)
│   ├── scrapers/                # ChronoGolf course-directory scraper
│   └── railway.json, Procfile   # Railway deploy config
│
└── supabase/
    ├── functions/               # Edge functions — the site calls these live
    │   ├── create-scheduled-job #   queues a booking into scheduled_jobs
    │   ├── create-payment-intent#   Stripe: authorize now, capture on success
    │   ├── cancel-booking        #  cancel job + release/refund the Stripe auth
    │   └── …                     #  coupons, contact, admin, confirmations
    └── migrations/              # Postgres schema (Supabase)
```

## How the money works

- **Customer → Holezy:** Stripe, authorize at checkout, capture on a confirmed booking, release/refund if it can't book.
- **Holezy → course:** never the customer's card. Either "pay at the course," or Holezy's own card-to-hold for courses that require a card. See the system map for the full model.

> ⚠️ **Known gap (in progress):** the worker does not yet capture/refund Stripe automatically on booking outcome — that wiring is a tracked overhaul phase.

## Tech stack

- **Frontend** — React, Vite, TypeScript, Tailwind, shadcn/ui, Supabase Auth (Vercel)
- **Worker** — Python, Playwright, Supabase (Railway)
- **Database / auth / functions** — Supabase (Postgres + Edge Functions)
- **Payments** — Stripe · **Notifications** — Resend (email) + Twilio (SMS)

## Getting started

### Frontend
```bash
npm install
npm run dev
```

### Booking worker
```bash
cd backend
pip install -r requirements.txt
playwright install chromium
cp .env.example .env          # fill in CHRONOGOLF_EMAIL/PASSWORD, SUPABASE_*, etc.
python worker.py
```

### Test the ChronoGolf engine against a real course
```bash
cd backend
HEADLESS=false python test_book_chronogolf.py \
  --course "https://www.chronogolf.com/club/<slug>" \
  --date 2026-09-18 --earliest 10:00 --latest 11:45 --players 4 --dry-run
```
`--dry-run` finds and selects a slot but stops before booking anything.

### Deploy the worker to Railway
```bash
cd backend
railway up
```

## Environment variables

See `.env.example`. Never commit `.env` — secrets belong in Vercel, Railway, and Supabase dashboards, not in git.
