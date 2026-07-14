-- ===========================================================================
-- Narsil — museum-source & Met metadata cleanup
-- ---------------------------------------------------------------------------
-- Fixes two data-quality problems in rows ingested before this change:
--
--   1. `artworks.source` (the placard's MUSEUM line) held the DONOR CREDIT
--      LINE ("Rogers Fund, 1918") instead of the museum name. It now becomes
--      the holding institution ("The Met", "The Art Institute of Chicago", …),
--      matching what the ingest job writes going forward.
--
--   2. The Met's Open Access CSV joins multi-constituent fields with "|"
--      (artist + publisher: "Goya (…)|Gazette des Beaux-Arts"), which leaked
--      raw into artist names, bios, lifespans and artwork descriptions. Met
--      artist rows are cleaned to the primary constituent and Met artwork
--      descriptions are rebuilt as placard-style prose, preserving the old
--      credit line as provenance ("Etching, burin by Goya (…), ca. 1815.
--      Rogers Fund, 1918.").
--
-- HOW TO RUN:
--   Supabase → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run (every statement is guarded); it never drops data.
--
-- ORDER MATTERS: artist names are cleaned first (descriptions are rebuilt
-- from them), and `source` is overwritten LAST (the rebuild reads the old
-- credit line out of it).
-- ===========================================================================

-- ── 1. Met artists: keep the primary "|"-joined constituent ────────────────

update public.artists
set name = btrim(split_part(name, '|', 1))
where id like 'met-artist-%' and name like '%|%';

update public.artists
set nationality = btrim(split_part(nationality, '|', 1))
where id like 'met-artist-%' and nationality like '%|%';

-- Lifespans like "1746|1859 – 1828|1867" → "1746 – 1828".
update public.artists
set lifespan = regexp_replace(lifespan, '\|[^ ]*', '', 'g')
where id like 'met-artist-%' and lifespan like '%|%';

-- Synthesised bios embedded the polluted name/lifespan → rebuild from the
-- now-clean columns. Real Met display bios just keep their first constituent.
update public.artists
set bio = name
          || case when lifespan is not null and lifespan <> '—'
                  then ' (' || lifespan || ')' else '' end
          || ' is represented in the Open Access collection of The Metropolitan Museum of Art.'
where id like 'met-artist-%' and bio like '%|%' and bio like '%is represented in%';

update public.artists
set bio = btrim(split_part(bio, '|', 1))
where id like 'met-artist-%' and bio like '%|%';

update public.artists
set known_for = btrim(split_part(known_for, '|', 1))
where id like 'met-artist-%' and known_for like '%|%';

-- Recompute the avatar monogram from the cleaned name (mirrors initialsOf()).
update public.artists a
set initials = (
  select case
           when cardinality(w) = 0 then '??'
           when cardinality(w) = 1 then upper(left(w[1], 2))
           else upper(left(w[1], 1) || left(w[cardinality(w)], 1))
         end
  from (
    select array_remove(
             regexp_split_to_array(
               btrim(regexp_replace(a.name, '[^a-zA-Z]+', ' ', 'g')),
               '\s+'
             ),
             ''
           ) as w
  ) s
)
where a.id like 'met-artist-%';

-- ── 2. Met artworks: rebuild the description as placard prose ──────────────
-- "Etching, burin by Goya (Francisco de Goya y Lucientes), ca. 1815
--  (published after 1867). Rogers Fund, 1918."
-- The old credit line still lives in `source` at this point (overwritten in
-- step 3), which also makes this statement idempotent.

update public.artworks a
set description =
      upper(left(coalesce(nullif(a.medium, '—'), 'Work'), 1))
      || substr(coalesce(nullif(a.medium, '—'), 'Work'), 2)
      || coalesce(' by ' || nullif(ar.name, 'Unknown Artist'), '')
      || coalesce(', ' || nullif(a.year, 'Date unknown'), '')
      || '.'
      || case
           when a.source is null
             or btrim(a.source) = ''
             -- old ingest default when the CSV had no credit line
             or a.source = 'The Metropolitan Museum of Art'
           then ''
           else ' ' || rtrim(btrim(a.source), '.') || '.'
         end
from public.artists ar
where ar.id = a.artist_id
  and a.id like 'met-%'
  and a.source is distinct from 'The Met';

-- Stragglers (e.g. orphaned artist_id): at least scrub the "|publisher" junk.
update public.artworks
set description = regexp_replace(description, '\|[^·]*', '', 'g')
where id like 'met-%' and description like '%|%';

-- ── 3. MUSEUM line: holding institution, never the credit line ─────────────
-- (Wellcome `wc-…` and Flickr Commons rows already store institution names.)

update public.artworks set source = 'The Met'
where id like 'met-%' and source is distinct from 'The Met';

update public.artworks set source = 'The Art Institute of Chicago'
where id like 'aic-%' and source is distinct from 'The Art Institute of Chicago';

update public.artworks set source = 'The Cleveland Museum of Art'
where id like 'cma-%' and source is distinct from 'The Cleveland Museum of Art';

update public.artworks set source = 'The Rijksmuseum'
where id like 'rijks-%' and source is distinct from 'The Rijksmuseum';
