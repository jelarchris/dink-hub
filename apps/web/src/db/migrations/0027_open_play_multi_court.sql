-- ============================================================================
-- 0027 — Open Play multi-court support
-- ----------------------------------------------------------------------------
-- One open-play session can now occupy SEVERAL courts simultaneously
-- (e.g. "Friday Night Open Play uses Courts A, B and C from 6–8 PM").
--
-- Model:
--   open_play_session_courts (session_id, court_id, shadow_booking_id?)
--     - One row per (session, court). PK is the pair.
--     - shadow_booking_id is the per-court row in `bookings` (status='open_play')
--       that physically blocks that court via the existing EXCLUDE constraint.
--       NULL while the session is in DRAFT; populated at PUBLISH time.
--
-- `open_play_sessions.court_id` and `shadow_booking_id` are kept (not dropped)
-- and now represent the PRIMARY court — for back-compat with existing reads
-- and so the FK chain to `bookings` continues to work without rewrites.
-- New writes mirror the first selected court into the legacy columns.
--
-- Money: bigint centavos PHP. Timestamps: timestamptz. RLS: default deny.
-- ============================================================================

create table public.open_play_session_courts (
  session_id        uuid not null references public.open_play_sessions(id) on delete cascade,
  court_id          uuid not null references public.courts(id) on delete restrict,
  -- Per-court shadow booking inserted at PUBLISH time. NULL while drafting.
  shadow_booking_id uuid references public.bookings(id) on delete set null,
  created_at        timestamptz not null default now(),
  primary key (session_id, court_id)
);

create index opsc_court_idx          on public.open_play_session_courts (court_id);
create index opsc_shadow_booking_idx on public.open_play_session_courts (shadow_booking_id)
  where shadow_booking_id is not null;

alter table public.open_play_session_courts enable row level security;

-- Backfill from the legacy single-court column so existing sessions keep working.
insert into public.open_play_session_courts (session_id, court_id, shadow_booking_id)
select id, court_id, shadow_booking_id
from public.open_play_sessions
where deleted_at is null
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- RLS — visibility mirrors the parent session row.
-- ----------------------------------------------------------------------------

-- Public read: anyone who can see the session can see which courts it uses.
create policy opsc_public_read on public.open_play_session_courts
  for select to authenticated
  using (exists (
    select 1 from public.open_play_sessions s
    where s.id = session_id
      and s.status = 'published'
      and s.deleted_at is null
  ));

-- Owner read/write on their own venue's session courts.
create policy opsc_owner_all on public.open_play_session_courts
  for all to authenticated
  using (exists (
    select 1
    from public.open_play_sessions s
    join public.venues v on v.id = s.venue_id
    where s.id = session_id and v.owner_id = auth.uid()
  ))
  with check (exists (
    select 1
    from public.open_play_sessions s
    join public.venues v on v.id = s.venue_id
    where s.id = session_id and v.owner_id = auth.uid()
  ));

create policy opsc_admin_all on public.open_play_session_courts
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- Capacity trigger update — capacity is per SESSION, not per court, so the
-- existing ops_check_capacity() function still works as-is. (Confirmed: it
-- only looks at open_play_signups grouped by session_id.)
-- ============================================================================
