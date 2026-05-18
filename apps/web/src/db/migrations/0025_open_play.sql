-- ============================================================================
-- 0025 — Open Play
-- ----------------------------------------------------------------------------
-- Owners publish open-play sessions on a court at a fixed time. Players join
-- a session, pay GCash directly to the venue (one receipt each), and receive
-- email confirmation + a T-2h reminder.
--
-- Court conflict prevention reuses the existing bookings EXCLUDE constraint:
-- creating a published session inserts a "shadow" booking row with
-- status='open_play' that physically blocks any other booking on that court
-- for the same time-range. Cancelling the session marks the shadow row as
-- 'cancelled' (which is excluded by the EXCLUDE WHERE clause, freeing the slot).
--
-- Money: bigint centavos PHP. Timestamps: timestamptz. RLS: default deny.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extend booking_status enum to include 'open_play'
--    Must be a standalone statement and committed before any use below.
-- ----------------------------------------------------------------------------
alter type public.booking_status add value if not exists 'open_play';
commit;

-- ----------------------------------------------------------------------------
-- 2. New enums
-- ----------------------------------------------------------------------------
create type public.open_play_session_status as enum (
  'draft',       -- owner is still editing, not visible to players
  'published',   -- visible & joinable
  'cancelled',   -- owner cancelled (shadow booking also cancelled)
  'completed'    -- session start time has passed
);

create type public.open_play_signup_status as enum (
  'pending_payment',   -- joined, awaiting receipt upload
  'payment_submitted', -- receipt uploaded, awaiting venue verification
  'confirmed',         -- venue verified payment, seat locked
  'cancelled',         -- player cancelled within window OR owner cancelled session
  'expired',           -- payment window elapsed without receipt
  'refunded'           -- post-confirmation refund
);

create type public.skill_level as enum (
  'any',
  'beginner',
  'intermediate',
  'advanced'
);

-- ----------------------------------------------------------------------------
-- 3. open_play_sessions — the published event
-- ----------------------------------------------------------------------------
create table public.open_play_sessions (
  id                          uuid primary key default gen_random_uuid(),
  venue_id                    uuid not null references public.venues(id) on delete restrict,
  court_id                    uuid not null references public.courts(id) on delete restrict,
  host_profile_id             uuid not null references public.profiles(id) on delete restrict,
  -- Identity / display
  title                       text not null check (length(title) between 2 and 120),
  description                 text,
  skill_level                 public.skill_level not null default 'any',
  -- Capacity (number of player SEATS — not paddles / courts)
  capacity                    smallint not null check (capacity between 2 and 32),
  -- Per-player price snapshot (set at session creation, immutable after publish)
  price_per_player_centavos   bigint not null check (price_per_player_centavos >= 0),
  -- System fee snapshot per signup (captured at PUBLISH time so historical
  -- signups keep the rate even after admin changes it later)
  system_fee_per_player_centavos bigint not null check (system_fee_per_player_centavos >= 0),
  -- Time window — same 30-min grain + 4h max as bookings
  start_at                    timestamptz not null,
  end_at                      timestamptz not null,
  -- Shadow booking that physically blocks the court (FK set after insert in
  -- the service layer because of the circular reference). Nullable for draft.
  shadow_booking_id           uuid references public.bookings(id) on delete set null,
  -- Lifecycle
  status                      public.open_play_session_status not null default 'draft',
  published_at                timestamptz,
  cancelled_at                timestamptz,
  cancelled_by                uuid references public.profiles(id),
  cancellation_reason         text,
  -- Audit
  version                     integer not null default 1,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  deleted_at                  timestamptz,
  -- Invariants
  constraint ops_time_valid        check (end_at > start_at),
  constraint ops_min_30_min        check (end_at >= start_at + interval '30 minutes'),
  constraint ops_max_4_hours       check (end_at <= start_at + interval '4 hours'),
  constraint ops_30_min_grain      check (
    extract(minute from start_at)::int % 30 = 0
    and extract(second from start_at)::int = 0
    and extract(minute from end_at)::int % 30 = 0
    and extract(second from end_at)::int = 0
  ),
  constraint ops_cancelled_consistency check (
    (status = 'cancelled') = (cancelled_at is not null)
  )
);
alter table public.open_play_sessions enable row level security;

create index ops_venue_status_idx on public.open_play_sessions (venue_id, status) where deleted_at is null;
create index ops_court_time_idx   on public.open_play_sessions (court_id, start_at);
create index ops_status_start_idx on public.open_play_sessions (status, start_at) where deleted_at is null;
create index ops_host_idx         on public.open_play_sessions (host_profile_id);

create trigger ops_bump_version before update on public.open_play_sessions
  for each row execute function public.bump_version();

-- RLS:
-- - Anyone authenticated can read PUBLISHED non-deleted sessions
-- - Owner can read/manage own venue's sessions (any status)
-- - Admin: all
create policy ops_public_read on public.open_play_sessions
  for select to authenticated using (status = 'published' and deleted_at is null);
create policy ops_owner_read on public.open_play_sessions
  for select to authenticated
  using (exists (select 1 from public.venues v where v.id = venue_id and v.owner_id = auth.uid()));
create policy ops_owner_all on public.open_play_sessions
  for all to authenticated
  using (exists (select 1 from public.venues v where v.id = venue_id and v.owner_id = auth.uid()))
  with check (exists (select 1 from public.venues v where v.id = venue_id and v.owner_id = auth.uid()));
create policy ops_admin_all on public.open_play_sessions
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4. open_play_signups — one row per player who joins a session
-- ----------------------------------------------------------------------------
create table public.open_play_signups (
  id                       uuid primary key default gen_random_uuid(),
  session_id               uuid not null references public.open_play_sessions(id) on delete restrict,
  player_id                uuid not null references public.profiles(id) on delete restrict,
  status                   public.open_play_signup_status not null default 'pending_payment',
  -- Money snapshots (immutable for audit). Mirrors bookings.
  court_fee_centavos       bigint not null check (court_fee_centavos >= 0),
  system_fee_centavos      bigint not null check (system_fee_centavos >= 0),
  total_centavos           bigint generated always as (court_fee_centavos + system_fee_centavos) stored,
  -- Per-signup notification email override (mirrors bookings.contact_email)
  contact_email            text,
  -- 15-min self-cancel window from join time
  cancellable_until        timestamptz not null,
  -- Payment hold timeout — receipt must be uploaded by this time
  payment_due_at           timestamptz not null,
  -- Cancellation metadata
  cancelled_at             timestamptz,
  cancelled_by             uuid references public.profiles(id),
  cancellation_reason      text,
  -- Reminder cron de-dup
  reminder_sent_at         timestamptz,
  -- Audit
  version                  integer not null default 1,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint ops_signup_cancelled_consistency check (
    status not in ('cancelled') or cancelled_at is not null
  )
);
alter table public.open_play_signups enable row level security;

-- Prevent the same player from holding more than one ACTIVE seat in a session.
-- Cancelled / expired signups don't block re-joining.
create unique index ops_signup_unique_active
  on public.open_play_signups (session_id, player_id)
  where status not in ('cancelled', 'expired');

create index ops_signup_session_status_idx on public.open_play_signups (session_id, status);
create index ops_signup_player_idx         on public.open_play_signups (player_id, created_at desc);
create index ops_signup_status_due_idx     on public.open_play_signups (status, payment_due_at)
  where status = 'pending_payment';
create index ops_signup_reminder_idx       on public.open_play_signups (session_id)
  where status = 'confirmed' and reminder_sent_at is null;

create trigger ops_signup_bump_version before update on public.open_play_signups
  for each row execute function public.bump_version();

-- ----------------------------------------------------------------------------
-- 5. Capacity guard — DB-enforced so app races can't oversubscribe a session.
--    Locks the session row, counts ACTIVE signups (everything except
--    cancelled/expired), and rejects if it would exceed capacity.
-- ----------------------------------------------------------------------------
create or replace function public.ops_check_capacity()
returns trigger language plpgsql as $$
declare
  cap smallint;
  active_count int;
begin
  -- Only enforce when the signup is in (or transitioning to) an active state.
  if NEW.status in ('cancelled', 'expired') then
    return NEW;
  end if;

  -- Lock the session row to serialize concurrent joins.
  select capacity into cap
  from public.open_play_sessions
  where id = NEW.session_id
  for update;

  if cap is null then
    raise exception 'open_play_sessions row not found' using errcode = 'foreign_key_violation';
  end if;

  select count(*)::int into active_count
  from public.open_play_signups
  where session_id = NEW.session_id
    and status not in ('cancelled', 'expired')
    and (TG_OP = 'INSERT' or id <> NEW.id);

  if active_count + 1 > cap then
    raise exception 'open play session is full' using errcode = 'check_violation';
  end if;

  return NEW;
end;
$$;

create trigger ops_signup_capacity_check
  before insert or update on public.open_play_signups
  for each row execute function public.ops_check_capacity();

-- RLS for signups:
-- - Player can read/insert/update OWN signups
-- - Venue owner can read all signups for their venue's sessions
-- - Admin: all
create policy ops_signup_player_read on public.open_play_signups
  for select to authenticated using (player_id = auth.uid());
create policy ops_signup_player_insert on public.open_play_signups
  for insert to authenticated with check (player_id = auth.uid());
create policy ops_signup_player_update on public.open_play_signups
  for update to authenticated
  using (player_id = auth.uid() and status in ('pending_payment', 'payment_submitted'))
  with check (player_id = auth.uid());

create policy ops_signup_owner_read on public.open_play_signups
  for select to authenticated
  using (exists (
    select 1 from public.open_play_sessions s
    join public.venues v on v.id = s.venue_id
    where s.id = session_id and v.owner_id = auth.uid()
  ));
create policy ops_signup_owner_update on public.open_play_signups
  for update to authenticated
  using (exists (
    select 1 from public.open_play_sessions s
    join public.venues v on v.id = s.venue_id
    where s.id = session_id and v.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.open_play_sessions s
    join public.venues v on v.id = s.venue_id
    where s.id = session_id and v.owner_id = auth.uid()
  ));

create policy ops_signup_admin_all on public.open_play_signups
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 6. open_play_signup_payments — mirrors `payments` for signup receipts.
--    Kept separate so booking payment lifecycle is unaffected.
-- ----------------------------------------------------------------------------
create table public.open_play_signup_payments (
  id                      uuid primary key default gen_random_uuid(),
  signup_id               uuid not null unique references public.open_play_signups(id) on delete restrict,
  receipt_image_path      text not null,
  receipt_hash            text not null,
  amount_centavos         bigint not null check (amount_centavos > 0),
  gcash_reference_number  text,
  status                  public.payment_status not null default 'submitted',
  submitted_by            uuid not null references public.profiles(id),
  submitted_at            timestamptz not null default now(),
  verified_by             uuid references public.profiles(id),
  verified_at             timestamptz,
  rejection_reason        text,
  version                 integer not null default 1,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);
alter table public.open_play_signup_payments enable row level security;

-- Idempotency: a player can't accidentally double-submit the same image for
-- the same signup (same hash).
create unique index ops_signup_payment_dedup
  on public.open_play_signup_payments (signup_id, receipt_hash);

create index ops_signup_payment_status_idx on public.open_play_signup_payments (status, submitted_at desc);

create trigger ops_signup_payment_bump_version before update on public.open_play_signup_payments
  for each row execute function public.bump_version();

-- RLS:
-- - Player can read/insert their own signup's payments
-- - Owner can read+update payments on their venue's sessions
-- - Admin: all
create policy ops_pay_player_read on public.open_play_signup_payments
  for select to authenticated
  using (exists (
    select 1 from public.open_play_signups si
    where si.id = signup_id and si.player_id = auth.uid()
  ));
create policy ops_pay_player_insert on public.open_play_signup_payments
  for insert to authenticated
  with check (exists (
    select 1 from public.open_play_signups si
    where si.id = signup_id and si.player_id = auth.uid()
  ));

create policy ops_pay_owner_read on public.open_play_signup_payments
  for select to authenticated
  using (exists (
    select 1 from public.open_play_signups si
    join public.open_play_sessions s on s.id = si.session_id
    join public.venues v on v.id = s.venue_id
    where si.id = signup_id and v.owner_id = auth.uid()
  ));
create policy ops_pay_owner_update on public.open_play_signup_payments
  for update to authenticated
  using (exists (
    select 1 from public.open_play_signups si
    join public.open_play_sessions s on s.id = si.session_id
    join public.venues v on v.id = s.venue_id
    where si.id = signup_id and v.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.open_play_signups si
    join public.open_play_sessions s on s.id = si.session_id
    join public.venues v on v.id = s.venue_id
    where si.id = signup_id and v.owner_id = auth.uid()
  ));

create policy ops_pay_admin_all on public.open_play_signup_payments
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 7. bookings → open_play_session_id back-reference
--    Lets us distinguish shadow rows from real bookings and exclude them
--    from player-facing booking lists.
-- ----------------------------------------------------------------------------
alter table public.bookings
  add column open_play_session_id uuid references public.open_play_sessions(id) on delete set null;

create index bookings_open_play_session_idx on public.bookings (open_play_session_id)
  where open_play_session_id is not null;
