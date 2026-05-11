-- ============================================================================
-- 0013_court_closures.sql
-- ----------------------------------------------------------------------------
-- Introduces per-court scheduled closures (Tier 9).
--
-- A venue owner can block out specific time windows on individual courts
-- (e.g. maintenance, private events, emergency closure) so the booking flow
-- rejects any attempt to create or reschedule a booking that overlaps an
-- active closure.
--
-- Design decisions:
--   - Soft-delete only: deleted_at is used; no hard DELETE.
--   - EXCLUDE constraint on (court_id, tstzrange) so the DB physically
--     prevents two overlapping non-deleted closures on the same court.
--   - A CHECK constraint ensures end_at > start_at.
--   - Booking creation / reschedule must check this table via a LEFT JOIN or
--     a separate query; the DB EXCLUDE constraint only guards closures against
--     each other. The booking EXCLUDE on bookings already prevents booking↔
--     booking overlap. To prevent booking↔closure overlap we add a second
--     EXCLUDE on the court_closures table referencing bookings is not
--     feasible directly in SQL — instead the service layer queries for an
--     overlapping active closure before inserting a booking.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- btree_gist extension (required for EXCLUDE on non-geometric columns)
-- Already enabled by 0001 for the bookings overlap constraint; guard with
-- IF NOT EXISTS in case this migration ever runs on a fresh DB.
-- ---------------------------------------------------------------------------
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- court_closures table
-- ---------------------------------------------------------------------------
create table public.court_closures (
  id          uuid        primary key default gen_random_uuid(),
  court_id    uuid        not null references public.courts(id) on delete cascade,
  -- Who created the closure. Nullable: system-initiated closures leave this NULL.
  created_by  uuid        null references public.profiles(id) on delete set null,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  reason      text        null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz null,

  constraint court_closures_end_after_start check (end_at > start_at)
);

-- Prevent two overlapping active closures on the same court.
alter table public.court_closures
  add constraint court_closures_no_overlap
  exclude using gist (
    court_id with =,
    tstzrange(start_at, end_at) with &&
  ) where (deleted_at is null);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
-- Hot path: "list closures for court X in the future"
create index court_closures_court_id_start_at
  on public.court_closures (court_id, start_at)
  where deleted_at is null;

-- Used when booking service checks for closure overlap on a venue
create index court_closures_court_id_range
  on public.court_closures using gist (court_id, tstzrange(start_at, end_at))
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.court_closures enable row level security;

-- Default deny: no policy = no access by default.

-- Venue owners can read closures for their own courts.
create policy "court_closures_owner_select"
  on public.court_closures
  for select
  using (
    exists (
      select 1
      from public.courts c
      join public.venues v on v.id = c.venue_id
      where c.id = court_closures.court_id
        and v.owner_id = auth.uid()
        and v.deleted_at is null
    )
  );

-- Players / public can read closures for courts at active venues
-- (needed so the booking UI can show "court unavailable" blocks).
create policy "court_closures_public_select"
  on public.court_closures
  for select
  using (
    deleted_at is null
    and exists (
      select 1
      from public.courts c
      join public.venues v on v.id = c.venue_id
      where c.id = court_closures.court_id
        and v.status = 'active'
        and v.deleted_at is null
    )
  );

-- Only service-role (server actions) may insert/update/delete.
-- No INSERT/UPDATE/DELETE policies for authenticated roles —
-- all writes go through SECURITY DEFINER server actions.
