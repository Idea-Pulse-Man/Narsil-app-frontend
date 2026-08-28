/**
 * Last-known catalog snapshot so the For You feed can render on launch
 * without waiting for Supabase. Trimmed to the first feed window so it fits
 * in localStorage; the full catalog still loads in the background.
 */
import type { Artist, Artwork } from "@/data";
import type { RemoteCatalog } from "./catalog";
import { sanitizeRemoteCatalog } from "./catalogValidate";
import { STORAGE_KEYS, readJSON, writeJSON } from "./storage";

const MAX_DESCRIPTION = 600;
const MAX_BIO = 400;

function slimArtwork(art: Artwork): Artwork {
  return {
    ...art,
    description: (art.description ?? "").slice(0, MAX_DESCRIPTION),
    aiDescription: undefined,
    communityTags: undefined,
  };
}

function slimArtist(artist: Artist): Artist {
  return {
    ...artist,
    bio: (artist.bio ?? "").slice(0, MAX_BIO),
    initials:
      artist.initials ??
      (artist.name?.trim() ? artist.name.trim().slice(0, 2).toUpperCase() : "??"),
  };
}

export function readCatalogSnapshot(): RemoteCatalog | null {
  const snap = readJSON<RemoteCatalog | null>(STORAGE_KEYS.catalogSnapshot, null);
  return sanitizeRemoteCatalog(snap);
}

export function writeCatalogSnapshot(data: RemoteCatalog): void {
  const clean = sanitizeRemoteCatalog(data);
  if (!clean) return;
  writeJSON(STORAGE_KEYS.catalogSnapshot, {
    artworks: clean.artworks.map(slimArtwork),
    artists: clean.artists.map(slimArtist),
    fypArtistCards: clean.fypArtistCards,
  });
}
