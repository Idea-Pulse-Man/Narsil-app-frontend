-- ===========================================================================
-- Narsil — "comments" (Art Discussion) migration
-- ---------------------------------------------------------------------------
-- Public per-artwork discussion threads. Anyone can READ a work's comments;
-- a signed-in user (including anonymous guests, who have the `authenticated`
-- role) can POST and DELETE their OWN comments.
--
-- Author name + avatar are DENORMALISED onto each row. `profiles` is only
-- readable by its owner (see schema.sql), so a join can't expose other users'
-- names for a public thread — we snapshot the display name/avatar at post time.
--
-- HOW TO RUN:
--   Supabase → SQL Editor → New query → paste this file → Run.
--   Safe to re-run (uses `if not exists` / `drop policy if exists`).
--
-- NOTE: additive to `schema.sql` (v2).
-- ===========================================================================

create table if not exists public.comments (
  id            uuid primary key default gen_random_uuid(),
  artwork_id    text not null,
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  author_name   text,
  author_avatar text,
  body          text not null check (char_length(body) between 1 and 1000),
  created_at    timestamptz not null default now()
);

create index if not exists comments_artwork_idx
  on public.comments (artwork_id, created_at);

alter table public.comments enable row level security;

-- Anyone (even signed-out) can read a work's discussion.
drop policy if exists "Comments are public" on public.comments;
create policy "Comments are public"
  on public.comments for select
  using (true);

-- A signed-in user may post as themselves only.
drop policy if exists "Users can post their own comments" on public.comments;
create policy "Users can post their own comments"
  on public.comments for insert
  to authenticated
  with check (auth.uid() = user_id);

-- A user may delete their own comments.
drop policy if exists "Users can delete their own comments" on public.comments;
create policy "Users can delete their own comments"
  on public.comments for delete
  to authenticated
  using (auth.uid() = user_id);

-- Realtime: broadcast INSERTs so open threads update live across devices.
-- (Wrapped so re-running never errors if the table is already in the publication.)
do $$
begin
  alter publication supabase_realtime add table public.comments;
exception
  when duplicate_object then null;
  when undefined_object then null;  -- publication missing (realtime off) — ignore
end $$;
