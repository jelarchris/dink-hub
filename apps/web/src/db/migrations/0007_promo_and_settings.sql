-- ============================================================================
-- DinkHub — Platform-wide settings + launch promo
-- ----------------------------------------------------------------------------
-- Single-row settings table that drives:
--   * Launch promo (homepage banner + booking-page callout + ₱0 booking fee)
--   * Base booking fee (used when promo is OFF — replaces hand-edited
--     system_fee_settings going forward; the legacy table is left intact for
--     historical reference and may be removed in a future migration.)
--   * DinkHub's own GCash details (used by venue owners to remit weekly
--     booking-fee invoices in Phase 2).
--
-- Public read is required: the homepage banner is rendered for anonymous
-- visitors. Writes are admin-only via a Server Action that re-checks role
-- in app code AND via the policy below.
-- ============================================================================

create table if not exists public.system_settings (
  -- Single-row enforcement: id is a boolean PK constrained to TRUE, so any
  -- INSERT collides with the seeded row.
  id boolean primary key default true,
  promo_active boolean not null default true,
  promo_headline text not null default 'Launch Promo — No Booking Fees!',
  promo_description text not null default 'Free for the first 2 months. Pay only the court fee.',
  promo_until_date date,
  promo_show_on_home boolean not null default true,
  promo_show_on_booking boolean not null default true,
  base_booking_fee_centavos bigint not null default 2000,
  invoice_due_days integer not null default 7,
  dinkhub_gcash_account_name text,
  dinkhub_gcash_account_number text,
  dinkhub_gcash_qr_image_path text,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now(),
  constraint system_settings_singleton check (id = true),
  constraint system_settings_fee_nonneg check (base_booking_fee_centavos >= 0),
  constraint system_settings_due_pos check (invoice_due_days > 0)
);

-- Seed the singleton row. ON CONFLICT (id) DO NOTHING is a no-op when the row
-- already exists (re-run-safe).
insert into public.system_settings (id, promo_active, promo_headline, promo_description, promo_until_date)
values (
  true,
  true,
  'Launch Promo — No Booking Fees!',
  'Free for the first 2 months. Pay only the court fee.',
  date '2026-07-11'
)
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------
alter table public.system_settings enable row level security;

-- Public read: the launch banner needs to render for anonymous visitors.
-- There are no secrets in this table — the DinkHub GCash QR is a payment
-- destination and is intentionally distributable.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'system_settings'
      and policyname = 'system_settings_public_read'
  ) then
    create policy system_settings_public_read
      on public.system_settings
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

-- Writes are restricted to admins. App code re-checks this via requireAdmin().
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'system_settings'
      and policyname = 'system_settings_admin_write'
  ) then
    create policy system_settings_admin_write
      on public.system_settings
      for update
      to authenticated
      using (
        exists (select 1 from public.admin_users a where a.user_id = auth.uid())
      )
      with check (
        exists (select 1 from public.admin_users a where a.user_id = auth.uid())
      );
  end if;
end $$;
