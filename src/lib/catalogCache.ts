/**
 * Last-known catalog snapshot so the For You feed can render on launch
 * without waiting for Supabase. Trimmed to the first feed window so it fits
 * in localStorage; the full catalog still loads in the background.
 */
import type { Artist, Artwork } from "@/data";
import type { RemoteCatalog } from "./catalog";
import { STORAGE_KEYS, readJSON, writeJSON } from "./storage";

const MAX_DESCRIPTION = 600;
const MAX_BIO = 400;

function slimArtwork(art: Artwork): Artwork {
  return {
    ...art,
    description: art.description.slice(0, MAX_DESCRIPTION),
    aiDescription: undefined,
    communityTags: undefined,
  };
}

function slimArtist(artist: Artist): Artist {
  return {
    ...artist,
    bio: artist.bio.slice(0, MAX_BIO),
  };
}

export function readCatalogSnapshot(): RemoteCatalog | null {
  const snap = readJSON<RemoteCatalog | null>(STORAGE_KEYS.catalogSnapshot, null);
  // Snapshots survive deployments, so never trust an older stored shape just
  // because its fields are non-null. In particular, an earlier card-map shape
  // can leave `fypArtistCards` as an object; passing it through makes catalog
  // startup call `.map()` on a non-array and blank the whole app.
  const artworks = Array.isArray(snap?.artworks) ? snap.artworks : [];
  const artists = Array.isArray(snap?.artists) ? snap.artists : [];
  const fypArtistCards = Array.isArray(snap?.fypArtistCards)
    ? snap.fypArtistCards
    : [];
  if (artworks.length === 0 || artists.length === 0) return null;
  return {
    artworks,
    artists,
    fypArtistCards,
  };
}

export function writeCatalogSnapshot(data: RemoteCatalog): void {
  if (data.artworks.length === 0 || data.artists.length === 0) return;
  writeJSON(STORAGE_KEYS.catalogSnapshot, {
    artworks: data.artworks.map(slimArtwork),
    artists: data.artists.map(slimArtist),
    fypArtistCards: data.fypArtistCards ?? [],
  });
}
