-- Migration: 0020_court_open_close_hours
-- Purpose: Add per-court operating hours so each court can define when it
-- opens and closes for booking (e.g. 06:00–22:00, 08:00–20:00, etc.).
-- The booking slot grid and service-level validation both respect these hours.
-- Defaults preserve current behaviour: open_hour = 6, close_hour = 22.

ALTER TABLE courts
  ADD COLUMN open_hour  smallint NOT NULL DEFAULT 6,
  ADD COLUMN close_hour smallint NOT NULL DEFAULT 22;

ALTER TABLE courts
  ADD CONSTRAINT courts_open_close_hours_valid
    CHECK (open_hour >= 0 AND close_hour <= 24 AND open_hour < close_hour);
