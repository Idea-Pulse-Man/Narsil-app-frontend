-- ===========================================================================
-- Narsil — artwork source image + master dimensions
-- Safe to re-run. Run in the Supabase SQL Editor after catalog-columns.sql.
--
-- WHY
-- ---
-- `image_url` points at the S3 copy the ingest job stages, which is downloaded
-- at INGEST_IMAGE_WIDTH (843px by default). That is the right size for the
-- feed, and the wrong size for everything else:
--
--   · a 24×36" canvas printed from an 843px file is roughly 24 DPI
--   · a "high resolution" download of an 843px file is not high resolution
--
-- `source_image_url` keeps the museum's own image URL. For IIIF sources the
-- size segment in that URL is rewritten on demand, so one stored URL yields
-- both the 2000px free download and the full master
-- (narsil-museum-backend/src/utils/imageDownload.ts → downloadImageUrl).
--
-- `image_width` / `image_height` are the master's true pixel dimensions, read
-- from the IIIF info.json at ingest. NULL for the Met, CMA and Flickr, which
-- serve plain CDN URLs with no image API behind them — the download sheet then
-- shows "High Resolution" without a number rather than inventing one.
--
-- BACKFILL
-- --------
-- Existing rows have NULL source_image_url and keep working: the backend falls
-- back to image_url. Re-running `npm run ingest` repopulates rows as it
-- re-visits them. Until then those artworks print and download at 843px, which
-- is the behaviour they already had.
-- ===========================================================================

alter table public.artworks add column if not exists source_image_url text;
alter table public.artworks add column if not exists image_width  integer;
alter table public.artworks add column if not exists image_height integer;

comment on column public.artworks.source_image_url is
  'Museum-hosted image URL. Full-resolution downloads and Printful print files '
  'resolve from this; image_url is the 843px staged display copy.';
comment on column public.artworks.image_width is
  'Master width in px from IIIF info.json. NULL when the source exposes no image API.';
comment on column public.artworks.image_height is
  'Master height in px from IIIF info.json. NULL when the source exposes no image API.';

-- Lets the ingest job and admin tooling find rows still missing a master URL.
create index if not exists artworks_missing_source_image_idx
  on public.artworks (id)
  where source_image_url is null;
