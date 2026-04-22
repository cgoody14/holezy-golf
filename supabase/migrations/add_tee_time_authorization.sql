-- Tee Time Card Hold Flow
-- Adds per-course card-hold flag and per-booking authorization tracking.
-- Safe to run multiple times (IF NOT EXISTS / IF NOT EXISTS guards throughout).

-- ── Course_Database additions ─────────────────────────────────────────────────

ALTER TABLE public."Course_Database"
  ADD COLUMN IF NOT EXISTS requires_card_hold   BOOLEAN  NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tee_time_cost_cents  INTEGER;          -- NULL = variable/unknown pricing

COMMENT ON COLUMN public."Course_Database".requires_card_hold IS
  'True when Holezy''s card is charged by the course at booking time. Triggers a matching customer authorization.';
COMMENT ON COLUMN public."Course_Database".tee_time_cost_cents IS
  'Fixed tee time cost in cents. NULL means pricing varies — manual authorization is not attempted.';

-- ── Client_Bookings additions ─────────────────────────────────────────────────

ALTER TABLE public."Client_Bookings"
  ADD COLUMN IF NOT EXISTS tee_time_payment_intent_id      TEXT,
  ADD COLUMN IF NOT EXISTS tee_time_authorized_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS tee_time_authorization_status   TEXT NOT NULL DEFAULT 'none'
    CHECK (tee_time_authorization_status IN ('none','authorized','captured','cancelled')),
  ADD COLUMN IF NOT EXISTS tee_time_captured_at            TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tee_time_cancelled_at           TIMESTAMPTZ;

COMMENT ON COLUMN public."Client_Bookings".tee_time_authorization_status IS
  'Lifecycle: none → authorized → captured | cancelled';

-- Index for Stripe PI lookups (used when manually capturing / cancelling)
CREATE INDEX IF NOT EXISTS idx_client_bookings_tt_pi
  ON public."Client_Bookings" (tee_time_payment_intent_id)
  WHERE tee_time_payment_intent_id IS NOT NULL;
