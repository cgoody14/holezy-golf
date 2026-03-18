-- ============================================================
-- Booking System Migration 001: Core Tables
-- Run AFTER existing site migrations
-- Adds: courses, tee_time_preferences, booking_attempts,
--       scheduled_bookings, golfer platform credentials
-- ============================================================

-- ─────────────────────────────────────────────
-- Courses (populated by ingestion scripts)
-- ─────────────────────────────────────────────
create table if not exists courses (
  id                      uuid primary key default gen_random_uuid(),
  chronogolf_club_id      text unique,
  golfnow_facility_id     text unique,
  foreup_facility_id      text unique,
  name                    text not null,
  slug                    text,
  city                    text,
  state_province          text,
  country                 text default 'US',
  latitude                numeric(9,6),
  longitude               numeric(9,6),
  timezone                text not null default 'America/New_York',
  platform                text default 'chronogolf'
                            check (platform in ('chronogolf','golfnow','foreup','custom')),
  online_booking_enabled  boolean default true,
  booking_advance_days    int,          -- e.g. 7 — null = not yet probed
  booking_opens_at        time,         -- e.g. 07:00 local time
  cancellation_hours      int,
  website_url             text,
  phone                   text,
  holes                   int default 18,
  last_synced_at          timestamptz,
  created_at              timestamptz default now()
);

create index if not exists courses_platform
  on courses (platform, online_booking_enabled);

-- ─────────────────────────────────────────────
-- Golfer platform credentials
-- Added to existing profiles table
-- ─────────────────────────────────────────────
alter table profiles
  add column if not exists chronogolf_email               text,
  add column if not exists chronogolf_password_encrypted  text,
  add column if not exists chronogolf_connected_at        timestamptz,
  add column if not exists golfnow_email                  text,
  add column if not exists golfnow_password_encrypted     text,
  add column if not exists golfnow_connected_at           timestamptz;

-- ─────────────────────────────────────────────
-- Tee time preferences (golfer booking requests)
-- ─────────────────────────────────────────────
create table if not exists tee_time_preferences (
  id                      uuid primary key default gen_random_uuid(),
  golfer_id               uuid references auth.users(id) on delete cascade,
  course_id               uuid references courses(id),
  preferred_date          date not null,
  date_flexibility_days   int default 0,
  earliest_tee_time       time default '06:00',
  latest_tee_time         time default '14:00',
  player_count            int default 4,
  max_price_per_player    numeric(6,2),
  status                  text default 'pending'
                            check (status in ('pending','monitoring','booked','failed','cancelled')),
  confirmation_code       text,
  booked_tee_time         timestamptz,
  notes                   text,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

alter publication supabase_realtime add table tee_time_preferences;

-- ─────────────────────────────────────────────
-- Booking attempts (full audit log)
-- ─────────────────────────────────────────────
create table if not exists booking_attempts (
  id                uuid primary key default gen_random_uuid(),
  preference_id     uuid references tee_time_preferences(id) on delete cascade,
  platform          text,
  attempted_at      timestamptz default now(),
  available_slots   jsonb,
  selected_slot     jsonb,
  result            text check (result in ('success','no_availability','error')),
  error_message     text,
  confirmation_code text
);

-- ─────────────────────────────────────────────
-- Scheduled bookings (precision fire_at scheduler)
-- ─────────────────────────────────────────────
create table if not exists scheduled_bookings (
  id              uuid primary key default gen_random_uuid(),
  preference_id   uuid references tee_time_preferences(id) on delete cascade,
  course_id       uuid references courses(id),
  fire_at         timestamptz not null,
  status          text default 'waiting'
                    check (status in ('waiting','fired','booked','failed')),
  fired_at        timestamptz,
  created_at      timestamptz default now()
);

create index if not exists scheduled_bookings_fire_at
  on scheduled_bookings (fire_at, status)
  where status = 'waiting';

-- ─────────────────────────────────────────────
-- RLS policies
-- ─────────────────────────────────────────────
alter table tee_time_preferences enable row level security;
alter table booking_attempts enable row level security;

create policy "golfers_own_preferences" on tee_time_preferences
  for all using (auth.uid() = golfer_id);

create policy "golfers_view_own_attempts" on booking_attempts
  for select using (
    preference_id in (
      select id from tee_time_preferences where golfer_id = auth.uid()
    )
  );
