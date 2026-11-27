-- Public account profile photo support and anonymous public rating reads.
-- Apply this migration to the VistaBalayan Supabase project before testing production.

begin;

alter table if exists public.public_user_profiles
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'public-profile-photos',
  'public-profile-photos',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']::text[];

drop policy if exists "Public users can upload own profile photo" on storage.objects;
create policy "Public users can upload own profile photo"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'public-profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Public users can update own profile photo" on storage.objects;
create policy "Public users can update own profile photo"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'public-profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'public-profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "Public users can delete own profile photo" on storage.objects;
create policy "Public users can delete own profile photo"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'public-profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- The public review views intentionally expose only active-establishment review data.
-- They must not inherit private base-table RLS when queried by the anonymous public site.
alter view if exists public.establishment_rating_reviews set (security_invoker = false);
alter view if exists public.establishment_rating_summaries set (security_invoker = false);
grant select on public.establishment_rating_reviews to anon, authenticated;
grant select on public.establishment_rating_summaries to anon, authenticated;

commit;
