-- ============================================================================
-- DinkHub — Venue & Court image uploads
-- ----------------------------------------------------------------------------
-- 1. Add `cover_image_path` to venues, `image_path` to courts (storage paths).
-- 2. Create `venue-media` PUBLIC storage bucket for cover/court photos.
-- 3. RLS on storage.objects: public read for venue-media, writes go through
--    server-side service role only (no user-side write policy).
-- ============================================================================

alter table public.venues
  add column if not exists cover_image_path text;

alter table public.courts
  add column if not exists image_path text;

-- Public bucket: anonymous can read cover photos directly via the public CDN URL.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'venue-media',
  'venue-media',
  true,
  5242880, -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Allow public reads on the bucket. Writes are not granted to anon/authenticated;
-- all uploads go through Server Actions with the service role.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'venue_media_public_read'
  ) then
    create policy venue_media_public_read
      on storage.objects
      for select
      to anon, authenticated
      using (bucket_id = 'venue-media');
  end if;
end $$;
