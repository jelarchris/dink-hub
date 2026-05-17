-- ============================================================================
-- DinkHub — Voucher venue scoping (optional single-venue restriction)
-- ----------------------------------------------------------------------------
-- Adds an optional `venue_id` to vouchers:
--   NULL  ⇒ voucher works at ANY venue (global, as before)
--   SET   ⇒ voucher only redeemable for bookings at that venue
-- ON DELETE SET NULL so removing a venue doesn't orphan or 500 the system;
-- the voucher quietly falls back to "global". Admins will see the visual cue
-- in the UI and can clean it up.
-- ============================================================================

alter table public.vouchers
  add column if not exists venue_id uuid references public.venues(id) on delete set null;

create index if not exists vouchers_venue_id_idx
  on public.vouchers (venue_id)
  where venue_id is not null;
