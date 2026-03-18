-- ============================================================
-- Supabase migrations for ChronoGolf widget adapter
-- Run these in the Supabase SQL editor
-- Lines: 95
-- ============================================================

-- 1. Add ChronoGolf credentials to golfer_profiles
--    Passwords encrypted at rest using pgcrypto via Supabase Vault

alter table golfer_profiles
  add column if not exists chronogolf_email text,
  add column if not exists chronogolf_password_encrypted text,
  add column if not exists chronogolf_connected_at timestamptz;

-- 2. Add chronogolf_club_id to courses table
alter table courses
  add column if not exists chronogolf_club_id text;

-- ──────────────────────────────────────────
-- 3. Encryption helpers using pgcrypto
--    Supabase has pgcrypto enabled by default
-- ──────────────────────────────────────────

-- Encrypt a credential (call from your backend when golfer connects account)
create or replace function encrypt_credential(plain_value text)
returns text
language sql
security definer
as $$
  select encode(
    pgp_sym_encrypt(plain_value, current_setting('app.encryption_key')),
    'base64'
  );
$$;

-- Decrypt a credential (called by Railway worker)
create or replace function decrypt_credential(encrypted_value text)
returns text
language sql
security definer
as $$
  select pgp_sym_decrypt(
    decode(encrypted_value, 'base64'),
    current_setting('app.encryption_key')
  );
$$;

-- Set the encryption key in Supabase dashboard under:
-- Settings > Database > Configuration > app.encryption_key
-- Use a long random string e.g. from: openssl rand -base64 32

-- ──────────────────────────────────────────
-- 4. RLS policy — golfers can only see their own credentials
-- ──────────────────────────────────────────

alter table golfer_profiles enable row level security;

create policy "golfers_own_profile"
  on golfer_profiles
  for all
  using (auth.uid() = id);

-- ──────────────────────────────────────────
-- 5. Function to safely store ChronoGolf credentials
--    Call this from your Next.js API route after golfer connects
-- ──────────────────────────────────────────

create or replace function store_chronogolf_credentials(
  p_golfer_id uuid,
  p_email text,
  p_password text
)
returns void
language plpgsql
security definer
as $$
begin
  update golfer_profiles
  set
    chronogolf_email = p_email,
    chronogolf_password_encrypted = encrypt_credential(p_password),
    chronogolf_connected_at = now()
  where id = p_golfer_id;
end;
$$;

-- ──────────────────────────────────────────
-- 6. Seed a sample course with club_id
--    Find club IDs by viewing source on a course's ChronoGolf booking page
--    Look for: window.chronogolfSettings = { "clubId": "XXXX" }
-- ──────────────────────────────────────────

insert into courses (name, platform, chronogolf_club_id, timezone, booking_opens_days_ahead)
values
  ('Example Golf Club',    'chronogolf', '1234', 'America/Toronto', 7),
  ('Another Course',       'chronogolf', '5678', 'America/Vancouver', 5)
on conflict do nothing;
