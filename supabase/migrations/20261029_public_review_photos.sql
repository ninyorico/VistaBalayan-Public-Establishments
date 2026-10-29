-- Public review photo support.
-- Apply only after confirming the target Supabase project.
-- This preserves existing ratings and makes photo_path nullable.

begin;

alter table if exists public.establishment_ratings
  add column if not exists photo_path text;

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

-- Public visitors may upload only beneath an active, publicly rateable establishment ID.
drop policy if exists "Public can upload review photos" on storage.objects;
create policy "Public can upload review photos"
on storage.objects
for insert
to anon, authenticated
with check (
  bucket_id = 'review-photos'
  and array_length(storage.foldername(name), 1) >= 2
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

drop view if exists public.establishment_rating_reviews;
create view public.establishment_rating_reviews
with (security_invoker = true)
as
select
  ratings.id,
  ratings.establishment_id,
  ratings.rating,
  ratings.reviewer_name,
  nullif(trim(ratings.comment), '') as comment,
  nullif(trim(ratings.photo_path), '') as photo_path,
  ratings.created_at
from public.establishment_ratings ratings
join public.establishments establishments
  on establishments.id = ratings.establishment_id
where establishments.status = 'active'
  and (
    lower(establishments.type) like '%hotel%'
    or lower(establishments.type) like '%inn%'
    or lower(establishments.type) like '%lodge%'
    or lower(establishments.type) like '%resort%'
    or lower(establishments.type) like '%pool%'
    or lower(establishments.type) like '%farm%'
  );

grant select (id, establishment_id, rating, reviewer_name, comment, photo_path, created_at)
  on public.establishment_ratings to anon, authenticated;
revoke all on public.establishment_rating_reviews from public;
grant select on public.establishment_rating_reviews to anon, authenticated;

-- Keep the existing five-argument function for callers that do not attach photos.
create or replace function public.submit_establishment_rating(
  p_establishment_id uuid,
  p_visitor_token text,
  p_rating integer,
  p_comment text default null,
  p_reviewer_name text default null
)
returns void
language sql
security definer
set search_path = public
as $$
  select public.submit_establishment_rating(
    p_establishment_id,
    p_visitor_token,
    p_rating,
    p_comment,
    p_reviewer_name,
    null
  );
$$;

-- Photo-aware public write path. The storage path must be scoped to the same
-- active establishment and use the review-photos bucket naming convention.
drop function if exists public.submit_establishment_rating(uuid, text, integer, text, text, text);
create or replace function public.submit_establishment_rating(
  p_establishment_id uuid,
  p_visitor_token text,
  p_rating integer,
  p_comment text default null,
  p_reviewer_name text default null,
  p_photo_path text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_token text := trim(p_visitor_token);
  token_hash text;
  public_establishment_exists boolean;
  normalized_comment text := nullif(trim(p_comment), '');
  normalized_reviewer_name text := nullif(trim(p_reviewer_name), '');
  normalized_photo_path text := nullif(trim(p_photo_path), '');
begin
  if p_establishment_id is null then raise exception 'establishment_id is required'; end if;
  if normalized_token is null or length(normalized_token) < 16 or length(normalized_token) > 128 then raise exception 'valid visitor token is required'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'rating must be between 1 and 5'; end if;
  if normalized_comment is not null and char_length(normalized_comment) > 500 then raise exception 'comment must be 500 characters or fewer'; end if;
  if normalized_reviewer_name is null then raise exception 'reviewer name is required'; end if;
  if char_length(normalized_reviewer_name) > 80 then raise exception 'reviewer name must be 80 characters or fewer'; end if;

  select exists (
    select 1 from public.establishments e
    where e.id = p_establishment_id
      and e.status = 'active'
      and (
        lower(e.type) like '%hotel%' or lower(e.type) like '%inn%'
        or lower(e.type) like '%lodge%' or lower(e.type) like '%resort%'
        or lower(e.type) like '%pool%' or lower(e.type) like '%farm%'
      )
  ) into public_establishment_exists;
  if not public_establishment_exists then raise exception 'establishment is not publicly rateable'; end if;

  if normalized_photo_path is not null and normalized_photo_path !~ ('^' || p_establishment_id::text || '/[0-9a-f-]+\.(jpg|jpeg|png|webp)$') then
    raise exception 'invalid review photo path';
  end if;

  token_hash := md5(normalized_token);
  insert into public.establishment_ratings (establishment_id, visitor_token_hash, rating, reviewer_name, comment, photo_path)
  values (p_establishment_id, token_hash, p_rating, normalized_reviewer_name, normalized_comment, normalized_photo_path)
  on conflict (establishment_id, visitor_token_hash)
  do update set
    rating = excluded.rating,
    reviewer_name = excluded.reviewer_name,
    comment = excluded.comment,
    photo_path = excluded.photo_path;
end;
$$;

revoke all on function public.submit_establishment_rating(uuid, text, integer, text, text) from public;
grant execute on function public.submit_establishment_rating(uuid, text, integer, text, text) to anon, authenticated;
revoke all on function public.submit_establishment_rating(uuid, text, integer, text, text, text) from public;
grant execute on function public.submit_establishment_rating(uuid, text, integer, text, text, text) to anon, authenticated;

commit;
