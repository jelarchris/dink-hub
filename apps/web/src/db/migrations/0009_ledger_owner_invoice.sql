-- ============================================================================
-- DinkHub — Phase 2 Owner Invoices: ledger linkage
-- ----------------------------------------------------------------------------
-- When an admin verifies an owner invoice (venue paid DinkHub the booking-fee
-- total via GCash), the service writes balanced ledger entries:
--     D platform_cash       (real cash received from venue)
--     C venue_payable       (offsets the fee portion of what was virtually
--                            owed back to the venue at booking confirmation)
--
-- Existing ledger_entries rows must reference exactly one of `booking_id`
-- or `payout_id` (or both, for payout-related booking entries). We widen the
-- check constraint to allow invoice-sourced entries while preserving the
-- "at least one source" invariant.
-- ============================================================================

alter table public.ledger_entries
  add column owner_invoice_id uuid references public.owner_invoices(id) on delete restrict;

create index ledger_owner_invoice_idx on public.ledger_entries (owner_invoice_id);

alter table public.ledger_entries
  drop constraint ledger_one_source;

alter table public.ledger_entries
  add constraint ledger_one_source check (
    -- Booking-sourced (with optional payout linkage for settlement entries)
    (booking_id is not null and payout_id is null     and owner_invoice_id is null)
    or (booking_id is not null and payout_id is not null and owner_invoice_id is null)
    -- Payout settlement entries (no booking)
    or (booking_id is null and payout_id is not null and owner_invoice_id is null)
    -- Owner-invoice verification entries (no booking, no payout)
    or (booking_id is null and payout_id is null     and owner_invoice_id is not null)
  );
