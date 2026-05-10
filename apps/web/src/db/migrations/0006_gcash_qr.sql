-- ============================================================================
-- DinkHub — Venue GCash QR image
-- ----------------------------------------------------------------------------
-- Adds an optional storage path for the venue's GCash QR code image. Files
-- live in the existing public `venue-media` bucket (created in 0005), so no
-- new storage bucket or RLS policy is needed.
-- ============================================================================

alter table public.venues
  add column if not exists gcash_qr_image_path text;
