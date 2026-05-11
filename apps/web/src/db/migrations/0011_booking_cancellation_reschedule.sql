-- ============================================================================
-- 0011_booking_cancellation_reschedule.sql
-- ----------------------------------------------------------------------------
-- Adds structured cancellation metadata + reschedule audit trail to bookings.
-- Enables owner-initiated cancel/reschedule (Tier 4) without touching ledger.
--
-- - cancellation_category: enum for analytics (weather, court_unavailable, ...)
-- - cancelled_at / cancelled_by / cancellation_reason: who/when/why
-- - original_start_at / original_end_at: preserved across multiple reschedules
-- - rescheduled_count / last_rescheduled_at / last_rescheduled_by: audit
--
-- A CHECK constraint guarantees terminal cancellation states always carry
-- cancelled_at — defense-in-depth so future code paths can't drop the field.
-- `expired` (cron auto-termination) is intentionally excluded from the CHECK
-- because it is not a user-initiated cancellation; the cron path stays simple.
--
-- No new RLS policies: bookings_owner_update (from 0001) already permits owner
-- writes; all mutation paths go through service-role server actions anyway.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- cancellation_category enum
-- ---------------------------------------------------------------------------
create type public.cancellation_category as enum (
  'weather',
  'court_unavailable',
  'venue_closure',
  'player_request',
  'admin_action',
  'other'
);

-- ---------------------------------------------------------------------------
-- bookings: new columns
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column cancelled_at          timestamptz null,
  add column cancelled_by          uuid        null references public.profiles(id),
  add column cancellation_reason   text        null,
  add column cancellation_category public.cancellation_category null,
  add column original_start_at     timestamptz null,
  add column original_end_at       timestamptz null,
  add column rescheduled_count     integer     not null default 0,
  add column last_rescheduled_at   timestamptz null,
  add column last_rescheduled_by   uuid        null references public.profiles(id);

-- ---------------------------------------------------------------------------
-- Backfill existing terminal-state bookings so the CHECK constraint passes.
-- updated_at is the best available proxy for cancelled_at on legacy rows.
-- ---------------------------------------------------------------------------
update public.bookings
   set cancelled_at = updated_at
 where status in ('cancelled', 'no_show', 'refunded')
   and cancelled_at is null;

-- ---------------------------------------------------------------------------
-- CHECK: terminal cancellation states must carry a timestamp going forward.
-- ---------------------------------------------------------------------------
alter table public.bookings
  add constraint bookings_cancelled_at_consistency
  check (
    (status in ('cancelled', 'no_show', 'refunded') and cancelled_at is not null)
    or
    (status not in ('cancelled', 'no_show', 'refunded'))
  );

-- ---------------------------------------------------------------------------
-- Index: cancellation analytics + audit queries (filter on non-null only)
-- ---------------------------------------------------------------------------
create index bookings_cancelled_at_idx on public.bookings (cancelled_at desc)
  where cancelled_at is not null;
