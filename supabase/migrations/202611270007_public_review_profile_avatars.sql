-- Expose the review author's saved public profile photo beside public reviews.
-- This is a forward migration for the already-applied review view.

begin;

drop view if exists public.establishment_rating_reviews;

create view public.establishment_rating_reviews
with (security_invoker = false)
as
select
  ratings.id,
  ratings.establishment_id,
  ratings.rating,
  ratings.reviewer_name,
  nullif(trim(ratings.comment), '') as comment,
  nullif(trim(ratings.photo_path), '') as photo_path,
  nullif(trim(profiles.avatar_url), '') as reviewer_avatar_url,
  ratings.created_at
from public.establishment_ratings ratings
join public.establishments establishments
  on establishments.id = ratings.establishment_id
left join public.public_user_profiles profiles
  on profiles.id = ratings.reviewer_user_id
where establishments.status = 'active'
  and (
    lower(establishments.type) like '%hotel%'
    or lower(establishments.type) like '%inn%'
    or lower(establishments.type) like '%lodge%'
    or lower(establishments.type) like '%resort%'
    or lower(establishments.type) like '%pool%'
    or lower(establishments.type) like '%farm%'
  );

grant select on public.establishment_rating_reviews to anon, authenticated;

commit;
