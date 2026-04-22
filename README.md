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

## Tee Time Card Hold Flow

Some golf courses charge Holezy's company card at booking time (e.g. prepaid
GolfNow tee times).  To recover that cost, the worker places a matching Stripe
authorization (hold) on the customer's card immediately after the tee time is
confirmed.  The hold is captured once we know the course charged us, or
cancelled if they did not.

### When this flow triggers

A booking triggers a tee time authorization when **both** of these are true:

1. `Course_Database.requires_card_hold = true` for the booked course
2. `Course_Database.tee_time_cost_cents` is set to a non-zero value

Set these in the Supabase Table Editor (or via migration) for each course that
prepays at booking time.  If pricing is variable, leave `tee_time_cost_cents`
null — the worker will log a warning and skip the authorization (manual action
required; see below).

### The three states

```
none  ──(authorize)──►  authorized  ──(capture)──►  captured
                               │
                               └────(cancel)────►  cancelled
```

| State        | Meaning |
|---|---|
| `none`       | Course does not require a hold, or hold not yet attempted |
| `authorized` | Card is on hold; course has (or may have) charged Holezy |
| `captured`   | Customer charged — Holezy has recovered the tee time cost |
| `cancelled`  | Hold released — course did not charge Holezy |

### Manually capture or cancel from a Python shell

```python
cd backend
python

from tee_time_payment import (
    capture_tee_time_payment,
    cancel_tee_time_authorization,
    get_authorization_status,
    handle_course_charge_unknown,
)

booking_id = "the-uuid-from-Client_Bookings"

# Check current state
get_authorization_status(booking_id)

# Course charged Holezy → charge the customer
capture_tee_time_payment(booking_id)

# Course did NOT charge Holezy → release the hold
cancel_tee_time_authorization(booking_id)

# Unsure → log a warning and return current state
handle_course_charge_unknown(booking_id)

# Partial capture (e.g. course charged $40 instead of $50)
capture_tee_time_payment(booking_id, amount_to_capture_cents=4000)
```

### Finding these PaymentIntents in Stripe Dashboard

1. Go to **Payments** → **All payments**
2. Click **Filters** → **Metadata**
3. Set key = `purpose`, value = `tee_time_hold`

Or search directly: `metadata[purpose]:tee_time_hold`

All tee time hold PaymentIntents also carry `metadata[booking_id]` so you can
look up the exact `Client_Bookings` row.

### Running the test suite

```bash
# Make sure STRIPE_SECRET_KEY is a test key (sk_test_...)
cd backend
python tee_time_payment_test.py
```

Tests create real Stripe test objects and real Supabase rows, then clean up
after themselves.  Never run against live keys.
