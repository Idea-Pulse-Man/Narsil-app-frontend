/**
 * Validates catalog payloads before hydration or persistence.
 * Cached snapshots can survive deployments with partial or legacy shapes;
 * reading `.name` on a missing row blanks the whole app at startup.
 */
import type { Artist, Artwork, FypArtistCard } from "@/data";
import type { RemoteCatalog } from "./catalog";

function normalizeArtist(item: unknown): Artist | null {
  if (!item || typeof item !== "object") return null;
  const artist = item as Artist;
  if (
    typeof artist.id !== "string" ||
    artist.id.length === 0 ||
    typeof artist.name !== "string" ||
    artist.name.trim().length === 0
  ) {
    return null;
  }
  const name = artist.name.trim();
  return {
    ...artist,
    name,
    bio: typeof artist.bio === "string" ? artist.bio : "",
    initials:
      typeof artist.initials === "string" && artist.initials.trim().length > 0
        ? artist.initials.trim()
        : name.slice(0, 2).toUpperCase(),
  };
}

function isValidArtwork(item: unknown): item is Artwork {
  if (!item || typeof item !== "object") return false;
  const art = item as Artwork;
  return (
    typeof art.id === "string" &&
    art.id.length > 0 &&
    typeof art.title === "string" &&
    art.title.length > 0 &&
    typeof art.image === "string" &&
    art.image.length > 0 &&
    typeof art.artistId === "string" &&
    art.artistId.length > 0
  );
}

function normalizeArtwork(item: unknown): Artwork | null {
  if (!isValidArtwork(item)) return null;
  const art = item as Artwork;
  return {
    ...art,
    description: typeof art.description === "string" ? art.description : "",
  };
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
    card.portraitUrl.length > 0 &&
    typeof card.bio === "string"
  );
}

/** Drop malformed rows; return null when the catalog is unusable. */
export function sanitizeRemoteCatalog(data: unknown): RemoteCatalog | null {
  if (!data || typeof data !== "object") return null;
  const raw = data as Partial<RemoteCatalog>;
  const artists = Array.isArray(raw.artists)
    ? raw.artists
        .map(normalizeArtist)
        .filter((artist): artist is Artist => artist !== null)
    : [];
  const artistIds = new Set(artists.map((a) => a.id));
  const artworks = Array.isArray(raw.artworks)
    ? raw.artworks
        .map(normalizeArtwork)
        .filter(
          (item): item is Artwork =>
            item !== null && artistIds.has(item.artistId),
        )
    : [];
  const fypArtistCards = Array.isArray(raw.fypArtistCards)
    ? raw.fypArtistCards.filter(isValidFypCard)
    : [];
  if (artworks.length === 0 || artists.length === 0) return null;
  return { artworks, artists, fypArtistCards };
}

/** One-time cleanup for legacy cache keys written before row validation. */
export function purgeLegacyCatalogCaches(): void {
  if (typeof window === "undefined") return;
  try {
    for (const key of Object.keys(localStorage)) {
      if (
        key.startsWith("narsil:catalog-snapshot:v") &&
        key !== "narsil:catalog-snapshot:v3"
      ) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* private mode */
  }
  if (typeof indexedDB === "undefined") return;
  void new Promise<void>((resolve) => {
    const req = indexedDB.open("narsil-catalog-meta", 1);
    req.onsuccess = () => {
      const db = req.result;
      if (db.objectStoreNames.contains("catalog")) {
        const tx = db.transaction("catalog", "readwrite");
        tx.objectStore("catalog").delete("v1");
      }
      db.close();
      resolve();
    };
    req.onerror = () => resolve();
  });
}
