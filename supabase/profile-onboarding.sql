-- ===========================================================================
-- Narsil — Profile onboarding / preferences sync
-- ---------------------------------------------------------------------------
-- Personalization and onboarding flags were device-local only, so Terms /
-- prefs reappeared on every new browser or cleared storage. Persist them on
-- profiles so a signed-in account restores them on hydrate.
--
-- HOW TO RUN:
--   Supabase → SQL Editor → paste → Run. Safe to re-run.
--
-- REQUIRES: schema.sql → migrations-roadmap.sql → admin-dashboard.sql
-- ===========================================================================

alter table public.profiles
  add column if not exists onboarding_done boolean not null default false;

alter table public.profiles
  add column if not exists tutorial_done boolean not null default false;

alter table public.profiles
  add column if not exists auth_seen boolean not null default false;

alter table public.profiles
  add column if not exists preferences jsonb;

-- Column-level UPDATE was locked down in admin-dashboard.sql; grant the new
-- fields so members can sync their own onboarding state.
grant update (
  onboarding_done,
  tutorial_done,
  auth_seen,
  preferences
) on public.profiles to authenticated;
