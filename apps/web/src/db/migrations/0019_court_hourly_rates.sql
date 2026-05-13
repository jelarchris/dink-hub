-- Migration: 0019_court_hourly_rates
-- Purpose: Allow courts to define multiple hourly rate bands by time of day
-- (e.g. daytime ₱150/hr 06:00–18:00, night ₱200/hr 18:00–22:00).
-- Falls back to courts.hourly_rate_centavos when no band covers the booking's start hour.

CREATE TABLE court_hourly_rates (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  court_id         uuid        NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
  from_hour        smallint    NOT NULL,
  to_hour          smallint    NOT NULL,
  rate_centavos    bigint      NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT court_hourly_rates_from_hour_range CHECK (from_hour >= 0 AND from_hour < 24),
  CONSTRAINT court_hourly_rates_to_hour_range   CHECK (to_hour > from_hour AND to_hour <= 24),
  CONSTRAINT court_hourly_rates_positive_rate   CHECK (rate_centavos > 0)
);

-- Prevent overlapping time bands for the same court (btree_gist already enabled in 0001).
CREATE INDEX court_hourly_rates_court_idx ON court_hourly_rates (court_id);

ALTER TABLE court_hourly_rates
  ADD CONSTRAINT court_hourly_rates_no_overlap
  EXCLUDE USING gist (
    court_id WITH =,
    int4range(from_hour, to_hour) WITH &&
  );

-- RLS
ALTER TABLE court_hourly_rates ENABLE ROW LEVEL SECURITY;

-- Anyone can read (needed for booking flow price display).
CREATE POLICY "court_hourly_rates_read_all"
  ON court_hourly_rates FOR SELECT
  USING (true);

-- Venue owners can insert/update/delete rate bands for their own courts.
CREATE POLICY "court_hourly_rates_owner_write"
  ON court_hourly_rates FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM courts c
      JOIN venues v ON v.id = c.venue_id
      WHERE c.id = court_hourly_rates.court_id
        AND v.owner_id = auth.uid()
        AND c.deleted_at IS NULL
        AND v.deleted_at IS NULL
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM courts c
      JOIN venues v ON v.id = c.venue_id
      WHERE c.id = court_hourly_rates.court_id
        AND v.owner_id = auth.uid()
        AND c.deleted_at IS NULL
        AND v.deleted_at IS NULL
    )
  );
