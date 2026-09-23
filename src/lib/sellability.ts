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

/** Browse categories that are 3D / decorative objects, not flat wall art. */
const NON_CANVAS_CATEGORIES = new Set(["sculptures", "pottery"]);

/**
 * Painting / drawing supports. Used to keep still lifes ("Basket of Fruit")
 * when the title names an object.
 */
const PAINTING_MEDIUM_RE =
  /\b(oil(?:\s+painting)?|acrylic|tempera|gouache|watercolou?r|fresco|encaustic|pastel)s?\b|\b(charcoal|graphite|pencil|crayon|chalk|ink|wash|distemper|collage|drawing|sketch)\b.{0,32}\bon\b|\bon (canvas|panel|paper|board|cardboard|linen|silk|wood|copper|vellum|parchment|masonite)\b|\b(ukiyo-?e|hanging scroll|handscroll|album leaf)\b/i;

/**
 * Physical crafts / museum pieces — never sold as canvas, even if the medium
 * mentions silk or ink (kimonos, embroidered mounts, furniture).
 */
const CRAFT_OBJECT_RE =
  /\b(furniture|armchair|necklace|earring|bracelet|brooch|pendant|locket|tiara|diadem|jewel(?:le)?ry|buckle|costumes?|kimono|garment|musical instruments?|arms and armou?r|candlestick|chandelier|andiron|snuffbox|netsuke|inr[oō]|tsuba|casket|sarcophagus|teapot|pitcher|platter|tureen|tankard|parasol|saddle|bridle|stirrup|quilt|embroid(?:ery|ed)|tapestry|carpet|rug|sampler|basketry|wicker|rattan|textiles?|plant fibres?|plant fibers?|ash splints?|plaque|stele|censer|incense burner|coins?|medals?)\b/i;

/**
 * Words that appear both on 3D objects and in still-life / history paintings.
 * Keep only when the medium is clearly paint or drawing.
 */
const DEPICTED_OBJECT_RE =
  /\b(sculpture|statue|bust|figurine|terracotta|ceramic|porcelain|earthenware|stoneware|amphora|vase|vessel|pottery|marble|bronze|alabaster|faience|steatite|relief|carved|carving|basket|fan|mask|bottle|chair|stool|armor|armour|helmet|sword|clock|goblet|chalice|mummy|coffin|mirror)\b|\b(covered\s+)?(pot|jar|bowl|urn|ewer|kylix|krater)\b/i;

type CanvasSuitabilityFields = {
  category: string | null;
  medium: string | null;
  title: string | null;
  period?: string | null;
  tags?: string[] | null;
};

/** True when the work is flat art suitable for a canvas print (not a craft/object). */
export function isCanvasPrintSuitable(artwork: CanvasSuitabilityFields): boolean {
  if (artwork.category && NON_CANVAS_CATEGORIES.has(artwork.category)) {
    return false;
  }
  const medium = artwork.medium ?? "";
  const identity = [artwork.title ?? "", artwork.period ?? "", ...(artwork.tags ?? [])].join(
    " ",
  );
  if (CRAFT_OBJECT_RE.test(identity) || CRAFT_OBJECT_RE.test(medium)) {
    return false;
  }
  if (DEPICTED_OBJECT_RE.test(identity)) {
    return PAINTING_MEDIUM_RE.test(medium);
  }
  return !DEPICTED_OBJECT_RE.test(medium);
}

/** True when this artwork may be ordered as a canvas print. */
export function isCanvasSellable(artwork: Artwork): boolean {
  if (!isCanvasPrintSuitable(artwork)) return false;
  if (artwork.origin === "artist-original") {
    return artwork.forSale === true;
  }
  // Museum PD: allowlist by ingest id prefix (Wellcome / Flickr never sell).
  if (isAllowlistedMuseumArtwork(artwork)) return true;
  // When the DB backfill has run, for_sale is the server-side source of truth
  // for future museums whose id prefix we do not know client-side yet.
  return artwork.origin === "public-domain" && artwork.forSale === true;
}
