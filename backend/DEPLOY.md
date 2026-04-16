# Holezy Backend — Railway Deployment Checklist

## Pre-deploy (one-time)

### 1. Apply the Supabase migration

Run in **Supabase → SQL Editor**:

```
supabase/migrations/20260416000001_create_scheduled_jobs.sql
```

Then run the local sanity check to confirm both tables are reachable:

```bash
cd backend/
cp .env.example .env   # fill in real values
python test_connection.py
```

All four checks must show `[PASS]` before continuing.

---

### 2. Verify Resend sender address

- Log in to [resend.com](https://resend.com)
- Confirm `bookings@holezy.com` is verified under **Domains**
- If not: add the domain, add the DNS records, wait for verification

---

## Railway setup

### 3. Create the Railway service

1. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
2. Select `cgoody14/holezy-golf`
3. Set **Root Directory** to `backend`
4. Railway will detect `nixpacks.toml` automatically — builder is set to Nixpacks

### 4. Set environment variables

In Railway → your service → **Variables**, add:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_KEY` | service-role key from Supabase → Settings → API |
| `RESEND_API_KEY` | from Resend dashboard |
| `SENTRY_DSN` | *(optional)* from Sentry project settings |

### 5. Deploy

Click **Deploy** (or push to `main` if auto-deploy is enabled).

---

## Post-deploy verification

### 6. Check Railway logs

Within 30 seconds of deploy you should see:

```
[worker] ═══════════════════════════════════════
[worker]   Holezy Booking Worker
[worker]   Poll interval : 30s
[worker]   Max concurrent: 5 jobs
[worker] ═══════════════════════════════════════
[worker] alive — HH:MM:SS
```

If you see `[worker] alive —` repeating every 30 s, the worker is healthy.

### 7. Insert a test job (optional smoke test)

Run in **Supabase → SQL Editor** — sets `fire_at` to now so the worker picks it up immediately:

```sql
INSERT INTO public.scheduled_jobs (
  golfer_email, golfer_name,
  chronogolf_email, chronogolf_password,
  course_name, course_url,
  booking_date, earliest_time, latest_time,
  player_count, fire_at
) VALUES (
  'you@example.com', 'Test Golfer',
  'your-chronogolf@email.com', 'your-password',
  'Test Course', 'https://www.chronogolf.com/club/1482',
  CURRENT_DATE + INTERVAL '7 days', '08:00', '10:00',
  2, now()
);
```

Watch Railway logs — within 30 s you should see:

```
[worker] 1 job(s) due — claiming...
[worker] Claimed job <uuid> (Test Course on YYYY-MM-DD)
[scheduler] run_job <uuid> — Test Course on YYYY-MM-DD
[scheduler] scrape_until_found ...
[scheduler] Attempt 1/20
[booking] login → https://www.chronogolf.com/users/sign_in
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Worker exits immediately | Check `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` are set correctly |
| `relation "scheduled_jobs" does not exist` | Run the migration SQL in Supabase SQL Editor |
| `RESEND_API_KEY` not set | Email notifications skip silently — worker still runs |
| Playwright install fails | Ensure nixpacks.toml `nixPkgs` includes `chromium` and its system deps |
| Login screenshot in `/tmp/` | Bad ChronoGolf credentials in the job row |
