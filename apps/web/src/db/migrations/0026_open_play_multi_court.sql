-- ============================================================================
-- 0026 — Open Play multi-court support
-- ----------------------------------------------------------------------------
-- An open-play session can now span multiple courts. Capacity is shared across
-- all courts of the session. Each court has its own "shadow" booking so the
-- existing EXCLUDE constraint on bookings still physically prevents conflicts.
--
-- Strategy:
--   1. New join table `open_play_session_courts(session_id, court_id, shadow_booking_id)`
--   2. Backfill from the existing single `court_id` + `shadow_booking_id` columns
--   3. Drop the now-redundant single-court columns from `open_play_sessions`
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Join table
-- ----------------------------------------------------------------------------
create table public.open_play_session_courts (
  session_id        uuid not null references public.open_play_sessions(id) on delete cascade,
  court_id          uuid not null references public.courts(id) on delete restrict,
  -- Per-court shadow booking that physically blocks the slot via the
  -- existing bookings EXCLUDE constraint. Null while the session is a draft.
  shadow_booking_id uuid references public.bookings(id) on delete set null,
  created_at        timestamptz not null default now(),
  primary key (session_id, court_id)
);
alter table public.open_play_session_courts enable row level security;

create index opsc_court_idx          on public.open_play_session_courts (court_id);
create index opsc_shadow_booking_idx on public.open_play_session_courts (shadow_booking_id);

-- RLS mirrors open_play_sessions: public can read rows for PUBLISHED sessions;
-- owner has full access to their venue's sessions; admin: all.
create policy opsc_public_read on public.open_play_session_courts
  for select to authenticated
  using (exists (
    select 1 from public.open_play_sessions s
    where s.id = session_id
      and s.status = 'published'
      and s.deleted_at is null
  ));

create policy opsc_owner_read on public.open_play_session_courts
  for select to authenticated
  using (exists (
    select 1 from public.open_play_sessions s
    join public.venues v on v.id = s.venue_id
    where s.id = session_id and v.owner_id = auth.uid()
  ));

create policy opsc_owner_all on public.open_play_session_courts
  for all to authenticated
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

create policy opsc_admin_all on public.open_play_session_courts
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- 2. Backfill from the legacy single-court columns
-- ----------------------------------------------------------------------------
insert into public.open_play_session_courts (session_id, court_id, shadow_booking_id)
select id, court_id, shadow_booking_id
from public.open_play_sessions
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- 3. Drop the now-redundant single-court columns
-- ----------------------------------------------------------------------------
drop index if exists public.ops_court_time_idx;

alter table public.open_play_sessions drop column shadow_booking_id;
alter table public.open_play_sessions drop column court_id;
