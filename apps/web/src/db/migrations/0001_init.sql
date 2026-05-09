-- ============================================================================
-- DinkHub — Phase 1 Initial Schema
-- ----------------------------------------------------------------------------
-- This migration:
--   1. Enables required extensions (gist for EXCLUDE, pgcrypto for UUIDs)
--   2. Creates all core tables with database-enforced invariants
--   3. Enables Row Level Security (RLS) on every table — default deny
--   4. Defines policies for player / venue-owner / admin access patterns
--   5. Installs the EXCLUDE constraint that makes double-booking
--      physically impossible at the DB level
--
-- Money is stored as bigint centavos (PHP). NEVER use float.
-- All timestamps are timestamptz. Display in Asia/Manila at the UI layer only.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "btree_gist"; -- EXCLUDE with = operator
create extension if not exists "citext";     -- case-insensitive emails

-- ----------------------------------------------------------------------------
-- Helper: trigger function to auto-update `updated_at`
-- ----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Helper: optimistic concurrency — bump version on every UPDATE
-- ----------------------------------------------------------------------------
create or replace function public.bump_version()
returns trigger language plpgsql as $$
begin
  new.version = old.version + 1;
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- Helper: is_admin() — checked via custom JWT claim or admin_users table
-- ----------------------------------------------------------------------------
create table public.admin_users (
  user_id   uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users(id)
);
alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

-- Only admins can read/write the admin list
create policy admin_users_read on public.admin_users
  for select to authenticated using (public.is_admin());
create policy admin_users_write on public.admin_users
  for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- 1. PROFILES — extends auth.users with public profile data
-- ============================================================================
create type public.user_role as enum ('player', 'venue_owner', 'admin');

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(display_name) between 2 and 60),
  email       citext not null unique,
  phone_e164  text check (phone_e164 ~ '^\+63[0-9]{10}$'),  -- +63XXXXXXXXXX
  avatar_url  text,
  role        public.user_role not null default 'player',
  city        text,
  province    text,
  rating_glicko numeric(6,2) default 1500.00,
  rating_rd     numeric(6,2) default 350.00,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
alter table public.profiles enable row level security;

create index profiles_role_idx on public.profiles (role) where deleted_at is null;
create index profiles_city_idx on public.profiles (city) where deleted_at is null;

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- RLS: anyone authenticated can read non-deleted profiles (display info is public).
-- Users can only update their OWN profile.
create policy profiles_read on public.profiles
  for select to authenticated using (deleted_at is null);
create policy profiles_self_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on public.profiles
  for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- 2. VENUES — owned by venue_owner profiles
-- ============================================================================
create type public.venue_status as enum ('draft', 'pending_review', 'active', 'suspended');

create table public.venues (
  id            uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references public.profiles(id) on delete restrict,
  name         text not null check (length(name) between 2 and 120),
  slug         citext not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,80}$'),
  description  text,
  address_line text not null,
  city         text not null,
  province     text not null default 'Agusan del Sur',
  postal_code  text,
  -- Geo (lat/lng as numeric for Philippines bounding box; PostGIS later if needed)
  latitude     numeric(9,6) check (latitude between 4.0 and 22.0),
  longitude    numeric(9,6) check (longitude between 116.0 and 127.0),
  -- GCash payout details (server-encrypted at rest in app layer; access logged)
  gcash_account_name   text,
  gcash_account_number text check (gcash_account_number ~ '^09[0-9]{9}$'),
  cover_image_url      text,
  status       public.venue_status not null default 'draft',
  version      integer not null default 1,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);
alter table public.venues enable row level security;

create index venues_owner_idx on public.venues (owner_id) where deleted_at is null;
create index venues_status_city_idx on public.venues (status, city) where deleted_at is null;
create index venues_geo_idx on public.venues (latitude, longitude) where status = 'active' and deleted_at is null;

create trigger venues_bump_version before update on public.venues
  for each row execute function public.bump_version();

-- RLS:
-- - Public can read ACTIVE venues only
-- - Owner can read/write THEIR OWN venues regardless of status
-- - Admin: full access
create policy venues_public_read on public.venues
  for select to anon, authenticated
  using (status = 'active' and deleted_at is null);
create policy venues_owner_read on public.venues
  for select to authenticated using (owner_id = auth.uid());
create policy venues_owner_insert on public.venues
  for insert to authenticated with check (owner_id = auth.uid());
create policy venues_owner_update on public.venues
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy venues_admin_all on public.venues
  for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- 3. COURTS — individual courts within a venue
-- ============================================================================
create type public.court_surface as enum ('hard', 'cushioned', 'wood', 'outdoor_sport', 'other');

create table public.courts (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references public.venues(id) on delete cascade,
  name            text not null check (length(name) between 1 and 60),
  surface         public.court_surface not null default 'hard',
  is_indoor       boolean not null default false,
  -- Default hourly rate in centavos. Per-slot pricing override comes later.
  hourly_rate_centavos bigint not null check (hourly_rate_centavos between 0 and 100000000),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (venue_id, name)
);
alter table public.courts enable row level security;

create index courts_venue_idx on public.courts (venue_id) where deleted_at is null;

create trigger courts_updated_at before update on public.courts
  for each row execute function public.set_updated_at();

create policy courts_public_read on public.courts
  for select to anon, authenticated
  using (
    is_active = true
    and deleted_at is null
    and exists (
      select 1 from public.venues v
      where v.id = venue_id and v.status = 'active' and v.deleted_at is null
    )
  );
create policy courts_owner_all on public.courts
  for all to authenticated
  using (exists (select 1 from public.venues v where v.id = venue_id and v.owner_id = auth.uid()))
  with check (exists (select 1 from public.venues v where v.id = venue_id and v.owner_id = auth.uid()));
create policy courts_admin_all on public.courts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- 4. SYSTEM FEE SETTINGS — admin-editable, snapshotted to bookings
-- ============================================================================
create table public.system_fee_settings (
  id                  uuid primary key default gen_random_uuid(),
  fee_amount_centavos bigint not null check (fee_amount_centavos between 0 and 10000000),
  effective_from      timestamptz not null default now(),
  updated_by          uuid references public.profiles(id),
  notes               text,
  created_at          timestamptz not null default now()
);
alter table public.system_fee_settings enable row level security;

create index system_fee_effective_idx on public.system_fee_settings (effective_from desc);

-- Anyone authenticated can read the current fee (it's shown to players at booking time)
create policy system_fee_read on public.system_fee_settings
  for select to authenticated using (true);
-- Only admins can change it (history is preserved — never UPDATE, only INSERT new row)
create policy system_fee_admin_write on public.system_fee_settings
  for insert to authenticated with check (public.is_admin());

-- Helper: get the currently-effective system fee
create or replace function public.current_system_fee_centavos()
returns bigint language sql stable as $$
  select fee_amount_centavos
  from public.system_fee_settings
  where effective_from <= now()
  order by effective_from desc
  limit 1;
$$;


-- ============================================================================
-- 5. BOOKINGS — the heart of DinkHub
-- ----------------------------------------------------------------------------
-- DOUBLE-BOOKING IS PHYSICALLY IMPOSSIBLE via the EXCLUDE constraint below.
-- Statuses that "free up" the slot: cancelled, no_show, expired
-- ============================================================================
create type public.booking_status as enum (
  'pending_payment',     -- created, awaiting receipt
  'payment_submitted',   -- receipt uploaded, awaiting venue verification
  'confirmed',           -- venue verified payment, slot locked
  'cancelled',           -- player cancelled within 15-min window
  'no_show',             -- player didn't arrive (venue marks)
  'expired',             -- 15-min payment window elapsed without receipt
  'refunded'             -- post-confirmation refund (admin/owner)
);

create table public.bookings (
  id                       uuid primary key default gen_random_uuid(),
  player_id                uuid not null references public.profiles(id) on delete restrict,
  venue_id                 uuid not null references public.venues(id) on delete restrict,
  court_id                 uuid not null references public.courts(id) on delete restrict,
  start_at                 timestamptz not null,
  end_at                   timestamptz not null,
  status                   public.booking_status not null default 'pending_payment',
  -- Money snapshots at booking creation (immutable for audit)
  court_fee_centavos       bigint not null check (court_fee_centavos >= 0),
  system_fee_centavos      bigint not null check (system_fee_centavos >= 0),
  total_centavos           bigint generated always as (court_fee_centavos + system_fee_centavos) stored,
  -- 15-min refund window
  cancellable_until        timestamptz not null,
  -- Payment hold timeout — receipt must be uploaded by this time
  payment_due_at           timestamptz not null,
  notes                    text,
  -- Optimistic concurrency
  version                  integer not null default 1,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  -- Domain invariants
  constraint booking_time_valid    check (end_at > start_at),
  constraint booking_min_30_min    check (end_at >= start_at + interval '30 minutes'),
  constraint booking_max_4_hours   check (end_at <= start_at + interval '4 hours'),
  constraint booking_30_min_grain  check (
    extract(minute from start_at)::int % 30 = 0
    and extract(second from start_at)::int = 0
    and extract(minute from end_at)::int % 30 = 0
    and extract(second from end_at)::int = 0
  )
);
alter table public.bookings enable row level security;

-- 🎯 THE MAGIC: physically prevent double-booking on the same court.
-- Two bookings for the same court whose time ranges overlap are rejected
-- by Postgres before the row hits disk. No race condition possible.
alter table public.bookings add constraint bookings_no_double_book
  exclude using gist (
    court_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  )
  where (status not in ('cancelled', 'no_show', 'expired', 'refunded'));

create index bookings_player_idx     on public.bookings (player_id, created_at desc);
create index bookings_venue_status_idx on public.bookings (venue_id, status);
create index bookings_court_time_idx on public.bookings (court_id, start_at);
create index bookings_status_due_idx on public.bookings (status, payment_due_at)
  where status = 'pending_payment';

create trigger bookings_bump_version before update on public.bookings
  for each row execute function public.bump_version();

-- RLS:
-- - Player sees their own bookings
-- - Venue owner sees bookings on their venues
-- - Admin: all
create policy bookings_player_read on public.bookings
  for select to authenticated using (player_id = auth.uid());
create policy bookings_player_insert on public.bookings
  for insert to authenticated with check (player_id = auth.uid());
create policy bookings_player_update on public.bookings
  for update to authenticated
  using (player_id = auth.uid() and status in ('pending_payment', 'payment_submitted'))
  with check (player_id = auth.uid());

create policy bookings_owner_read on public.bookings
  for select to authenticated
  using (exists (select 1 from public.venues v where v.id = venue_id and v.owner_id = auth.uid()));
create policy bookings_owner_update on public.bookings
  for update to authenticated
  using (exists (select 1 from public.venues v where v.id = venue_id and v.owner_id = auth.uid()))
  with check (exists (select 1 from public.venues v where v.id = venue_id and v.owner_id = auth.uid()));

create policy bookings_admin_all on public.bookings
  for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- 6. SLOT HOLDS — temporary reservation while user picks/pays
-- ----------------------------------------------------------------------------
-- 15-min hold on slot picker, refreshed to 15-min on payment screen.
-- Cron job releases expired holds (slot_holds where expires_at < now()).
-- Holds also use the EXCLUDE constraint to prevent two players grabbing
-- the same slot simultaneously.
-- ============================================================================
create table public.slot_holds (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid not null references public.profiles(id) on delete cascade,
  court_id    uuid not null references public.courts(id) on delete cascade,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  constraint slot_hold_time_valid check (end_at > start_at)
);
alter table public.slot_holds enable row level security;

-- Anti-overlap constraint applies to ALL hold rows. Expired holds are
-- DELETED by the cron job (not marked expired) so they stop blocking new holds.
-- We can't filter by `expires_at > now()` here because now() is STABLE,
-- and Postgres requires index predicates to be IMMUTABLE.
alter table public.slot_holds add constraint slot_holds_no_overlap
  exclude using gist (
    court_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  );

create index slot_holds_expires_idx on public.slot_holds (expires_at);
create index slot_holds_player_idx  on public.slot_holds (player_id);

create policy slot_holds_owner_all on public.slot_holds
  for all to authenticated
  using (player_id = auth.uid()) with check (player_id = auth.uid());
create policy slot_holds_admin_all on public.slot_holds
  for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- 7. PAYMENTS — GCash receipts uploaded by players, verified by venues
-- ----------------------------------------------------------------------------
-- One receipt per booking (single-transfer model). Idempotency via unique
-- (booking_id, receipt_hash) so re-upload of same image doesn't create dupes.
-- ============================================================================
create type public.payment_status as enum (
  'submitted',  -- player uploaded receipt
  'verified',   -- venue confirmed money received
  'rejected',   -- venue marked receipt invalid
  'disputed'    -- escalated to admin
);

create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null unique references public.bookings(id) on delete restrict,
  -- Storage path inside private 'payment-receipts' bucket. Never a public URL.
  receipt_image_path text not null,
  receipt_hash    text not null,  -- sha256 of the uploaded file (idempotency)
  amount_centavos bigint not null check (amount_centavos > 0),
  gcash_reference_number text check (length(gcash_reference_number) between 6 and 20),
  status          public.payment_status not null default 'submitted',
  submitted_by    uuid not null references public.profiles(id),
  submitted_at    timestamptz not null default now(),
  verified_by     uuid references public.profiles(id),
  verified_at     timestamptz,
  rejection_reason text,
  version         integer not null default 1,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (booking_id, receipt_hash)
);
alter table public.payments enable row level security;

create index payments_booking_idx on public.payments (booking_id);
create index payments_status_idx  on public.payments (status, submitted_at);

create trigger payments_bump_version before update on public.payments
  for each row execute function public.bump_version();

-- RLS: player can read+create their own payment, venue owner can read+verify
create policy payments_player_read on public.payments
  for select to authenticated
  using (exists (select 1 from public.bookings b where b.id = booking_id and b.player_id = auth.uid()));
create policy payments_player_insert on public.payments
  for insert to authenticated
  with check (
    submitted_by = auth.uid()
    and exists (select 1 from public.bookings b where b.id = booking_id and b.player_id = auth.uid())
  );
create policy payments_owner_read on public.payments
  for select to authenticated
  using (exists (
    select 1 from public.bookings b
    join public.venues v on v.id = b.venue_id
    where b.id = booking_id and v.owner_id = auth.uid()
  ));
create policy payments_owner_update on public.payments
  for update to authenticated
  using (exists (
    select 1 from public.bookings b
    join public.venues v on v.id = b.venue_id
    where b.id = booking_id and v.owner_id = auth.uid()
  ));
create policy payments_admin_all on public.payments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- 8. LEDGER ENTRIES — double-entry accounting for every booking
-- ----------------------------------------------------------------------------
-- For every confirmed booking, two entries are written in a transaction:
--   1. DEBIT  venue_payable      (we owe the venue the court fee)
--   2. CREDIT platform_revenue   (we earned the system fee)
--
-- For weekly payouts:
--   3. CREDIT venue_payable      (paid out to venue)
--   4. DEBIT  platform_cash      (money left our system)
--
-- Sum of debits MUST equal sum of credits per booking_id (asserted in service layer).
-- Entries are immutable — never UPDATE or DELETE. Adjustments via reversing entries.
-- ============================================================================
create type public.ledger_account as enum (
  'venue_payable',     -- liability: we owe the venue
  'platform_revenue',  -- income: system fee earned
  'platform_cash',     -- asset: cash held
  'venue_refund',      -- contra-revenue: refund to player
  'fee_writeoff'       -- expense: uncollectable fee
);

create type public.ledger_direction as enum ('debit', 'credit');

create table public.ledger_entries (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid references public.bookings(id) on delete restrict,
  payout_id     uuid,  -- FK added below after payouts table is created
  account       public.ledger_account not null,
  direction     public.ledger_direction not null,
  amount_centavos bigint not null check (amount_centavos > 0),
  description   text not null,
  -- Idempotency for posting jobs
  idempotency_key text not null unique,
  created_by    uuid references public.profiles(id),
  created_at    timestamptz not null default now()
);
alter table public.ledger_entries enable row level security;

create index ledger_booking_idx on public.ledger_entries (booking_id);
create index ledger_account_idx on public.ledger_entries (account, created_at);

-- Ledger is admin-read-only via app. Policies are restrictive.
create policy ledger_admin_read on public.ledger_entries
  for select to authenticated using (public.is_admin());
-- Inserts only from service role (server-side accounting jobs)


-- ============================================================================
-- 9. VENUE PAYOUTS — weekly aggregated payouts
-- ----------------------------------------------------------------------------
-- Cron job aggregates confirmed bookings within a payout window:
--   gross_centavos = sum(court_fee_centavos)
--   fees_centavos  = sum(system_fee_centavos)  ← deducted from venue's earnings
--   net_centavos   = gross - fees
-- Owner sees the breakdown. Admin marks 'paid' when bank transfer is sent.
-- ============================================================================
create type public.payout_status as enum (
  'pending',    -- aggregated, awaiting admin disbursement
  'processing', -- bank transfer initiated
  'paid',       -- confirmed paid
  'failed',     -- bank rejection
  'on_hold'     -- admin hold (dispute, KYC issue, etc.)
);

create table public.venue_payouts (
  id                    uuid primary key default gen_random_uuid(),
  venue_id              uuid not null references public.venues(id) on delete restrict,
  period_start          timestamptz not null,
  period_end            timestamptz not null,
  gross_centavos        bigint not null check (gross_centavos >= 0),
  fees_centavos         bigint not null check (fees_centavos >= 0),
  net_centavos          bigint not null,  -- can be negative if carryover applies
  carryover_centavos    bigint not null default 0,
  booking_count         integer not null check (booking_count >= 0),
  status                public.payout_status not null default 'pending',
  paid_at               timestamptz,
  paid_reference        text,
  notes                 text,
  version               integer not null default 1,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint payout_period_valid check (period_end > period_start),
  unique (venue_id, period_start, period_end)
);
alter table public.venue_payouts enable row level security;

create index payouts_venue_idx  on public.venue_payouts (venue_id, period_end desc);
create index payouts_status_idx on public.venue_payouts (status);

create trigger payouts_bump_version before update on public.venue_payouts
  for each row execute function public.bump_version();

-- Add the deferred FK from ledger_entries.payout_id
alter table public.ledger_entries
  add constraint ledger_payout_fk foreign key (payout_id)
  references public.venue_payouts(id) on delete restrict;

-- Ledger entries must reference a booking OR a payout (not neither, not both)
alter table public.ledger_entries
  add constraint ledger_one_source check (
    (booking_id is not null and payout_id is null)
    or (booking_id is null and payout_id is not null)
    or (booking_id is not null and payout_id is not null)  -- payout-related booking entry
  );

create policy payouts_owner_read on public.venue_payouts
  for select to authenticated
  using (exists (select 1 from public.venues v where v.id = venue_id and v.owner_id = auth.uid()));
create policy payouts_admin_all on public.venue_payouts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());


-- ============================================================================
-- Seed: initial system fee = ₱20.00
-- ============================================================================
insert into public.system_fee_settings (fee_amount_centavos, notes)
values (2000, 'Initial launch fee — ₱20 per booking');
