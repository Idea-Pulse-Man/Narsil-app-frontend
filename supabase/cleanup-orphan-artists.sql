-- Orphaned-artist cleanup after the backend's artist-name hygiene
-- (narsil-museum-backend: src/museum/artistName.ts).
--
-- Artist ids are derived from the (now cleaned) display name, so on the first
-- `npm run ingest` after that change, artworks re-point to freshly-named
-- artist rows and the old garbled ones ("? Thiery", "a painting",
-- "after Anthony van Dyck", …) are left with no artworks. This removes
-- exactly those rows.
--
-- Run AFTER one full ingest with the updated backend. Safe to re-run.
-- Freelance (user) artists and anyone with followers are never touched.

delete from public.artists a
where a.profile_type = 'historical'
  and not exists (select 1 from public.artworks w where w.artist_id = a.id)
  and not exists (select 1 from public.follows  f where f.artist_id = a.id);
