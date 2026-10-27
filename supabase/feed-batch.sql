-- ===========================================================================
-- Narsil — For You batches that put works the user hasn't seen first
-- REQUIRES: schema.sql, catalog-columns.sql, seen.sql
-- Safe to re-run. Run in the Supabase SQL Editor.
--
-- The feed used to page through artworks by popularity offset, so every
-- launch started from the same most-popular works: a returning user scrolled
-- past everything they had already seen before new art turned up, and once
-- they had seen the top ~1000 the feed was nothing but repeats.
--
-- `feed_batch()` returns the caller's next page: works they have never seen
-- first (most popular first), then the ones they have seen, so the feed never
-- runs dry. Instead of an offset the app passes the ids it has already loaded
-- this session (`p_exclude`), which keeps pages from repeating or skipping
-- while new `seen` rows land mid-scroll.
--
-- The app calls it from lib/catalog.ts → fetchFeedBatch and falls back to the
-- old popularity pages while this function is missing.
-- ===========================================================================

create or replace function public.feed_batch(
  p_exclude text[] default '{}',
  p_limit integer default 80
)
returns setof public.artworks
language sql
stable
security invoker
set search_path = public
as $$
  select a.*
  from public.artworks a
  left join public.seen s
    on s.user_id = auth.uid()
   and s.artwork_id = a.id
  where a.image_url is not null
    and coalesce(a.hidden, false) = false
    and not exists (
      select 1 from unnest(p_exclude) as loaded(id) where loaded.id = a.id
    )
  order by
    s.artwork_id is not null,
    a.featured desc nulls last,
    a.like_count desc nulls last,
    a.created_at desc,
    a.id
  limit least(greatest(coalesce(p_limit, 80), 1), 200);
$$;

grant execute on function public.feed_batch(text[], integer) to anon, authenticated;
