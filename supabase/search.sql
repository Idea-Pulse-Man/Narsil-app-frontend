-- ===========================================================================
-- Narsil — full-text search over artwork text
-- Safe to re-run. Run in the Supabase SQL Editor after catalog-columns.sql.
-- The final UPDATE fills every existing row once (a few seconds for ~20k).
--
-- Search used to match only titles and artist names, so "sunflowers" or
-- "horse" missed works that only mention them in the description. This keeps
-- a weighted text index per artwork — title (A), tags/period/medium (B),
-- descriptions (C) — that the app queries with websearch syntax
-- (lib/catalog.ts → searchCatalog, `textSearch("search_doc", …)`).
-- English stemming: "horses" finds "horse".
-- ===========================================================================

alter table public.artworks add column if not exists search_doc tsvector;

create index if not exists artworks_search_doc_idx
  on public.artworks using gin (search_doc);

create or replace function public.artworks_search_doc_refresh()
returns trigger
language plpgsql
as $$
begin
  new.search_doc :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english',
      coalesce(array_to_string(new.tags, ' '), '') || ' ' ||
      coalesce(new.period, '') || ' ' ||
      coalesce(new.medium, '') || ' ' ||
      coalesce(new.empire, '')), 'B') ||
    setweight(to_tsvector('english',
      coalesce(new.ai_description, '') || ' ' ||
      coalesce(new.description, '')), 'C');
  return new;
end;
$$;

drop trigger if exists artworks_search_doc on public.artworks;
create trigger artworks_search_doc
  before insert or update of title, tags, period, medium, empire, description, ai_description
  on public.artworks
  for each row execute function public.artworks_search_doc_refresh();

-- Fill existing rows (fires the trigger).
update public.artworks set title = title where search_doc is null;
