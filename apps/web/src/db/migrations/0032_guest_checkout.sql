-- ============================================================================
-- 0032_guest_checkout.sql — silent-account guest checkout
--
-- Goal: let a player book + pay without seeing a sign-up form. Behind the
-- scenes we still create a real auth user + profile so EVERY existing feature
-- (no-show tracking, owner refunds, /me/bookings, ledger, reviews, RLS, etc.)
-- keeps working unchanged.
--
-- 1. profiles.signup_method — distinguishes accounts that came in through the
--    classic password sign-up from those silently created at booking time so
--    the magic-link onboarding email knows which template to use and the
--    owner dashboard can later badge guest-only players.
-- 2. venues.allow_guest_checkout — per-venue opt-out (default ON). Owners
--    burned by fraud can disable it without code change.
-- 3. partial index on guest profiles by phone — backs future per-phone
--    fraud throttling without slowing the password-signup hot path.
-- ============================================================================

-- 1. signup-method enum + column ---------------------------------------------
create type public.user_signup_method as enum ('password', 'guest_magic_link');

alter table public.profiles
  add column signup_method public.user_signup_method not null default 'password';

-- Existing rows backfill to 'password' via the default. New guest signups
-- override at insert time. No data migration needed.

-- 2. per-venue toggle --------------------------------------------------------
alter table public.venues
  add column allow_guest_checkout boolean not null default true;

-- 3. phone-based dedupe support ----------------------------------------------
-- Partial index: only indexes guest-created profiles that supplied a phone,
-- which keeps it tiny and irrelevant to the password sign-up path.
create index if not exists profiles_guest_phone_idx
  on public.profiles (phone_e164)
  where signup_method = 'guest_magic_link' and phone_e164 is not null;
