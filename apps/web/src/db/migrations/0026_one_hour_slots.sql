-- 0026_one_hour_slots.sql
-- Platform decision: bookings are exactly 1-hour grain (60-min increments, hourly alignment).
-- Replaces the prior 30-min grain on bookings and open_play_sessions.
-- Verified 2026-05-20: 0 existing rows violate the new constraints.

begin;

-- bookings
alter table public.bookings drop constraint if exists booking_min_30_min;
alter table public.bookings drop constraint if exists booking_30_min_grain;

alter table public.bookings
  add constraint booking_min_1_hour check (end_at >= start_at + interval '1 hour');

alter table public.bookings
  add constraint booking_1_hour_grain check (
    extract(minute from start_at)::int = 0
    and extract(second from start_at)::int = 0
    and extract(minute from end_at)::int = 0
    and extract(second from end_at)::int = 0
  );

-- open_play_sessions
alter table public.open_play_sessions drop constraint if exists ops_min_30_min;
alter table public.open_play_sessions drop constraint if exists ops_30_min_grain;

alter table public.open_play_sessions
  add constraint ops_min_1_hour check (end_at >= start_at + interval '1 hour');

alter table public.open_play_sessions
  add constraint ops_1_hour_grain check (
    extract(minute from start_at)::int = 0
    and extract(second from start_at)::int = 0
    and extract(minute from end_at)::int = 0
    and extract(second from end_at)::int = 0
  );

commit;
