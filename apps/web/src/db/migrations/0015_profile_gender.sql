-- ============================================================================
-- 0015_profile_gender.sql
-- ----------------------------------------------------------------------------
-- Adds gender field to player profiles.
--
-- Design decisions:
--   - Stored as a nullable enum so it's always either a valid known value or
--     unknown (NULL). Avoids free-text normalisation issues.
--   - Values: male | female | non_binary | prefer_not_to_say
--   - NULL = user hasn't filled it in yet (different from prefer_not_to_say).
--   - No RLS change needed — profiles already has player self-read/write policy.
-- ============================================================================

-- 1. Create enum type.
create type public.gender as enum (
  'male',
  'female',
  'non_binary',
  'prefer_not_to_say'
);

-- 2. Add column (nullable, no default — NULL means "not filled in").
alter table public.profiles
  add column gender public.gender;

-- Index is low value for an enum with 4 values on a user table — skip.
