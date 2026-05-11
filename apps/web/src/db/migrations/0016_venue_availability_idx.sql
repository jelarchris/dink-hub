-- ============================================================================
-- 0016_venue_availability_idx.sql
-- ----------------------------------------------------------------------------
-- Adds a partial composite index on bookings to efficiently answer:
--   "which courts have a booking that overlaps a given time window?"
--
-- Used by the /venues availability filter (date + time-of-day + duration).
-- A partial index on the non-terminal statuses keeps the index small and lets
-- the query planner use it specifically when status is already in the WHERE.
--
-- No new tables, no RLS changes needed — this is index-only DDL.
-- ============================================================================

create index if not exists bookings_avail_idx
  on public.bookings (court_id, start_at, end_at)
  where status not in ('cancelled', 'no_show', 'expired');
