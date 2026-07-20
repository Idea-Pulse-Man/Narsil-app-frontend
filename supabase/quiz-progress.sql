-- ===========================================================================
-- Narsil — daily quiz progress migration
-- ---------------------------------------------------------------------------
-- Stores each user's daily-quiz streak so it follows a signed-in account across
-- devices. One row per user. Same shape / RLS pattern as `seen` / `collections`.
--
-- HOW TO RUN:
--   Supabase → SQL Editor → New query → paste this file → Run.
--   Safe to re-run (uses `if not exists`); it never drops data.
--
-- NOTE: additive to `schema.sql`. Works for anonymous sessions too (Supabase
--       anonymous users have the `authenticated` role) — but streaks only
--       actually travel between devices for real (non-anonymous) accounts,
--       since anonymous users are per-device.
-- ===========================================================================

create table if not exists public.quiz_progress (
  user_id           uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  streak            integer not null default 0,
  last_played_date  date,
  last_daily_score  integer,
  last_daily_total  integer,
  total_answered    integer not null default 0,
  updated_at        timestamptz not null default now()
);

alter table public.quiz_progress enable row level security;

drop policy if exists "Users manage their own quiz progress" on public.quiz_progress;
create policy "Users manage their own quiz progress"
  on public.quiz_progress for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
