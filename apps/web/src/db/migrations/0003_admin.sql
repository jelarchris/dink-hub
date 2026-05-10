-- ============================================================================
-- DinkHub — Phase 2.6 Admin Core
-- ----------------------------------------------------------------------------
-- 1. Add 'rejected' to venue_status (lets admin reject pending venues).
-- 2. Add suspension columns to profiles (admin can suspend a user).
-- 3. Add rejection_reason to venues (captured when admin rejects).
-- 4. Rebind is_admin() to read from profiles.role — single source of truth.
--    The legacy admin_users table is left intact but unused; future migration
--    may drop it once we're sure nothing references it.
-- 5. Create audit_log table — every privileged admin mutation records here.
-- 6. Seed initial system_fee_settings row at PHP 20.00 (2000 centavos).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. venue_status += 'rejected'
-- ----------------------------------------------------------------------------
-- Postgres requires ADD VALUE outside a transaction block; we run the file
-- via DIRECT_URL in autocommit-friendly mode.
alter type public.venue_status add value if not exists 'rejected';


-- ----------------------------------------------------------------------------
-- 2. profiles suspension columns
-- ----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text;

create index if not exists profiles_suspended_idx
  on public.profiles (suspended_at) where suspended_at is not null;


-- ----------------------------------------------------------------------------
-- 3. venues rejection reason
-- ----------------------------------------------------------------------------
alter table public.venues
  add column if not exists rejection_reason text;


-- ----------------------------------------------------------------------------
-- 4. is_admin() reads from profiles.role
-- ----------------------------------------------------------------------------
-- Eliminates the dual-source-of-truth problem where promoting a user via the
-- profiles table didn't update RLS visibility because is_admin() looked at
-- public.admin_users. Now role changes immediately take effect.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and deleted_at is null
      and suspended_at is null
  );
$$;


-- ----------------------------------------------------------------------------
-- 5. audit_log
-- ----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id           uuid primary key default gen_random_uuid(),
  -- Snapshot fields so the log is still readable if the actor is later deleted.
  actor_id     uuid not null references public.profiles(id) on delete restrict,
  actor_email  text not null,
  action       text not null check (length(action) between 1 and 80),
  target_type  text not null check (length(target_type) between 1 and 40),
  target_id    uuid,
  before       jsonb,
  after        jsonb,
  reason       text,
  ip           text,
  user_agent   text,
  created_at   timestamptz not null default now()
);
alter table public.audit_log enable row level security;

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_target_idx  on public.audit_log (target_type, target_id);
create index if not exists audit_log_actor_idx   on public.audit_log (actor_id, created_at desc);
create index if not exists audit_log_action_idx  on public.audit_log (action);

-- Only admins can read or insert audit rows. There is no UPDATE or DELETE
-- policy intentionally — audit log is append-only.
drop policy if exists audit_log_admin_read on public.audit_log;
create policy audit_log_admin_read on public.audit_log
  for select to authenticated using (public.is_admin());

drop policy if exists audit_log_admin_insert on public.audit_log;
create policy audit_log_admin_insert on public.audit_log
  for insert to authenticated with check (public.is_admin() and actor_id = auth.uid());


-- ----------------------------------------------------------------------------
-- 6. Seed initial system fee at PHP 20.00 if none exists yet
-- ----------------------------------------------------------------------------
insert into public.system_fee_settings (fee_amount_centavos, notes)
select 2000, 'Initial fee at launch (Phase 2.6 seed).'
where not exists (select 1 from public.system_fee_settings);
