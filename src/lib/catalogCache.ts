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
  if (!snap?.artworks?.length || !snap.artists?.length) return null;
  return {
    artworks: snap.artworks,
    artists: snap.artists,
    fypArtistCards: snap.fypArtistCards ?? [],
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
