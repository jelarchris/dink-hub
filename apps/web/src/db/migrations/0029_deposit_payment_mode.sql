-- 0029_deposit_payment_mode.sql
-- Adds optional "deposit (partial) payment" mode.
--
-- Owners can opt-in per venue and choose what percentage of the total the
-- player must transfer up-front via GCash. The balance is settled at the
-- venue on arrival via whatever channel the owner prefers (cash, GCash,
-- bank transfer — DinkHub does not need to know). The platform fee is
-- still charged on the FULL total, snapshotted at booking creation, so
-- the weekly owner-invoice math is unchanged.
--
-- Invariants are DB-enforced:
--   * deposit_percent only valid when allow_partial_payment = true
--     and must fall in [25, 75]
--   * bookings.payment_mode = 'full'    ⇒ deposit cols MUST be null/zero
--   * bookings.payment_mode = 'deposit' ⇒ deposit_centavos in (0, total)
--                                         AND balance = total - deposit
--   * balance_collected_at and balance_collected_by are co-required.
--
-- Idempotent: safe to re-apply.

-- ── venues ──────────────────────────────────────────────────────────────────
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS allow_partial_payment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deposit_percent smallint;

ALTER TABLE venues
  DROP CONSTRAINT IF EXISTS venues_deposit_percent_consistency;
ALTER TABLE venues
  ADD CONSTRAINT venues_deposit_percent_consistency CHECK (
    (allow_partial_payment = false AND deposit_percent IS NULL)
    OR
    (allow_partial_payment = true
     AND deposit_percent IS NOT NULL
     AND deposit_percent BETWEEN 25 AND 75)
  );

-- ── bookings ────────────────────────────────────────────────────────────────
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS payment_mode text NOT NULL DEFAULT 'full',
  ADD COLUMN IF NOT EXISTS deposit_centavos bigint,
  ADD COLUMN IF NOT EXISTS balance_due_centavos bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_collected_at timestamptz,
  ADD COLUMN IF NOT EXISTS balance_collected_by uuid REFERENCES profiles(id);

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_payment_mode_check;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_payment_mode_check
    CHECK (payment_mode IN ('full', 'deposit'));

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_deposit_consistency;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_deposit_consistency CHECK (
    (payment_mode = 'full'
     AND deposit_centavos IS NULL
     AND balance_due_centavos = 0)
    OR
    (payment_mode = 'deposit'
     AND deposit_centavos IS NOT NULL
     AND deposit_centavos > 0
     AND deposit_centavos < total_centavos
     AND balance_due_centavos = total_centavos - deposit_centavos)
  );

ALTER TABLE bookings
  DROP CONSTRAINT IF EXISTS bookings_balance_collected_pair;
ALTER TABLE bookings
  ADD CONSTRAINT bookings_balance_collected_pair CHECK (
    (balance_collected_at IS NULL  AND balance_collected_by IS NULL)
    OR
    (balance_collected_at IS NOT NULL AND balance_collected_by IS NOT NULL)
  );

-- Lightweight index for owner dashboards filtering "balance still owed".
CREATE INDEX IF NOT EXISTS bookings_balance_outstanding_idx
  ON bookings(venue_id, start_at)
  WHERE payment_mode = 'deposit' AND balance_collected_at IS NULL;
