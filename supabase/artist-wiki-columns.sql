-- ===========================================================================
-- Artist Wikipedia enrichment columns
-- ---------------------------------------------------------------------------
-- Stores Wikipedia-sourced biography context and famous works for For You
-- artist story cards. Safe to re-run (additive only).
--
-- HOW TO RUN:
--   Supabase → SQL Editor → paste → Run.
-- ===========================================================================

-- Notable works from Wikidata P800 / Wikipedia (titles people recognize).
alter table public.artists
  add column if not exists famous_works text[] not null default '{}';

-- Wikidata entity id (e.g. Q5582) when Wikipedia enrichment succeeded.
alter table public.artists
  add column if not exists wikidata_qid text;

-- Canonical English Wikipedia article URL when resolved.
alter table public.artists
  add column if not exists wikipedia_url text;

-- When the Wikipedia bio was last written into `bio` / `known_for` / famous_works.
alter table public.artists
  add column if not exists wiki_enriched_at timestamptz;

-- Cron-built For You profile: real person photo + detailed Wikipedia bio.
-- The app only shows artist story cards when this is true.
alter table public.artists
  add column if not exists profile_ready boolean not null default false;

create index if not exists artists_profile_ready_idx
  on public.artists (profile_ready)
  where profile_ready = true;
