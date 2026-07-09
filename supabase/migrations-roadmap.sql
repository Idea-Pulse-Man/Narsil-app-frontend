-- ===========================================================================
-- Narsil — Roadmap migration (Phases 1B–6)
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE where possible.
-- Run in Supabase SQL Editor after schema.sql + catalog-columns.sql.
-- ===========================================================================

-- ── Profiles: ToS acceptance + admin role ─────────────────────────────────
alter table public.profiles add column if not exists terms_accepted_at timestamptz;
alter table public.profiles add column if not exists terms_version text;
alter table public.profiles add column if not exists role text not null default 'user'
  check (role in ('user', 'admin'));

-- ── Artists: sell opt-in + revenue share ────────────────────────────────────
alter table public.artists add column if not exists sell_opt_in boolean not null default false;
alter table public.artists add column if not exists revenue_share_pct integer not null default 30
  check (revenue_share_pct between 0 and 100);

-- ── Artworks: moderation, commerce, AI (deferred generation) ──────────────
alter table public.artworks add column if not exists featured boolean not null default false;
alter table public.artworks add column if not exists hidden boolean not null default false;
alter table public.artworks add column if not exists for_sale boolean not null default false;
alter table public.artworks add column if not exists ai_description text;

create index if not exists artworks_popularity_idx
  on public.artworks ((like_count + save_count) desc);

-- ── Canvas orders: revenue split ────────────────────────────────────────────
alter table public.canvas_orders add column if not exists artist_cut numeric(10, 2);
alter table public.canvas_orders add column if not exists platform_cut numeric(10, 2);

-- ── Community tags ──────────────────────────────────────────────────────────
create table if not exists public.artwork_tags (
  id          uuid primary key default gen_random_uuid(),
  artwork_id  text not null,
  tag         text not null check (char_length(trim(tag)) between 1 and 48),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (artwork_id, tag, user_id)
);

create index if not exists artwork_tags_artwork_idx on public.artwork_tags (artwork_id);

alter table public.artwork_tags enable row level security;

drop policy if exists "Artwork tags are public" on public.artwork_tags;
create policy "Artwork tags are public"
  on public.artwork_tags for select using (true);

drop policy if exists "Users add their own tags" on public.artwork_tags;
create policy "Users add their own tags"
  on public.artwork_tags for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users delete their own tags" on public.artwork_tags;
create policy "Users delete their own tags"
  on public.artwork_tags for delete to authenticated
  using (auth.uid() = user_id);

-- ── Admin helpers ───────────────────────────────────────────────────────────
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- Admins may update catalog moderation + commerce flags on any artwork.
drop policy if exists "Admins update artworks" on public.artworks;
create policy "Admins update artworks"
  on public.artworks for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "Admins update artists" on public.artists;
create policy "Admins update artists"
  on public.artists for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Admins can read all canvas orders (for moderation dashboard).
drop policy if exists "Admins read canvas orders" on public.canvas_orders;
create policy "Admins read canvas orders"
  on public.canvas_orders for select to authenticated
  using (public.is_admin());

-- Seed first admin — replace email before running in production.
-- update public.profiles set role = 'admin' where email = 'goldenstar0124@gmail.com';
