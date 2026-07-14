-- ===========================================================================
-- Narsil — catalog columns migration
-- ---------------------------------------------------------------------------
-- Adds the columns the app's `Artwork` / `Artist` types need so the whole
-- catalog can be served DIRECTLY from Supabase. These rows are populated by the
-- daily ingestion job running on EC2 (see narsil-museum-backend `npm run ingest`),
-- which pulls public-domain art, uploads the images to S3, and upserts here.
--
-- HOW TO RUN:
--   Supabase → SQL Editor → New query → paste this whole file → Run.
--   Safe to re-run (uses `add column if not exists`); it never drops data.
--
-- NOTE: this is additive to `schema.sql` (v2). Run `schema.sql` first if the
--       base tables don't exist yet.
-- ===========================================================================

-- ── ARTWORKS: fields shown on cards / viewer that weren't in v2 ─────────────
alter table public.artworks add column if not exists year   text;
alter table public.artworks add column if not exists period text;
alter table public.artworks add column if not exists medium text;
alter table public.artworks add column if not exists source text;   -- holding museum (placard MUSEUM line)
alter table public.artworks add column if not exists accent text;   -- blur-up placeholder color
alter table public.artworks add column if not exists tags   text[] not null default '{}';
alter table public.artworks add column if not exists empire text;   -- Roman / Greek / Egyptian…

-- Feed reads newest first.
create index if not exists artworks_created_at_idx
  on public.artworks (created_at desc);

-- ── ARTISTS: profile fields the app renders ─────────────────────────────────
alter table public.artists add column if not exists lifespan    text;
alter table public.artists add column if not exists nationality text;
alter table public.artists add column if not exists period      text;
alter table public.artists add column if not exists style       text;
alter table public.artists add column if not exists known_for   text;
alter table public.artists add column if not exists accent      text;
-- Synthesised social proof for museum masters (the museum APIs have no social
-- graph). Kept SEPARATE from the trigger-managed `follower_count`, so real
-- follows are never clobbered when the daily job re-upserts these rows.
alter table public.artists add column if not exists followers   integer not null default 0;
alter table public.artists add column if not exists likes       integer not null default 0;
alter table public.artists add column if not exists saves       integer not null default 0;
