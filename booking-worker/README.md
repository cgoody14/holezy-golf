# Holezy Booking Worker

Railway-hosted Node.js service that watches for tee time preferences and books them automatically.

## How it works

1. Golfer submits a booking request via the Holezy web app
2. Supabase stores the preference and a Postgres trigger auto-calculates `fire_at` (the exact moment the booking window opens at that course)
3. This worker polls `scheduled_bookings` every 60 seconds
4. When `fire_at <= now()`, it fires the booking via the correct platform adapter
5. On success: writes confirmation back to Supabase, SMS + email the golfer
6. On no availability: re-queues a retry in 30 minutes

## Platform Adapters

| File | Platform | Courses | Status |
|------|----------|---------|--------|
| `adapters/chronogolf.ts` | ChronoGolf / Lightspeed Golf | 13,730 | ✅ Active |
| `adapters/golfnow.ts` | GolfNow | ~9,000 | 🔜 Pending API approval |
| `adapters/foreup.ts` | foreUP | ~2,300 | 🔜 Pending API approval |
| `adapters/custom/` | Any course (Playwright) | unlimited | ✅ Add scripts per course |

## Setup

```bash
npm install
cp ../.env.example .env.local   # fill in your values
npm run dev
```

## Deploy to Railway

```bash
railway login
railway init
railway up
railway variables set SUPABASE_URL=... SUPABASE_SERVICE_KEY=...
```

## Ingest all ChronoGolf courses

```bash
npm run ingest:chronogolf
# Fetches all ~13,730 courses, probes booking windows, loads to Supabase
# Takes ~25 minutes. Run once, then nightly via Railway cron.
```

## Environment Variables

See `../.env.example` for all required variables.
