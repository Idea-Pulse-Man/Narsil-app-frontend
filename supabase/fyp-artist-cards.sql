-- ===========================================================================
-- For You artist story cards
-- ---------------------------------------------------------------------------
-- Dedicated table for artist snap cards on the Narsil / For You feed.
-- Populated by the AWS artist-profile cron (`npm run ingest:artists`).
-- The app reads active rows here — not `artists.profile_ready` directly.
--
-- HOW TO RUN:
--   Supabase → SQL Editor → paste → Run.
--   Safe to re-run (additive only).
-- ===========================================================================

create table if not exists public.fyp_artist_cards (
  id                  text primary key default gen_random_uuid()::text,

  -- Link to full artist profile ("Meet the artist" button)
  artist_id           text not null references public.artists(id) on delete cascade,

  -- Card UI (denormalized for fast feed reads)
  name                text not null,
  lifespan            text,
  nationality         text,
  portrait_url        text not null,
  famous_for          text,
  bio                 text not null,

  -- Backdrop artwork behind the card text
  backdrop_artwork_id text references public.artworks(id) on delete set null,
  backdrop_image_url  text,
  backdrop_title      text,

  -- Feed control
  active              boolean not null default true,
  sort_order          integer not null default 0,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index if not exists fyp_artist_cards_artist_unique
  on public.fyp_artist_cards (artist_id);

create index if not exists fyp_artist_cards_active_idx
  on public.fyp_artist_cards (active, sort_order desc)
  where active = true;

alter table public.fyp_artist_cards enable row level security;

drop policy if exists "FYP artist cards are public" on public.fyp_artist_cards;
create policy "FYP artist cards are public"
  on public.fyp_artist_cards for select
  using (true);

-- ── Backfill from existing profile_ready artists (run once after table create) ─
insert into public.fyp_artist_cards (
  artist_id,
  name,
  lifespan,
  nationality,
  portrait_url,
  famous_for,
  bio,
  backdrop_artwork_id,
  backdrop_image_url,
  backdrop_title,
  active,
  sort_order
)
select
  a.id,
  a.name,
  a.lifespan,
  a.nationality,
  a.avatar_url,
  coalesce(
    nullif(array_to_string(a.famous_works[1:3], ' · '), ''),
    nullif(trim(a.known_for), '')
  ),
  a.bio,
  aw.id,
  aw.image_url,
  aw.title,
  true,
  coalesce(a.followers, 0)
from public.artists a
left join lateral (
  select id, title, image_url
  from public.artworks
  where artist_id = a.id
    and image_url is not null
    and coalesce(hidden, false) = false
  order by featured desc nulls last, like_count desc nulls last
  limit 1
) aw on true
where a.profile_ready = true
  and a.avatar_url is not null
  and length(trim(coalesce(a.bio, ''))) >= 140
on conflict (artist_id) do update set
  name = excluded.name,
  lifespan = excluded.lifespan,
  nationality = excluded.nationality,
  portrait_url = excluded.portrait_url,
  famous_for = excluded.famous_for,
  bio = excluded.bio,
  backdrop_artwork_id = excluded.backdrop_artwork_id,
  backdrop_image_url = excluded.backdrop_image_url,
  backdrop_title = excluded.backdrop_title,
  active = true,
  sort_order = excluded.sort_order,
  updated_at = now();
