-- ============================================================================
-- DinkHub — Per-booking notification email override
-- ----------------------------------------------------------------------------
-- Players can edit the contact email in the booking modal. We persist that
-- value on the booking row so all notifications for THIS booking go to it,
-- while the player's account email (profiles.email) remains unchanged.
-- NULL = fall back to profiles.email (existing behaviour).
-- ============================================================================

alter table public.bookings
  add column if not exists contact_email text;

comment on column public.bookings.contact_email is
  'Per-booking notification email override entered by the player on the booking modal. Falls back to profiles.email when NULL.';
