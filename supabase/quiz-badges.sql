-- ===========================================================================
-- Narsil — age / empire quiz seals
-- ---------------------------------------------------------------------------
-- One row per earned badge. A seal is granted only on a 100% topic quiz.
-- Higher difficulties are higher-rank seals (apprentice / scholar / master).
--
-- HOW TO RUN:
--   Supabase → SQL Editor → New query → paste this file → Run.
--   Safe to re-run (uses `if not exists`); it never drops data.
--
-- NOTE: additive to `schema.sql`. Same RLS pattern as `quiz_progress`.
-- ===========================================================================

create table if not exists public.quiz_badges (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  badge_id     text not null,
  unlocked_at  timestamptz not null default now(),
  primary key (user_id, badge_id)
);

create index if not exists quiz_badges_user_idx
  on public.quiz_badges (user_id, unlocked_at desc);

alter table public.quiz_badges enable row level security;

drop policy if exists "Users manage their own quiz badges" on public.quiz_badges;
create policy "Users manage their own quiz badges"
  on public.quiz_badges for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
