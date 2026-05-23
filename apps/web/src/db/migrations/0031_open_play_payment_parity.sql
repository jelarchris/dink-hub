-- 0031_open_play_payment_parity.sql
-- Open Play payment parity with regular bookings (mirrors migration 0030).
--
-- Bug being fixed: `verifySignupPayment` flips a signup to 'confirmed' but
-- writes ZERO ledger entries, so the venue never gets credited for the
-- court fee and the platform never books the system fee revenue. Every
-- open-play payout has therefore been short by the entire open-play take.
--
-- This migration adds:
--   1. ledger_entries.open_play_signup_id (new FK) + at-least-one subject CHECK
--      so signup-scoped entries can be persisted and reported on alongside
--      booking-scoped ones without losing payout/owner_invoice rows.
--   2. open_play_signups.auto_confirm_at — SLA deadline mirroring
--      bookings.auto_confirm_at (T-30m at session start when validation passes).
--   3. 9 audit columns on open_play_signup_payments mirroring payments
--      (auto_validated_at, auto_validation_failures[], auto_confirmed_*,
--      owner_nudge1/2, late_confirmed_*).
--   4. Partial indexes for the new cron paths (nudge1, nudge2, ref/hash lookup,
--      signup auto-confirm queue).
--
-- Forward-only. Backfill is not needed — new columns are nullable / empty
-- defaults; existing rows behave exactly as before until the new service
-- paths run.

-- 1) ledger_entries: support signup-scoped entries -------------------------
-- Drop the implicit NOT NULL on booking_id so signup-only rows can be inserted.
-- Existing rows are unaffected (all currently have booking_id set).
alter table public.ledger_entries
  alter column booking_id drop not null;

alter table public.ledger_entries
  add column if not exists open_play_signup_id uuid
    references public.open_play_signups(id);

-- "At-least-one subject" — every entry must be tied to a booking, a signup,
-- a payout, or an owner_invoice. This codifies the existing invariant that
-- markPayoutPaid uses payout_id and the owner-invoice settlement uses
-- owner_invoice_id while booking confirms use booking_id; the new path will
-- use open_play_signup_id.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ledger_entries_subject_present'
      and conrelid = 'public.ledger_entries'::regclass
  ) then
    alter table public.ledger_entries
      add constraint ledger_entries_subject_present
      check (
        booking_id is not null
        or open_play_signup_id is not null
        or payout_id is not null
        or owner_invoice_id is not null
      );
  end if;
end$$;

create index if not exists ledger_entries_open_play_signup_idx
  on public.ledger_entries (open_play_signup_id)
  where open_play_signup_id is not null;

comment on column public.ledger_entries.open_play_signup_id is
  'When set, this entry settles an Open Play signup (analogous to booking_id for regular bookings). Exactly one of booking_id / open_play_signup_id is expected for confirm/refund rows.';

-- 2) Signup SLA deadline ---------------------------------------------------
alter table public.open_play_signups
  add column if not exists auto_confirm_at timestamptz;

create index if not exists open_play_signups_auto_confirm_at_idx
  on public.open_play_signups (auto_confirm_at)
  where status = 'payment_submitted' and auto_confirm_at is not null;

comment on column public.open_play_signups.auto_confirm_at is
  'When set, cron auto-confirms the signup at this time if the owner has not verified the receipt. Cleared on owner verify/reject.';

-- 3) Signup payment audit columns -----------------------------------------
alter table public.open_play_signup_payments
  add column if not exists auto_validated_at timestamptz,
  add column if not exists auto_validation_failures text[] not null default '{}'::text[],
  add column if not exists auto_confirmed_at timestamptz,
  add column if not exists auto_confirmed_reason text,
  add column if not exists owner_nudge1_sent_at timestamptz,
  add column if not exists owner_nudge2_sent_at timestamptz,
  add column if not exists late_confirmed_at timestamptz,
  add column if not exists late_confirmed_by uuid references public.profiles(id),
  add column if not exists late_confirmed_reason text;

create index if not exists open_play_signup_payments_owner_nudge1_due_idx
  on public.open_play_signup_payments (submitted_at)
  where status = 'submitted' and owner_nudge1_sent_at is null;

create index if not exists open_play_signup_payments_owner_nudge2_due_idx
  on public.open_play_signup_payments (submitted_at)
  where status = 'submitted' and owner_nudge2_sent_at is null;

create index if not exists open_play_signup_payments_ref_lookup_idx
  on public.open_play_signup_payments (gcash_reference_number)
  where gcash_reference_number is not null;

create index if not exists open_play_signup_payments_hash_lookup_idx
  on public.open_play_signup_payments (receipt_hash);

comment on column public.open_play_signup_payments.auto_validation_failures is
  'Heuristic check codes that failed at submit time (ref_format, ref_duplicate, hash_replay, window_late, window_early). Empty array = all heuristics passed.';
comment on column public.open_play_signup_payments.auto_confirmed_at is
  'Set when the SLA cron auto-confirmed this payment because the owner did not verify in time.';
comment on column public.open_play_signup_payments.late_confirmed_at is
  'Set when an admin force-confirmed this payment after session end (manual recovery flow).';
