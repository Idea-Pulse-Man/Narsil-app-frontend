-- ===========================================================================
-- Narsil — Supabase schema (v1)
-- ---------------------------------------------------------------------------
-- HOW TO RUN:
--   1. Open your Supabase project → "SQL Editor" → "New query".
--   2. Paste this whole file and click "Run".
--   3. Then go to Authentication → Providers → enable "Anonymous sign-ins".
--
-- These tables store each user's saved/liked artworks and followed artists.
-- Row Level Security (RLS) makes sure a user can only read/write their OWN rows.
-- `default auth.uid()` auto-fills the current user's id on insert, so the app
-- never has to send it.
-- ===========================================================================

-- Saved + liked artworks ----------------------------------------------------
create table if not exists public.collections (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  artwork_id text not null,
  kind       text not null check (kind in ('saved', 'liked')),
  created_at timestamptz not null default now(),
  primary key (user_id, artwork_id, kind)
);

alter table public.collections enable row level security;

drop policy if exists "Users manage their own collections" on public.collections;
create policy "Users manage their own collections"
  on public.collections
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Followed artists ----------------------------------------------------------
create table if not exists public.follows (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  artist_id  text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, artist_id)
);

alter table public.follows enable row level security;

drop policy if exists "Users manage their own follows" on public.follows;
create policy "Users manage their own follows"
  on public.follows
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
