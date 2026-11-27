-- Repair migration for the live review-photo upload path.
-- Run this in the Supabase SQL Editor if 202611270003 was already marked as
-- applied or was copied partially. Storage uploads must not depend on review
-- table columns such as reviewer_user_id.

begin;

alter table public.establishment_ratings
  add column if not exists reviewer_user_id uuid references auth.users(id);

create unique index if not exists establishment_ratings_verified_user_unique
  on public.establishment_ratings (establishment_id, reviewer_user_id)
  where reviewer_user_id is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'review-photos',
  'review-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[];

-- Remove the old policies, including versions that allowed anon uploads or
-- queried other tables. The upload request only needs a scoped UUID path.
drop policy if exists "Public can upload review photos" on storage.objects;
drop policy if exists "Anyone can upload review photos" on storage.objects;
create policy "Public can upload review photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'review-photos'
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
);

drop policy if exists "Anyone can read review photos" on storage.objects;
create policy "Anyone can read review photos"
on storage.objects
for select
to anon, authenticated
using (bucket_id = 'review-photos');

commit;
