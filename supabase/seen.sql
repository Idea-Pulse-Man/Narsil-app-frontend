-- ===========================================================================
-- Narsil — "seen" tracking migration
-- ---------------------------------------------------------------------------
-- Records which artworks a user has already viewed in the For You feed, so the
-- next session can promote UNSEEN art to the top instead of replaying the same
-- images. Same shape/RLS pattern as `collections` / `follows`.
--
-- HOW TO RUN:
--   Supabase → SQL Editor → New query → paste this file → Run.
--   Safe to re-run (uses `if not exists`); it never drops data.
--
-- NOTE: additive to `schema.sql` (v2). Works for anonymous sessions too, since
--       Supabase anonymous users have the `authenticated` role.
-- ===========================================================================

create table if not exists public.seen (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  artwork_id text not null,
  seen_at    timestamptz not null default now(),
  primary key (user_id, artwork_id)
);

create index if not exists seen_user_idx on public.seen (user_id);

alter table public.seen enable row level security;

drop policy if exists "Users manage their own seen" on public.seen;
create policy "Users manage their own seen"
  on public.seen for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
