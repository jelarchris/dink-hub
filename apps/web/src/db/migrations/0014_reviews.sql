-- ============================================================================
-- 0014_reviews.sql
-- ----------------------------------------------------------------------------
-- Player reviews of venues (Tier 11).
--
-- Design decisions:
--   - One review per completed booking (UNIQUE on booking_id).
--   - "Completed" means status = 'confirmed' AND end_at < now() — enforced in
--     the service layer, not the DB (hard to express in a FK check).
--   - Soft-rating stored as smallint 1–5. Body is optional free text.
--   - Owner can add one reply (owner_reply / owner_replied_at). Once set, the
--     player can no longer edit rating or body (enforced in service).
--   - is_hidden: admin moderation flag. Hidden reviews are excluded from all
--     public queries but still readable by the venue owner and admin.
--   - avg_rating / review_count are computed at query time via a subquery
--     (no denormalisation — venue table is untouched).
--
-- Indexes:
--   - (venue_id) filtered on NOT hidden for the public listing aggregation.
--   - (player_id) for "my reviews" lookup.
--   - (booking_id) unique (also enforces one-review-per-booking).
-- ============================================================================

create table public.reviews (
  id                 uuid        primary key default gen_random_uuid(),
  booking_id         uuid        not null unique references public.bookings(id) on delete restrict,
  player_id          uuid        not null references public.profiles(id) on delete restrict,
  venue_id           uuid        not null references public.venues(id) on delete cascade,
  rating             smallint    not null check (rating between 1 and 5),
  body               text,
  owner_reply        text,
  owner_replied_at   timestamptz,
  is_hidden          boolean     not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Public aggregation index (partial — skips hidden).
create index reviews_venue_id_idx   on public.reviews (venue_id) where is_hidden = false;
-- Player "my reviews" lookup.
create index reviews_player_id_idx  on public.reviews (player_id);

-- ============================================================================
-- Row-level security
-- ============================================================================
alter table public.reviews enable row level security;

-- Anyone may read non-hidden reviews.
create policy reviews_public_select on public.reviews
  for select
  using (is_hidden = false);

-- Authenticated player inserts their own review.
create policy reviews_player_insert on public.reviews
  for insert
  with check (player_id = auth.uid());

-- Player may update rating/body on their own review only while no owner reply
-- has been set yet (prevents retroactive score changes after a reply).
create policy reviews_player_update on public.reviews
  for update
  using  (player_id = auth.uid() and owner_reply is null)
  with check (player_id = auth.uid());

-- Venue owner may update owner_reply / owner_replied_at only.
-- Full column restriction is enforced in the service layer; this policy just
-- gates the operation to the right owner.
create policy reviews_owner_reply on public.reviews
  for update
  using (
    exists (
      select 1
      from   public.venues v
      where  v.id = venue_id
        and  v.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from   public.venues v
      where  v.id = venue_id
        and  v.owner_id = auth.uid()
    )
  );
