-- Ensure the public review photo bucket exists in the production project.
-- This is intentionally idempotent so it is safe to apply after the original
-- review-photo migration or on a project where that migration was skipped.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'review-photos',
  'review-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set name = excluded.name,
    public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can upload review photos" on storage.objects;
create policy "Public can upload review photos"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'review-photos'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  and exists (
    select 1
    from public.establishments e
    where e.id::text = (storage.foldername(name))[1]
      and e.status = 'active'
      and (
        lower(e.type) like '%hotel%'
        or lower(e.type) like '%inn%'
        or lower(e.type) like '%lodge%'
        or lower(e.type) like '%resort%'
        or lower(e.type) like '%pool%'
        or lower(e.type) like '%farm%'
      )
  )
);

drop policy if exists "Anyone can read review photos" on storage.objects;
create policy "Anyone can read review photos"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'review-photos');

commit;