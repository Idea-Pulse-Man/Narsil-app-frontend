-- ===========================================================================
-- Narsil — Supabase schema (v2)
-- ---------------------------------------------------------------------------
-- HOW TO RUN:
--   1. Open your Supabase project → "SQL Editor" → "New query".
--   2. Paste this whole file and click "Run".
--   3. Authentication → Providers → enable "Anonymous sign-ins" (guest mode)
--      and "Email", plus Google / Apple if you use social login.
--
-- DESIGN NOTES (read me):
--   * There is NO custom "users" table with a password. Supabase Auth owns
--     `auth.users` and securely hashes passwords (bcrypt). We keep extra profile
--     data in `public.profiles`, linked 1:1 to `auth.users(id)` and auto-created
--     by a trigger on signup. NEVER store passwords yourself.
--   * `collections` (saved/liked) and `follows` keep the SAME shape the app
--     already uses, so existing code keeps working.
--   * Artwork like/save counts and artist follower counts are DENORMALISED
--     counter columns kept in sync by triggers — fast to read on any screen.
--   * `artwork_id` / `artist_id` stay TEXT with NO hard foreign key, because the
--     app also saves museum artworks that may not be rows in `artworks`. The
--     counter triggers simply no-op when the referenced row isn't stored.
--   * Row Level Security (RLS): each user can only read/write their OWN private
--     rows; public catalog data (artists, artworks) is world-readable.
-- ===========================================================================

-- Needed for gen_random_uuid().
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- CLEAN SLATE — drop app tables so this file can be re-run to remake them.
-- (auth.users is owned by Supabase Auth and is NEVER dropped here.)
-- ---------------------------------------------------------------------------
drop table if exists public.canvas_orders cascade;
drop table if exists public.addresses     cascade;
drop table if exists public.collections   cascade;
drop table if exists public.follows       cascade;
drop table if exists public.artworks      cascade;
drop table if exists public.artists       cascade;
drop table if exists public.profiles      cascade;

-- ===========================================================================
-- 1. PROFILES  — extends auth.users with app profile fields.
--    (email + password stay in auth.users; this holds the rest.)
-- ===========================================================================
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text,
  email      text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Profiles are viewable by their owner"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Keep the profile row in sync with auth.users. Runs on signup AND on updates
-- (e.g. a guest upgrading to email, or an email change), so email/name stay
-- current. SECURITY DEFINER so it can write past RLS. Name comes from the
-- metadata the client sends at signUp (options.data.full_name / name).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, updated_at)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    now()
  )
  on conflict (id) do update
    set email      = excluded.email,
        full_name  = coalesce(excluded.full_name, public.profiles.full_name),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert or update of email, raw_user_meta_data on auth.users
  for each row execute function public.handle_new_user();

-- ===========================================================================
-- 2. ARTISTS  — creators (museum masters + freelance users).
--    A freelance artist links to an auth user via `user_id`.
-- ===========================================================================
create table public.artists (
  id             text primary key default gen_random_uuid()::text,
  user_id        uuid references auth.users(id) on delete set null,
  name           text not null,
  initials       text,
  profile_type   text not null default 'freelance'
                   check (profile_type in ('historical', 'freelance')),
  bio            text,
  avatar_url     text,
  follower_count integer not null default 0,
  created_at     timestamptz not null default now()
);

alter table public.artists enable row level security;

create policy "Artists are public"
  on public.artists for select
  using (true);

create policy "Users manage their own artist profile"
  on public.artists for all
  to authenticated``
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ===========================================================================
-- 3. ARTWORKS  — catalog items (museum-sourced + user uploads).
--    `like_count` / `save_count` are kept in sync by triggers on `collections`.
-- ===========================================================================
create table public.artworks (
  id          text primary key default gen_random_uuid()::text,
  title       text not null,
  description text,
  image_url   text,
  artist_id   text,
  category    text,
  origin      text default 'artist-original'
                check (origin in ('public-domain', 'artist-original', 'fan-study')),
  created_by  uuid references auth.users(id) on delete set null,
  like_count  integer not null default 0,
  save_count  integer not null default 0,
  created_at  timestamptz not null default now()
);

create index on public.artworks (artist_id);

alter table public.artworks enable row level security;

create policy "Artworks are public"
  on public.artworks for select
  using (true);

create policy "Users manage artworks they created"
  on public.artworks for all
  to authenticated
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

-- ===========================================================================
-- 4. COLLECTIONS  — a user's saved + liked artworks. (Same shape as v1.)
-- ===========================================================================
create table public.collections (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  artwork_id text not null,
  kind       text not null check (kind in ('saved', 'liked')),
  created_at timestamptz not null default now(),
  primary key (user_id, artwork_id, kind)
);

alter table public.collections enable row level security;

create policy "Users manage their own collections"
  on public.collections for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ===========================================================================
-- 5. FOLLOWS  — a user's followed artists. (Same shape as v1.)
-- ===========================================================================
create table public.follows (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  artist_id  text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, artist_id)
);

alter table public.follows enable row level security;

create policy "Users manage their own follows"
  on public.follows for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ===========================================================================
-- 6. ADDRESSES  — delivery / home addresses, many per user.
-- ===========================================================================
create table public.addresses (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  label          text not null default 'Home',       -- e.g. Home, Work
  recipient_name text,
  phone          text,
  line1          text not null,
  line2          text,
  city           text,
  region         text,                                -- state / province
  postal_code    text,
  country        text,
  is_default     boolean not null default false,
  created_at     timestamptz not null default now()
);

create index on public.addresses (user_id);

alter table public.addresses enable row level security;

create policy "Users manage their own addresses"
  on public.addresses for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ===========================================================================
-- 7. CANVAS ORDERS  — canvas-print order lifecycle (register → complete).
-- ===========================================================================
create table public.canvas_orders (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  artwork_id text not null,
  size       text not null check (size in ('Small', 'Medium', 'Large')),
  price      numeric(10, 2),
  status     text not null default 'registered'
               check (status in ('registered', 'completed', 'shipped', 'cancelled')),
  address_id uuid references public.addresses(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index on public.canvas_orders (user_id);

alter table public.canvas_orders enable row level security;

create policy "Users manage their own canvas orders"
  on public.canvas_orders for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ===========================================================================
-- COUNTER TRIGGERS  — keep denormalised counts accurate.
--   SECURITY DEFINER so a viewer liking someone else's artwork can still bump
--   the owner's counter (RLS would otherwise block cross-user updates).
-- ===========================================================================

-- artworks.like_count / save_count  ←  collections
create or replace function public.sync_artwork_counts()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  aid  text;
  knd  text;
  step integer;
begin
  if (tg_op = 'INSERT') then
    aid := new.artwork_id; knd := new.kind; step := 1;
  else
    aid := old.artwork_id; knd := old.kind; step := -1;
  end if;

  if knd = 'liked' then
    update public.artworks
      set like_count = greatest(0, like_count + step)
      where id = aid;
  elsif knd = 'saved' then
    update public.artworks
      set save_count = greatest(0, save_count + step)
      where id = aid;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists collections_count_ins on public.collections;
create trigger collections_count_ins
  after insert on public.collections
  for each row execute function public.sync_artwork_counts();

drop trigger if exists collections_count_del on public.collections;
create trigger collections_count_del
  after delete on public.collections
  for each row execute function public.sync_artwork_counts();

-- artists.follower_count  ←  follows
create or replace function public.sync_artist_followers()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  target text;
  step   integer;
begin
  if (tg_op = 'INSERT') then
    target := new.artist_id; step := 1;
  else
    target := old.artist_id; step := -1;
  end if;

  update public.artists
    set follower_count = greatest(0, follower_count + step)
    where id = target;

  return coalesce(new, old);
end;
$$;

drop trigger if exists follows_count_ins on public.follows;
create trigger follows_count_ins
  after insert on public.follows
  for each row execute function public.sync_artist_followers();

drop trigger if exists follows_count_del on public.follows;
create trigger follows_count_del
  after delete on public.follows
  for each row execute function public.sync_artist_followers();
