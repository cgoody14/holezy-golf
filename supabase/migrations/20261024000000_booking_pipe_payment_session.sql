-- =============================================================================
-- Wire payments + login session into the booking pipe.
-- =============================================================================
-- Three changes so a real checkout can auto-book AND collect the fee:
--   1. Carry the authorized Stripe PaymentIntent on each job, so the worker can
--      capture it on a successful booking (or release it on failure).
--   2. Drop the now-vestigial NOT NULL on the ChronoGolf credential columns —
--      login is cookie/session based now, not password.
--   3. Store the reusable platform login session (Playwright storage_state) so
--      the ephemeral Railway worker can authenticate on every run.
-- =============================================================================

-- 1 · Payment linkage on the job -------------------------------------------------
ALTER TABLE public.scheduled_jobs
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_status           TEXT DEFAULT 'none';

COMMENT ON COLUMN public.scheduled_jobs.stripe_payment_intent_id IS
  'Authorized PaymentIntent (manual capture). Captured on booked, cancelled on failed.';
COMMENT ON COLUMN public.scheduled_jobs.payment_status IS
  'none | authorized | captured | released | free';

-- 2 · Credentials are vestigial (cookie-session login now) -----------------------
ALTER TABLE public.scheduled_jobs ALTER COLUMN chronogolf_email    DROP NOT NULL;
ALTER TABLE public.scheduled_jobs ALTER COLUMN chronogolf_password DROP NOT NULL;

-- 3 · Reusable platform login session --------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_sessions (
  platform      TEXT        PRIMARY KEY,          -- 'chronogolf'
  storage_state JSONB       NOT NULL,             -- Playwright storage_state
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Service-role only: the worker reads it, the importer writes it. No public
-- policies are created, and with RLS enabled the anon/auth keys get no access.
ALTER TABLE public.platform_sessions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.platform_sessions IS
  'Playwright storage_state per booking platform. Written by import_chronogolf_cookies.py, read by the worker. Refresh when the session expires.';
