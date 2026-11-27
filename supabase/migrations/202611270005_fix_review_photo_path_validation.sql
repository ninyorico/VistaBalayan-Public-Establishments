-- Fix the live review RPC photo-path regex.
-- The previous function used an over-escaped dot, rejecting valid paths such as
-- <establishment UUID>/<random UUID>.jpg after Storage upload succeeded.

begin;

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
  normalized_token text := nullif(trim(p_visitor_token), '');
  token_hash text;
  normalized_comment text := nullif(trim(p_comment), '');
  normalized_reviewer_name text := nullif(trim(p_reviewer_name), '');
  normalized_photo_path text := nullif(trim(p_photo_path), '');
  confirmed_email timestamptz;
  public_establishment_exists boolean;
begin
  if auth.uid() is null then
    raise exception 'verified account is required';
  end if;

  select email_confirmed_at
    into confirmed_email
    from auth.users
   where id = auth.uid();
  if confirmed_email is null then
    raise exception 'email verification is required before rating';
  end if;

  if p_establishment_id is null then
    raise exception 'establishment_id is required';
  end if;
  if normalized_token is null or length(normalized_token) < 16 or length(normalized_token) > 128 then
    raise exception 'valid visitor token is required';
  end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then
    raise exception 'rating must be between 1 and 5';
  end if;
  if normalized_comment is not null and char_length(normalized_comment) > 500 then
    raise exception 'comment must be 500 characters or fewer';
  end if;
  if normalized_reviewer_name is null then
    raise exception 'reviewer name is required';
  end if;
  if char_length(normalized_reviewer_name) > 80 then
    raise exception 'reviewer name must be 80 characters or fewer';
  end if;
  if normalized_photo_path is not null
     and normalized_photo_path !~ ('^' || p_establishment_id::text || '/[0-9a-f-]+\.(jpg|jpeg|png|webp)$') then
    raise exception 'invalid review photo path';
  end if;

  select exists (
    select 1
      from public.establishments e
     where e.id = p_establishment_id
       and e.status = 'active'
       and (
         lower(e.type) like '%hotel%' or lower(e.type) like '%inn%'
         or lower(e.type) like '%lodge%' or lower(e.type) like '%resort%'
         or lower(e.type) like '%pool%' or lower(e.type) like '%farm%'
       )
  ) into public_establishment_exists;
  if not public_establishment_exists then
    raise exception 'establishment is not publicly rateable';
  end if;

  token_hash := md5(normalized_token);

  update public.establishment_ratings
     set visitor_token_hash = token_hash,
         rating = p_rating,
         reviewer_name = normalized_reviewer_name,
         comment = normalized_comment,
         photo_path = normalized_photo_path,
         reviewer_user_id = auth.uid(),
         updated_at = now()
   where establishment_id = p_establishment_id
     and reviewer_user_id = auth.uid();

  if not found then
    insert into public.establishment_ratings (
      establishment_id,
      visitor_token_hash,
      reviewer_user_id,
      rating,
      reviewer_name,
      comment,
      photo_path
    ) values (
      p_establishment_id,
      token_hash,
      auth.uid(),
      p_rating,
      normalized_reviewer_name,
      normalized_comment,
      normalized_photo_path
    );
  end if;
end;
$$;

revoke all on function public.submit_establishment_rating(uuid, text, integer, text, text, text) from public;
grant execute on function public.submit_establishment_rating(uuid, text, integer, text, text, text) to authenticated;

commit;
