-- 0030_receipt_auto_validation.sql
-- Receipt auto-validation + SLA auto-confirm + owner verification nudges.
--
-- Adds columns to track:
--   - heuristic validation outcomes on submitted payments
--   - SLA deadline at which an unverified booking auto-confirms
--   - owner nudge dispatch timestamps (T+15m, T+45m)
--   - admin "late confirm" audit trail for receipts surfaced after start_at
--
-- Forward-only. No backfill needed — new columns are nullable, existing rows
-- behave exactly as before until the corresponding service paths run.

-- 1) Booking SLA deadline ---------------------------------------------------
alter table public.bookings
  add column if not exists auto_confirm_at timestamptz;

create index if not exists bookings_auto_confirm_at_idx
  on public.bookings (auto_confirm_at)
  where status = 'payment_submitted' and auto_confirm_at is not null;

comment on column public.bookings.auto_confirm_at is
  'When set, cron auto-confirms the booking at this time if the owner has not verified the receipt. Cleared on owner verify/reject.';

-- 2) Payment heuristic + nudge + late-confirm audit ------------------------
alter table public.payments
  add column if not exists auto_validated_at timestamptz,
  add column if not exists auto_validation_failures text[] not null default '{}'::text[],
  add column if not exists auto_confirmed_at timestamptz,
  add column if not exists auto_confirmed_reason text,
  add column if not exists owner_nudge1_sent_at timestamptz,
  add column if not exists owner_nudge2_sent_at timestamptz,
  add column if not exists late_confirmed_at timestamptz,
  add column if not exists late_confirmed_by uuid references public.profiles(id),
  add column if not exists late_confirmed_reason text;

create index if not exists payments_owner_nudge1_due_idx
  on public.payments (submitted_at)
  where status = 'submitted' and owner_nudge1_sent_at is null;

create index if not exists payments_owner_nudge2_due_idx
  on public.payments (submitted_at)
  where status = 'submitted' and owner_nudge2_sent_at is null;

-- Heuristic lookups (used by submitPayment to detect duplicate ref / replayed hash).
create index if not exists payments_ref_lookup_idx
  on public.payments (gcash_reference_number)
  where gcash_reference_number is not null;

create index if not exists payments_hash_lookup_idx
  on public.payments (receipt_hash);

comment on column public.payments.auto_validation_failures is
  'Heuristic check codes that failed at submit time (e.g. amount_mismatch_window, ref_collision_window, hash_replay_window). Empty array = all heuristics passed.';
comment on column public.payments.auto_confirmed_at is
  'Set when the SLA cron auto-confirmed this payment because the owner did not verify in time.';
comment on column public.payments.late_confirmed_at is
  'Set when an admin force-confirmed this payment after start_at (manual recovery flow).';
