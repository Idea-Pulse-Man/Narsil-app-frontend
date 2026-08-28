/**
 * Validates catalog payloads before hydration or persistence.
 * Cached snapshots can survive deployments with partial or legacy shapes;
 * reading `.name` on a missing row blanks the whole app at startup.
 */
import type { Artist, Artwork, FypArtistCard } from "@/data";
import type { RemoteCatalog } from "./catalog";

function isValidArtwork(item: unknown): item is Artwork {
  if (!item || typeof item !== "object") return false;
  const art = item as Artwork;
  return (
    typeof art.id === "string" &&
    art.id.length > 0 &&
    typeof art.title === "string" &&
    art.title.length > 0
  );
}

function isValidArtist(item: unknown): item is Artist {
  if (!item || typeof item !== "object") return false;
  const artist = item as Artist;
  return (
    typeof artist.id === "string" &&
    artist.id.length > 0 &&
    typeof artist.name === "string" &&
    artist.name.trim().length > 0
  );
}

function isValidFypCard(item: unknown): item is FypArtistCard {
  if (!item || typeof item !== "object") return false;
  const card = item as FypArtistCard;
  return (
    typeof card.id === "string" &&
    typeof card.artistId === "string" &&
    typeof card.name === "string" &&
    card.name.trim().length > 0 &&
    typeof card.portraitUrl === "string" &&
    typeof card.bio === "string"
  );
}

/** Drop malformed rows; return null when the catalog is unusable. */
export function sanitizeRemoteCatalog(data: unknown): RemoteCatalog | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Partial<RemoteCatalog>;
  const artworks = Array.isArray(raw.artworks)
    ? raw.artworks.filter(isValidArtwork)
    : [];
  const artists = Array.isArray(raw.artists)
    ? raw.artists.filter(isValidArtist)
    : [];
  const fypArtistCards = Array.isArray(raw.fypArtistCards)
    ? raw.fypArtistCards.filter(isValidFypCard)
    : [];
  if (artworks.length === 0 || artists.length === 0) return null;
  return { artworks, artists, fypArtistCards };
}
