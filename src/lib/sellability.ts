import type { Artwork } from "@/data";

/** First segment of artwork id → licensed museum key (mirrors backend ingest). */
const ID_PREFIX_TO_SOURCE: Record<string, string> = {
  met: "met",
  rijks: "rijks",
  aic: "artic",
  cma: "cma",
  wc: "wellcome",
  flickr: "flickr",
};

/** Museums cleared for canvas merchandising. */
const SELLABLE_MUSEUM_SOURCES = new Set([
  "met",
  "rijks",
  "artic",
  "cma",
  "smithsonian",
  "getty",
  "nga",
  "parismusees",
  "mia",
]);

/** Ingest id prefixes that are legally sellable (Wellcome / Flickr excluded). */
export const SELLABLE_ARTWORK_ID_PREFIXES = (
  Object.keys(ID_PREFIX_TO_SOURCE) as (keyof typeof ID_PREFIX_TO_SOURCE)[]
).filter((prefix) => SELLABLE_MUSEUM_SOURCES.has(ID_PREFIX_TO_SOURCE[prefix]));

/**
 * PostgREST `or()` clause for shop queries: `for_sale` plus allowlisted id
 * prefixes, so canvases still appear if the museum backfill has not run.
 */
export function sellableArtworkOrFilter(): string {
  return [
    "for_sale.eq.true",
    ...SELLABLE_ARTWORK_ID_PREFIXES.map((prefix) => `id.like.${prefix}-*`),
  ].join(",");
}

function museumSourceFromArtworkId(artworkId: string): string | null {
  const prefix = artworkId.split("-")[0];
  return ID_PREFIX_TO_SOURCE[prefix] ?? null;
}

function isAllowlistedMuseumArtwork(artwork: Artwork): boolean {
  if (artwork.origin !== "public-domain") return false;
  const source = museumSourceFromArtworkId(artwork.id);
  return source !== null && SELLABLE_MUSEUM_SOURCES.has(source);
}

/** True when this artwork may be ordered as a canvas print. */
export function isCanvasSellable(artwork: Artwork): boolean {
  if (artwork.origin === "artist-original") {
    return artwork.forSale === true;
  }
  // Museum PD: allowlist by ingest id prefix (Wellcome / Flickr never sell).
  if (isAllowlistedMuseumArtwork(artwork)) return true;
  // When the DB backfill has run, for_sale is the server-side source of truth
  // for future museums whose id prefix we do not know client-side yet.
  return artwork.origin === "public-domain" && artwork.forSale === true;
}
