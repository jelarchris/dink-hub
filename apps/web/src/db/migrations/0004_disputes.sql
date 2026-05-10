-- ============================================================================
-- DinkHub — Phase 2.7b Payment Disputes
-- ----------------------------------------------------------------------------
-- Adds dispute fields to payments. Resolution is one of:
--   'refund_full' — booking flips to 'refunded', payment status to 'rejected',
--                   reversal ledger entries written.
--   'rejected'    — admin denies the dispute, payment returns to 'verified'.
-- ============================================================================

alter table public.payments
  add column if not exists dispute_reason       text,
  add column if not exists dispute_opened_at    timestamptz,
  add column if not exists dispute_opened_by    uuid references public.profiles(id) on delete restrict,
  add column if not exists dispute_resolution   text check (dispute_resolution in ('refund_full', 'rejected')),
  add column if not exists dispute_resolved_at  timestamptz,
  add column if not exists dispute_resolved_by  uuid references public.profiles(id) on delete restrict;

create index if not exists payments_disputed_idx
  on public.payments (status) where status = 'disputed';
