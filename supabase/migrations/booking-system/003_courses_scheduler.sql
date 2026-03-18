-- ============================================================
-- Supabase migration: full courses table + smart scheduler
-- Run in Supabase SQL editor before the ingestion script
-- Lines: 145
-- ============================================================

-- ─────────────────────────────────────────────
-- 1. Full courses table (replaces the simple one from before)
-- ─────────────────────────────────────────────

create table if not exists courses (
  id                      uuid primary key default gen_random_uuid(),
  chronogolf_club_id      text unique,          -- "1482"
  name                    text not null,
  slug                    text,                 -- "rattlesnake-point-golf-club"
  city                    text,
  state_province          text,
  country                 text,
  latitude                numeric(9,6),
  longitude               numeric(9,6),
  timezone                text not null default 'America/New_York',
  platform                text default 'chronogolf'
                            check (platform in ('chronogolf','golfnow','custom')),

  -- Booking window (probed from club API)
  online_booking_enabled  boolean default true,
  booking_advance_days    int,                  -- e.g. 7 — null = not yet probed
  booking_opens_at        time,                 -- e.g. 07:00 local time
  cancellation_hours      int,                  -- e.g. 24

  -- Extra info
  website_url             text,
  phone                   text,
  holes                   int,

  last_synced_at          timestamptz,
  created_at              timestamptz default now()
);

-- Index for geo-search (golfer picks courses near them)
create index if not exists courses_location
  on courses using gist (point(longitude, latitude));

-- Index for scheduler queries
create index if not exists courses_platform_booking
  on courses (platform, online_booking_enabled, booking_advance_days);

-- ─────────────────────────────────────────────
-- 2. Scheduled bookings table
--    One row per golfer preference with exact fire_at timestamp
-- ─────────────────────────────────────────────

create table if not exists scheduled_bookings (
  id              uuid primary key default gen_random_uuid(),
  preference_id   uuid references tee_time_preferences(id) on delete cascade,
  course_id       uuid references courses(id),
  fire_at         timestamptz not null,   -- exact moment to attempt booking
  status          text default 'waiting'
                    check (status in ('waiting','fired','booked','failed')),
  fired_at        timestamptz,
  created_at      timestamptz default now()
);

-- The Railway scheduler polls this every minute
create index if not exists scheduled_bookings_fire_at
  on scheduled_bookings (fire_at, status)
  where status = 'waiting';

-- ─────────────────────────────────────────────
-- 3. Function: calculate exact fire_at for a preference
--    Called automatically when a new preference is inserted
-- ─────────────────────────────────────────────

create or replace function calculate_fire_at(
  p_preferred_date  date,
  p_advance_days    int,
  p_opens_at        time,         -- course local time e.g. '07:00'
  p_timezone        text          -- course timezone e.g. 'America/Toronto'
)
returns timestamptz
language sql
immutable
as $$
  -- Booking window opens at opens_at on (preferred_date - advance_days)
  -- in the course's local timezone
  select (
    (p_preferred_date - p_advance_days * interval '1 day')::date
    + coalesce(p_opens_at, '00:00'::time)
  ) at time zone p_timezone;
$$;

-- ─────────────────────────────────────────────
-- 4. Trigger: auto-create scheduled_booking when preference is inserted
-- ─────────────────────────────────────────────

create or replace function on_preference_inserted()
returns trigger
language plpgsql
as $$
declare
  v_course courses%rowtype;
  v_fire_at timestamptz;
begin
  -- Fetch course config
  select * into v_course from courses where id = NEW.course_id;

  if v_course.booking_advance_days is null then
    -- Booking window not yet known — default to 7 days at midnight
    v_fire_at := calculate_fire_at(
      NEW.preferred_date, 7, '00:00'::time, v_course.timezone
    );
  else
    v_fire_at := calculate_fire_at(
      NEW.preferred_date,
      v_course.booking_advance_days,
      v_course.booking_opens_at,
      v_course.timezone
    );
  end if;

  -- If fire_at is in the past (golfer submitted late), fire in 1 minute
  if v_fire_at < now() then
    v_fire_at := now() + interval '1 minute';
  end if;

  insert into scheduled_bookings (preference_id, course_id, fire_at)
  values (NEW.id, NEW.course_id, v_fire_at);

  return NEW;
end;
$$;

create trigger preference_inserted_trigger
  after insert on tee_time_preferences
  for each row execute function on_preference_inserted();

-- ─────────────────────────────────────────────
-- 5. View: what's firing today (useful for debugging)
-- ─────────────────────────────────────────────

create or replace view upcoming_scheduled_bookings as
select
  sb.id,
  sb.fire_at,
  sb.fire_at at time zone c.timezone as fire_at_local,
  c.name as course_name,
  c.timezone,
  c.booking_advance_days,
  c.booking_opens_at,
  tp.preferred_date,
  tp.player_count,
  tp.earliest_tee_time,
  tp.latest_tee_time,
  tp.status as preference_status,
  sb.status as schedule_status
from scheduled_bookings sb
join courses c on c.id = sb.course_id
join tee_time_preferences tp on tp.id = sb.preference_id
where sb.status = 'waiting'
order by sb.fire_at;
