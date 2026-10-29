-- =====================================================
-- VISTABALAYAN PUBLIC ESTABLISHMENT RATINGS
-- Run this in the Supabase SQL Editor with owner/admin privileges.
--
-- Public users submit a 1-5 star rating, required display name, and optional comment through a locked RPC.
-- The raw rating table is not exposed to anon/authenticated clients.
-- The public page reads aggregate summaries plus sanitized public review comments.
-- Visitor tokens are hashed before storage.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.establishment_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  visitor_token_hash TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  reviewer_name TEXT NOT NULL CHECK (char_length(trim(reviewer_name)) BETWEEN 1 AND 80),
  comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (establishment_id, visitor_token_hash)
);

ALTER TABLE public.establishment_ratings
  ADD COLUMN IF NOT EXISTS visitor_token_hash TEXT;

ALTER TABLE public.establishment_ratings
  ADD COLUMN IF NOT EXISTS comment TEXT;

ALTER TABLE public.establishment_ratings
  ADD COLUMN IF NOT EXISTS reviewer_name TEXT;

ALTER TABLE public.establishment_ratings
  ADD COLUMN IF NOT EXISTS photo_path TEXT;

UPDATE public.establishment_ratings
SET reviewer_name = 'Anonymous visitor'
WHERE reviewer_name IS NULL OR trim(reviewer_name) = '';

ALTER TABLE public.establishment_ratings
  ALTER COLUMN reviewer_name SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'establishment_ratings'
      AND constraint_name = 'establishment_ratings_comment_length_check'
  ) THEN
    ALTER TABLE public.establishment_ratings
      ADD CONSTRAINT establishment_ratings_comment_length_check CHECK (comment IS NULL OR char_length(comment) <= 500);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'establishment_ratings'
      AND constraint_name = 'establishment_ratings_reviewer_name_length_check'
  ) THEN
    ALTER TABLE public.establishment_ratings
      ADD CONSTRAINT establishment_ratings_reviewer_name_length_check CHECK (char_length(trim(reviewer_name)) BETWEEN 1 AND 80);
  END IF;
END;
$$;

-- If an older draft table with raw visitor_token exists, hash it once so the
-- final public implementation does not need to expose or keep raw tokens.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'establishment_ratings'
      AND column_name = 'visitor_token'
  ) THEN
    EXECUTE 'UPDATE public.establishment_ratings SET visitor_token_hash = md5(visitor_token) WHERE visitor_token_hash IS NULL';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS establishment_ratings_establishment_token_hash_idx
  ON public.establishment_ratings (establishment_id, visitor_token_hash);

CREATE INDEX IF NOT EXISTS establishment_ratings_establishment_id_idx
  ON public.establishment_ratings (establishment_id);

CREATE OR REPLACE FUNCTION public.set_establishment_ratings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_establishment_ratings_updated_at ON public.establishment_ratings;
CREATE TRIGGER set_establishment_ratings_updated_at
  BEFORE UPDATE ON public.establishment_ratings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_establishment_ratings_updated_at();

ALTER TABLE public.establishment_ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can read establishment ratings" ON public.establishment_ratings;
DROP POLICY IF EXISTS "Public can insert establishment ratings" ON public.establishment_ratings;
DROP POLICY IF EXISTS "Public can update establishment ratings" ON public.establishment_ratings;

REVOKE ALL ON public.establishment_ratings FROM anon, authenticated;

DROP VIEW IF EXISTS public.establishment_rating_summaries;
CREATE VIEW public.establishment_rating_summaries AS
SELECT
  ratings.establishment_id,
  ROUND(AVG(ratings.rating)::numeric, 1)::float AS average_rating,
  COUNT(*)::integer AS rating_count,
  COUNT(*) FILTER (WHERE ratings.rating = 1)::integer AS one_star_count,
  COUNT(*) FILTER (WHERE ratings.rating = 2)::integer AS two_star_count,
  COUNT(*) FILTER (WHERE ratings.rating = 3)::integer AS three_star_count,
  COUNT(*) FILTER (WHERE ratings.rating = 4)::integer AS four_star_count,
  COUNT(*) FILTER (WHERE ratings.rating = 5)::integer AS five_star_count,
  COUNT(NULLIF(trim(ratings.comment), ''))::integer AS comment_count
FROM public.establishment_ratings ratings
JOIN public.establishments establishments
  ON establishments.id = ratings.establishment_id
WHERE establishments.status = 'active'
  AND (
    LOWER(establishments.type) LIKE '%hotel%'
    OR LOWER(establishments.type) LIKE '%inn%'
    OR LOWER(establishments.type) LIKE '%lodge%'
    OR LOWER(establishments.type) LIKE '%resort%'
    OR LOWER(establishments.type) LIKE '%pool%'
    OR LOWER(establishments.type) LIKE '%farm%'
  )
GROUP BY ratings.establishment_id;

GRANT SELECT ON public.establishment_rating_summaries TO anon, authenticated;

DROP VIEW IF EXISTS public.establishment_rating_reviews;
CREATE VIEW public.establishment_rating_reviews AS
SELECT
  ratings.id,
  ratings.establishment_id,
  ratings.rating,
  ratings.reviewer_name,
  NULLIF(trim(ratings.comment), '') AS comment,
  ratings.photo_path,
  ratings.created_at
FROM public.establishment_ratings ratings
JOIN public.establishments establishments
  ON establishments.id = ratings.establishment_id
WHERE establishments.status = 'active'
  AND (
    LOWER(establishments.type) LIKE '%hotel%'
    OR LOWER(establishments.type) LIKE '%inn%'
    OR LOWER(establishments.type) LIKE '%lodge%'
    OR LOWER(establishments.type) LIKE '%resort%'
    OR LOWER(establishments.type) LIKE '%pool%'
    OR LOWER(establishments.type) LIKE '%farm%'
  );

GRANT SELECT ON public.establishment_rating_reviews TO anon, authenticated;

-- Review photos are uploaded by the public client and are referenced by the
-- rating RPC below. Keep the object path scoped to an establishment UUID and
-- a generated review UUID.
INSERT INTO storage.buckets (id, name, public)
VALUES ('review-photos', 'review-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Public can upload review photos" ON storage.objects;
CREATE POLICY "Public can upload review photos"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'review-photos'
    AND name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  );

DROP POLICY IF EXISTS "Anyone can read review photos" ON storage.objects;
CREATE POLICY "Anyone can read review photos"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'review-photos');

DROP FUNCTION IF EXISTS public.submit_establishment_rating(UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.submit_establishment_rating(UUID, TEXT, INTEGER, TEXT);
DROP FUNCTION IF EXISTS public.submit_establishment_rating(UUID, TEXT, INTEGER, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.submit_establishment_rating(
  p_establishment_id UUID,
  p_visitor_token TEXT,
  p_rating INTEGER,
  p_comment TEXT DEFAULT NULL,
  p_reviewer_name TEXT DEFAULT NULL,
  p_photo_path TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  normalized_token TEXT := trim(p_visitor_token);
  token_hash TEXT;
  public_establishment_exists BOOLEAN;
  normalized_comment TEXT := NULLIF(trim(p_comment), '');
  normalized_reviewer_name TEXT := NULLIF(trim(p_reviewer_name), '');
  normalized_photo_path TEXT := NULLIF(trim(p_photo_path), '');
BEGIN
  IF p_establishment_id IS NULL THEN
    RAISE EXCEPTION 'establishment_id is required';
  END IF;

  IF normalized_token IS NULL OR length(normalized_token) < 16 OR length(normalized_token) > 128 THEN
    RAISE EXCEPTION 'valid visitor token is required';
  END IF;

  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
    RAISE EXCEPTION 'rating must be between 1 and 5';
  END IF;

  IF normalized_comment IS NOT NULL AND char_length(normalized_comment) > 500 THEN
    RAISE EXCEPTION 'comment must be 500 characters or fewer';
  END IF;

  IF normalized_reviewer_name IS NULL THEN
    RAISE EXCEPTION 'reviewer name is required';
  END IF;

  IF char_length(normalized_reviewer_name) > 80 THEN
    RAISE EXCEPTION 'reviewer name must be 80 characters or fewer';
  END IF;

  IF normalized_photo_path IS NOT NULL
     AND normalized_photo_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$' THEN
    RAISE EXCEPTION 'invalid review photo path';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.establishments establishments
    WHERE establishments.id = p_establishment_id
      AND establishments.status = 'active'
      AND (
        LOWER(establishments.type) LIKE '%hotel%'
        OR LOWER(establishments.type) LIKE '%inn%'
        OR LOWER(establishments.type) LIKE '%lodge%'
        OR LOWER(establishments.type) LIKE '%resort%'
        OR LOWER(establishments.type) LIKE '%pool%'
        OR LOWER(establishments.type) LIKE '%farm%'
      )
  ) INTO public_establishment_exists;

  IF NOT public_establishment_exists THEN
    RAISE EXCEPTION 'establishment is not publicly rateable';
  END IF;

  token_hash := md5(normalized_token);

  INSERT INTO public.establishment_ratings (establishment_id, visitor_token_hash, rating, reviewer_name, comment, photo_path)
  VALUES (p_establishment_id, token_hash, p_rating, normalized_reviewer_name, normalized_comment, normalized_photo_path)
  ON CONFLICT (establishment_id, visitor_token_hash)
  DO UPDATE SET
    rating = EXCLUDED.rating,
    reviewer_name = EXCLUDED.reviewer_name,
    comment = EXCLUDED.comment,
    photo_path = EXCLUDED.photo_path;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_establishment_rating(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_establishment_rating(UUID, TEXT, INTEGER, TEXT, TEXT, TEXT) TO anon, authenticated;
