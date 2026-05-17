-- ============================================================================
-- DinkHub — Remove launch promo from system_settings
-- ----------------------------------------------------------------------------
-- The launch promo (admin-wide ₱0 booking fee + homepage banner) is replaced
-- by the voucher system (per-code discounts, optionally venue-scoped). The
-- promo columns and the surrounding UI are deleted.
-- ============================================================================

alter table public.system_settings
  drop column if exists promo_active,
  drop column if exists promo_headline,
  drop column if exists promo_description,
  drop column if exists promo_until_date,
  drop column if exists promo_show_on_home,
  drop column if exists promo_show_on_booking;
