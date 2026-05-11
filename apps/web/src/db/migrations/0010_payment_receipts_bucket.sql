-- ============================================================================
-- DinkHub — Private storage bucket for GCash payment receipts
-- ----------------------------------------------------------------------------
-- Creates the `payment-receipts` PRIVATE bucket used by:
--   - Player booking receipts  →  bookings/{bookingId}/...
--   - Owner invoice receipts   →  invoices/{invoiceId}/...
--
-- All uploads are performed server-side via the service role (Server Actions).
-- All reads are via short-lived signed URLs generated server-side.
-- No public URL policy is needed — the bucket is private (public = false).
-- No INSERT/UPDATE RLS policy is granted to anon/authenticated; the service
-- role key bypasses RLS, which is the intended access pattern.
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-receipts',
  'payment-receipts',
  false,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public           = excluded.public,
  file_size_limit  = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
