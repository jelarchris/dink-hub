-- ============================================================================
-- DinkHub — Voucher / discount-code system (Phase 1)
-- ----------------------------------------------------------------------------
-- Players paste a voucher code on the booking review step. The voucher
-- discounts ONLY the system/booking fee (never the court fee — that money
-- belongs to the venue). Two discount types: percent (1-100) or flat centavos.
--
-- Architectural decision:
--   The DISCOUNTED system fee is what gets snapshotted to
--   bookings.system_fee_centavos at creation. This avoids touching the
--   `total_centavos` generated column. Three new audit/display-only columns
--   on bookings track which voucher was used and how much was saved.
--
-- Atomicity:
--   Redemption-cap enforcement uses an atomic UPDATE inside the booking
--   transaction:
--     UPDATE vouchers SET redemption_count = redemption_count + 1
--      WHERE id = $1 AND (max_redemptions IS NULL OR redemption_count < max_redemptions)
--   No row returned ⇒ cap hit ⇒ booking transaction rolls back.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- enums
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'voucher_discount_type') then
    create type public.voucher_discount_type as enum ('percent', 'flat');
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'voucher_status') then
    create type public.voucher_status as enum ('active', 'paused', 'expired');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- vouchers
-- ---------------------------------------------------------------------------
create table if not exists public.vouchers (
  id uuid primary key default gen_random_uuid(),
  -- Normalised to uppercase by app; unique index below is on upper(code) to be safe.
  code text not null,
  discount_type public.voucher_discount_type not null,
  -- percent ⇒ 1..100 (whole percent). flat ⇒ positive centavos.
  discount_value bigint not null,
  -- Lifetime cap. NULL = unlimited.
  max_redemptions integer,
  redemption_count integer not null default 0,
  -- Per-user cap. 1 = one-shot per user (most common). 0 = unlimited per user.
  max_per_user integer not null default 1,
  -- Booking must have at least this much court fee for the code to apply.
  -- Defaults to 0 (no minimum). Stored in centavos.
  min_court_fee_centavos bigint not null default 0,
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  status public.voucher_status not null default 'active',
  notes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vouchers_value_positive check (discount_value > 0),
  constraint vouchers_percent_range check (
    discount_type <> 'percent' or (discount_value between 1 and 100)
  ),
  constraint vouchers_max_redemptions_nonneg check (
    max_redemptions is null or max_redemptions > 0
  ),
  constraint vouchers_redemption_count_nonneg check (redemption_count >= 0),
  constraint vouchers_max_per_user_nonneg check (max_per_user >= 0),
  constraint vouchers_min_fee_nonneg check (min_court_fee_centavos >= 0),
  constraint vouchers_window_valid check (
    valid_until is null or valid_until > valid_from
  )
);

-- Unique on uppercase code so 'foo20' and 'FOO20' can't both exist.
create unique index if not exists vouchers_code_upper_uniq
  on public.vouchers (upper(code));

create index if not exists vouchers_status_idx on public.vouchers (status);
create index if not exists vouchers_valid_until_idx on public.vouchers (valid_until);

-- ---------------------------------------------------------------------------
-- voucher_redemptions — one row per successful application
-- ---------------------------------------------------------------------------
create table if not exists public.voucher_redemptions (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers(id) on delete restrict,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  -- Centavos discounted from the booking fee (not the court fee).
  discount_applied_centavos bigint not null,
  created_at timestamptz not null default now(),

  constraint voucher_redemptions_discount_nonneg check (discount_applied_centavos >= 0),
  -- One redemption per booking — a booking cannot stack multiple codes.
  constraint voucher_redemptions_booking_uniq unique (booking_id)
);

create index if not exists voucher_redemptions_voucher_idx
  on public.voucher_redemptions (voucher_id);
create index if not exists voucher_redemptions_user_voucher_idx
  on public.voucher_redemptions (user_id, voucher_id);

-- ---------------------------------------------------------------------------
-- bookings — display/audit columns for the applied voucher
-- ---------------------------------------------------------------------------
alter table public.bookings
  add column if not exists voucher_id uuid references public.vouchers(id) on delete set null;
alter table public.bookings
  add column if not exists voucher_code_snapshot text;
alter table public.bookings
  add column if not exists discount_centavos bigint not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bookings_discount_nonneg'
  ) then
    alter table public.bookings
      add constraint bookings_discount_nonneg check (discount_centavos >= 0);
  end if;
end $$;

create index if not exists bookings_voucher_id_idx on public.bookings (voucher_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Note: the app uses a service-role DB connection (DATABASE_URL) and enforces
-- authorization via requireAdmin() in service code. RLS policies below are
-- defense-in-depth for any future direct-from-client query paths.
-- ---------------------------------------------------------------------------
alter table public.vouchers enable row level security;
alter table public.voucher_redemptions enable row level security;

-- Authenticated users can read active vouchers for code validation.
-- (No public/anon read — codes are private until someone authenticates.)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'vouchers'
      and policyname = 'vouchers_authenticated_read_active'
  ) then
    create policy vouchers_authenticated_read_active
      on public.vouchers
      for select
      to authenticated
      using (status = 'active');
  end if;
end $$;

-- Admin full access to vouchers.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'vouchers'
      and policyname = 'vouchers_admin_all'
  ) then
    create policy vouchers_admin_all
      on public.vouchers
      for all
      to authenticated
      using (
        exists (select 1 from public.admin_users a where a.user_id = auth.uid())
      )
      with check (
        exists (select 1 from public.admin_users a where a.user_id = auth.uid())
      );
  end if;
end $$;

-- Users can read their own redemptions.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voucher_redemptions'
      and policyname = 'voucher_redemptions_user_read_own'
  ) then
    create policy voucher_redemptions_user_read_own
      on public.voucher_redemptions
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;
end $$;

-- Admin full access to redemptions.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'voucher_redemptions'
      and policyname = 'voucher_redemptions_admin_all'
  ) then
    create policy voucher_redemptions_admin_all
      on public.voucher_redemptions
      for all
      to authenticated
      using (
        exists (select 1 from public.admin_users a where a.user_id = auth.uid())
      )
      with check (
        exists (select 1 from public.admin_users a where a.user_id = auth.uid())
      );
  end if;
end $$;
