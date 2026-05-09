-- ============================================================================
-- DinkHub — Reset script
-- Drops everything created by 0001_init.sql so it can be re-run cleanly.
-- SAFE during early dev. NEVER run on production.
-- ============================================================================

-- Drop tables (cascade handles policies, triggers, indexes, FKs)
drop table if exists public.ledger_entries cascade;
drop table if exists public.venue_payouts cascade;
drop table if exists public.payments cascade;
drop table if exists public.slot_holds cascade;
drop table if exists public.bookings cascade;
drop table if exists public.system_fee_settings cascade;
drop table if exists public.courts cascade;
drop table if exists public.venues cascade;
drop table if exists public.profiles cascade;
drop table if exists public.admin_users cascade;

-- Drop enums
drop type if exists public.payout_status cascade;
drop type if exists public.ledger_direction cascade;
drop type if exists public.ledger_account cascade;
drop type if exists public.payment_status cascade;
drop type if exists public.booking_status cascade;
drop type if exists public.court_surface cascade;
drop type if exists public.venue_status cascade;
drop type if exists public.user_role cascade;

-- Drop helper functions
drop function if exists public.current_system_fee_centavos() cascade;
drop function if exists public.is_admin() cascade;
drop function if exists public.bump_version() cascade;
drop function if exists public.set_updated_at() cascade;
