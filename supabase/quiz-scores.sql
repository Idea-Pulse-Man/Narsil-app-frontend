-- ===========================================================================
-- Narsil — age / empire quiz star ratings
-- ---------------------------------------------------------------------------
-- Best score (0–5 stars) per topic trial. Separate from quiz_badges (which
-- still require a perfect run to grant a seal).
--
-- HOW TO RUN:
--   Supabase → SQL Editor → New query → paste this file → Run.
--   Safe to re-run (uses `if not exists`); it never drops data.
-- ===========================================================================

create table if not exists public.quiz_scores (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  quiz_id      text not null,
  stars        smallint not null check (stars >= 0 and stars <= 5),
  score        integer not null default 0,
  total        integer not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (user_id, quiz_id)
);

create index if not exists quiz_scores_user_idx
  on public.quiz_scores (user_id, updated_at desc);

alter table public.quiz_scores enable row level security;

drop policy if exists "Users manage their own quiz scores" on public.quiz_scores;
create policy "Users manage their own quiz scores"
  on public.quiz_scores for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
