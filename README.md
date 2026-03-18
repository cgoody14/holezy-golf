# Holezy Golf

Automated tee time booking — golfers submit their preferences once, Holezy books the moment the window opens.

## What is this?

Holezy monitors golf course booking windows and automatically reserves tee times the instant they become available. No more midnight alarms, no more F5 refreshing. Golfers connect their ChronoGolf (and soon GolfNow / foreUP) account, submit their preferences, and we handle the rest.

## Repo Structure

```
holezy-golf/
├── src/                        # React/Vite frontend (Lovable)
│   ├── pages/                  # Route pages
│   ├── components/             # UI components
│   └── integrations/supabase/  # Supabase client + types
│
├── booking-worker/             # Railway booking engine (Node.js)
│   ├── src/
│   │   ├── adapters/           # Platform adapters
│   │   │   ├── chronogolf.ts   # 13,730 courses
│   │   │   └── custom/         # Playwright one-off scripts
│   │   ├── scheduler.ts        # Polls scheduled_bookings every 60s
│   │   ├── router.ts           # Routes to correct adapter
│   │   ├── notifications.ts    # Twilio SMS + Resend email
│   │   └── scripts/            # One-time ingestion scripts
│   └── Dockerfile              # Railway deployment
│
├── supabase/
│   ├── functions/              # Edge functions (payments, email, etc.)
│   └── migrations/
│       ├── *.sql               # Site migrations (Lovable generated)
│       └── booking-system/     # Booking engine migrations
│           ├── 001_booking_system_schema.sql
│           ├── 002_chronogolf_credentials.sql
│           └── 003_courses_scheduler.sql
│
└── .env.example                # All required env vars documented
```

## Platform Coverage

| Platform | Courses | Status |
|----------|---------|--------|
| ChronoGolf / Lightspeed | 13,730 | ✅ Active |
| GolfNow | ~9,000 | 🔜 API approval pending |
| foreUP | ~2,300 | 🔜 API approval pending |
| Custom (Playwright) | Any | ✅ Add per course |

## Tech Stack

**Frontend** — React, Vite, TypeScript, Tailwind, shadcn/ui, Supabase Auth

**Booking Worker** — Node.js, TypeScript, Supabase, deployed on Railway

**Database** — Supabase (Postgres + Realtime + Edge Functions)

**Notifications** — Twilio (SMS) + Resend (email)

## Getting Started

### Frontend
```bash
npm install
npm run dev
```

### Booking Worker
```bash
cd booking-worker
npm install
cp ../.env.example .env.local   # fill in values
npm run dev
```

### Run ChronoGolf course ingestion (~25 min, one-time)
```bash
cd booking-worker
SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run ingest:chronogolf
```

### Deploy worker to Railway
```bash
cd booking-worker
railway login && railway init && railway up
```

## Environment Variables

See `.env.example` for all required variables. Never commit `.env`.
