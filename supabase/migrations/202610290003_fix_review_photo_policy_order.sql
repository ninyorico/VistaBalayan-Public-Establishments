-- Correct the review-photo upload policy to reference the storage object path.
-- The previous policy used an unqualified `name`, which resolved to
-- establishments.name inside the EXISTS query and rejected valid uploads.

begin;

drop policy if exists "Public can upload review photos" on storage.objects;
create policy "Public can upload review photos"
on storage.objects
for insert
to anon, authenticated
with check (
  storage.objects.bucket_id = 'review-photos'
  and array_length(storage.foldername(storage.objects.name), 1) >= 2
  and exists (
    select 1
    from public.establishments e
    where e.id::text = (storage.foldername(storage.objects.name))[1]
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

commit;
