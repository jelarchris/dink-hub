-- Adds per-owner notification preferences to profiles.
-- All three channels default to true so existing owners keep their current
-- (implicit all-on) behaviour without any data backfill.
--
-- The CHECK constraint catches bad writes at the DB level: the stored value
-- must be a JSON object with exactly the three expected boolean keys present.

alter table public.profiles
  add column notification_prefs jsonb not null
    default '{"email_daily_digest":true,"email_on_payment_submitted":true,"email_on_booking_cancelled":true}'::jsonb;

-- Prevent storing an invalid shape (e.g. an array, a string, or an object
-- missing one of the required keys).
alter table public.profiles
  add constraint profiles_notification_prefs_shape check (
    jsonb_typeof(notification_prefs) = 'object'
    and jsonb_typeof(notification_prefs -> 'email_daily_digest')        = 'boolean'
    and jsonb_typeof(notification_prefs -> 'email_on_payment_submitted') = 'boolean'
    and jsonb_typeof(notification_prefs -> 'email_on_booking_cancelled') = 'boolean'
  );
