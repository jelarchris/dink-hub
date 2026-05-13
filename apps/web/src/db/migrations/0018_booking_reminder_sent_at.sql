-- 0018_booking_reminder_sent_at.sql
--
-- Adds reminder_sent_at to bookings so the T-2h session-reminder cron can
-- set it after dispatching the email, preventing duplicate sends on retries.
-- Using NULL to mean "not yet sent" keeps the partial index tight.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;

-- Partial index: cron scans only confirmed rows that haven't been reminded.
-- This keeps the scan O(pending work), not O(all bookings).
CREATE INDEX IF NOT EXISTS bookings_reminder_pending_idx
  ON bookings (start_at)
  WHERE status = 'confirmed' AND reminder_sent_at IS NULL;

-- RLS note: reminder_sent_at is server-only (set by service-role cron).
-- No player-facing SELECT/UPDATE policy needed — existing policies cover it.
