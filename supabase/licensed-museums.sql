-- ===========================================================================
-- Narsil — licensed museum allowlist for canvas sales
-- ---------------------------------------------------------------------------
-- Canvas prints may only be sold for artworks from museums on the legal
-- allowlist (or freelance artists who opted in). Browse is unchanged.
--
-- HOW TO RUN:
--   Supabase → SQL Editor → paste → Run.
--   Safe to re-run (additive only).
-- ===========================================================================

-- ── Allowlist table ─────────────────────────────────────────────────────────

create table if not exists public.licensed_museums (
  id              text primary key,
  display_name    text not null,
  allowed_to_sell boolean not null default true
);

insert into public.licensed_museums (id, display_name, allowed_to_sell) values
  ('met',         'The Met',                          true),
  ('rijks',       'The Rijksmuseum',                  true),
  ('artic',       'The Art Institute of Chicago',     true),
  ('cma',         'The Cleveland Museum of Art',      true),
  ('smithsonian', 'Smithsonian',                      true),
  ('getty',       'The Getty',                        true),
  ('nga',         'National Gallery of Art',          true),
  ('parismusees', 'Paris Musées',                     true),
  ('mia',         'Minneapolis Institute of Art',     true)
on conflict (id) do update set
  display_name = excluded.display_name,
  allowed_to_sell = excluded.allowed_to_sell;

alter table public.licensed_museums enable row level security;

drop policy if exists "Licensed museums are public" on public.licensed_museums;
create policy "Licensed museums are public"
  on public.licensed_museums for select
  using (true);

-- ── Tag each artwork with its ingest source ─────────────────────────────────

alter table public.artworks
  add column if not exists museum_source_id text;

create index if not exists artworks_museum_source_idx
  on public.artworks (museum_source_id);

-- Backfill from stable id prefixes (matches ingest job).
update public.artworks set museum_source_id = 'met'     where id like 'met-%';
update public.artworks set museum_source_id = 'rijks'   where id like 'rijks-%';
update public.artworks set museum_source_id = 'artic'   where id like 'aic-%';
update public.artworks set museum_source_id = 'cma'     where id like 'cma-%';
update public.artworks set museum_source_id = 'wellcome' where id like 'wc-%';
update public.artworks set museum_source_id = 'flickr'  where id like 'flickr-%';

-- ── Recompute for_sale on museum public-domain works ────────────────────────
-- Freelance (artist-original) for_sale is left untouched.

update public.artworks
set for_sale = false
where origin = 'public-domain';

update public.artworks a
set for_sale = true
from public.licensed_museums m
where a.museum_source_id = m.id
  and m.allowed_to_sell = true
  and a.origin = 'public-domain';

-- ── Block canvas orders for non-sellable artworks (service_role included) ───

create or replace function public.enforce_canvas_order_sellability()
returns trigger
language plpgsql
as $$
declare
  aw public.artworks%rowtype;
  allowed boolean;
begin
  select * into aw from public.artworks where id = new.artwork_id;
  if not found then
    raise exception 'Artwork not found: %', new.artwork_id
      using errcode = '23503';
  end if;

  if aw.origin = 'artist-original' then
    if not coalesce(aw.for_sale, false) then
      raise exception 'This artwork is not available as a canvas.'
        using errcode = 'P0001';
    end if;
  elsif aw.origin = 'public-domain' then
    select exists (
      select 1
      from public.licensed_museums m
      where m.id = aw.museum_source_id
        and m.allowed_to_sell = true
    ) into allowed;
    if not allowed then
      raise exception 'This artwork is not available as a canvas.'
        using errcode = 'P0001';
    end if;
  else
    raise exception 'This artwork is not available as a canvas.'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists canvas_orders_sellability_check on public.canvas_orders;
create trigger canvas_orders_sellability_check
  before insert or update of artwork_id
  on public.canvas_orders
  for each row
  execute function public.enforce_canvas_order_sellability();
