-- ============================================================================
-- 0017_open_play_interest.sql
-- ----------------------------------------------------------------------------
-- Email-capture list for the "Coming soon: Open Play" teaser on the homepage.
-- Demand-validation tool only — no notifications wired yet (Phase 2.5+).
--
-- Design decisions:
--   - (email, market) UNIQUE so duplicate signups from the same browser are
--     idempotent. The service treats a unique-violation as success.
--   - `market` is a free-form text key (default 'agusan_del_sur') so we can
--     add cities later without a schema change. No FK — markets aren't a
--     first-class entity yet.
--   - `source` records WHERE the signup happened ('home_teaser', future:
--     'venue_page', 'about_page'…). Useful for funnel analysis later.
--   - `ip_hash` stores SHA-256(ip + server salt) — never the raw IP. Lets us
--     spot abuse patterns without keeping PII at rest. Nullable because the
--     header may not be present locally.
--   - Default-deny RLS. Reads only via service role (Drizzle client) — no
--     anon SELECT. Inserts also via service role from the server action,
--     gated by rate-limit + honeypot at the app boundary.
--
-- Indexes:
--   - UNIQUE (email, market) doubles as the lookup index for dedupe.
--   - (created_at desc) for admin browsing / export.
-- ============================================================================

create table public.open_play_interest (
  id          uuid        primary key default gen_random_uuid(),
  email       citext      not null,
  market      text        not null default 'agusan_del_sur',
  source      text        not null default 'home_teaser',
  ip_hash     text,
  created_at  timestamptz not null default now(),
  unique (email, market)
);

create index open_play_interest_created_at_idx
  on public.open_play_interest (created_at desc);

-- ----------------------------------------------------------------------------
-- Row-level security: default deny. Drizzle (service role pooler) bypasses
-- RLS so the server action still works. No anon/authenticated policies are
-- created on purpose — this list is admin-only.
-- ----------------------------------------------------------------------------
alter table public.open_play_interest enable row level security;
