-- 0028_booking_rebook_link.sql
-- Adds bookings.rebook_of_id so a player can claim a free rebook after a
-- venue-closure / weather / court-unavailable cancellation. A partial unique
-- index enforces "at most one active rebook per cancelled parent" at the DB
-- level so the player can never double-claim, even on retry storms.

-- Idempotent: safe to re-apply.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS rebook_of_id uuid NULL REFERENCES bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS bookings_rebook_of_id_idx ON bookings(rebook_of_id)
  WHERE rebook_of_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_active_rebook_per_parent
  ON bookings(rebook_of_id)
  WHERE rebook_of_id IS NOT NULL
    AND status NOT IN ('cancelled', 'expired', 'no_show');
