-- ============================================================================
-- DinkHub — 0002 Auth profile trigger
-- ----------------------------------------------------------------------------
-- When a new auth.users row is created (sign-up), automatically materialize
-- the matching public.profiles row. This lets RLS policies that reference
-- profiles work immediately on first sign-in without a "create profile" step.
--
-- Display name / role come from raw_user_meta_data set during sign-up.
-- ============================================================================

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_display_name text := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    split_part(new.email, '@', 1)
  );
  v_role public.user_role := coalesce(
    (new.raw_user_meta_data->>'role')::public.user_role,
    'player'
  );
begin
  -- Defensive: clamp display_name length to satisfy the CHECK constraint
  if length(v_display_name) < 2 then
    v_display_name := v_display_name || '__';
  elsif length(v_display_name) > 60 then
    v_display_name := substring(v_display_name from 1 for 60);
  end if;

  insert into public.profiles (id, display_name, email, role)
  values (new.id, v_display_name, new.email, v_role)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Backfill: any existing auth.users without a profile row gets one.
insert into public.profiles (id, display_name, email, role)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data->>'display_name'), ''), split_part(u.email, '@', 1)),
  u.email,
  coalesce((u.raw_user_meta_data->>'role')::public.user_role, 'player')
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null
  and u.email is not null;
