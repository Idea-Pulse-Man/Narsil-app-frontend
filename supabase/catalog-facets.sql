-- ===========================================================================
-- Narsil — Search filter options across the whole archive
-- Safe to re-run. Run in the Supabase SQL Editor (after schema.sql).
--
-- The app loads artworks in pages, so building Search's filter lists
-- (museums, empires, collections, periods) from the loaded rows showed only
-- a fraction of what exists. `catalog_facets()` returns the distinct values
-- over every browsable artwork in one small JSON answer. The app calls it
-- once per session (lib/catalog.ts → fetchCatalogFacets) and falls back to
-- the loaded rows while this function is missing.
--
-- `periods` is capped at the 80 most common labels: the column holds ~1,500
-- free-text values, too many for a picker.
-- ===========================================================================

create or replace function public.catalog_facets()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with live as (
    select source, empire, category, period
    from public.artworks
    where image_url is not null
      and coalesce(hidden, false) = false
  )
  select jsonb_build_object(
    'sources', coalesce((
      select jsonb_agg(source order by n desc)
      from (select source, count(*) as n from live
            where coalesce(source, '') <> '' group by source) s
    ), '[]'::jsonb),
    'empires', coalesce((
      select jsonb_agg(empire order by n desc)
      from (select empire, count(*) as n from live
            where coalesce(empire, '') <> '' group by empire) e
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(category order by n desc)
      from (select category, count(*) as n from live
            where coalesce(category, '') <> '' group by category) c
    ), '[]'::jsonb),
    'periods', coalesce((
      select jsonb_agg(period order by n desc)
      from (select period, count(*) as n from live
            where coalesce(period, '') <> '' group by period
            order by n desc limit 80) p
    ), '[]'::jsonb)
  );
$$;

grant execute on function public.catalog_facets() to anon, authenticated;
