import type { Artwork, Artist } from "@/data";

/** Secondary signal from the artist record when artwork engagement is still low. */
export function artistPopularityBoost(artist?: Artist): number {
  if (!artist) return 0;
  const followers = artist.followers ?? 0;
  const likes = artist.likes ?? 0;
  return Math.floor(followers / 10_000 + likes / 50_000);
}

/** Popularity score for feed ranking (artwork engagement + artist social proof). */
export function popularityScore(
  art: Artwork,
  artistMap?: Record<string, Artist>,
): number {
  const likes = art.likeCount ?? 0;
  const saves = art.saveCount ?? 0;
  const featuredBoost = art.featured ? 1000 : 0;
  const artistBoost = artistPopularityBoost(artistMap?.[art.artistId]);
  return likes + saves + featuredBoost + artistBoost;
}

const PORTRAIT_PATTERN =
  /\bportrait\b|portrait photograph|self-portrait|depicts [a-z]/i;

/** Whether an artwork is portrait-like (excluded from default feed). */
export function isPortraitArtwork(art: Artwork): boolean {
  const haystack = [art.title, art.medium, ...art.tags].join(" ").toLowerCase();
  return PORTRAIT_PATTERN.test(haystack);
}

const LOW_ATTENTION_THRESHOLD = 0;

/** True when engagement is below threshold (used to deprioritize, not hard-hide). */
export function isLowAttentionArtwork(art: Artwork): boolean {
  if (art.featured) return false;
  const score = (art.likeCount ?? 0) + (art.saveCount ?? 0);
  return score <= LOW_ATTENTION_THRESHOLD;
}

/** Default For You pool — excludes admin-hidden works and portrait subjects. */
export function isDefaultFeedEligible(art: Artwork): boolean {
  if (art.hidden) return false;
  if (isPortraitArtwork(art)) return false;
  return true;
}

/** Stable tie-breaker so equal scores don't reshuffle between sessions. */
function tieBreakById(a: Artwork, b: Artwork): number {
  return a.id.localeCompare(b.id);
}

export function compareByPopularity(
  a: Artwork,
  b: Artwork,
  artistMap?: Record<string, Artist>,
): number {
  const aLow = isLowAttentionArtwork(a) ? 1 : 0;
  const bLow = isLowAttentionArtwork(b) ? 1 : 0;
  if (aLow !== bLow) return aLow - bLow;
  const scoreDiff = popularityScore(b, artistMap) - popularityScore(a, artistMap);
  if (scoreDiff !== 0) return scoreDiff;
  return tieBreakById(a, b);
}

export function sortByPopularity(
  list: Artwork[],
  artistMap?: Record<string, Artist>,
): Artwork[] {
  return [...list].sort((a, b) => compareByPopularity(a, b, artistMap));
}

/** Rotate a popularity-sorted list so returning users start further down the queue. */
export function rotateForDiscovery<T>(list: T[], offset: number): T[] {
  if (list.length <= 1 || offset <= 0) return list;
  const start = offset % list.length;
  if (start === 0) return list;
  return [...list.slice(start), ...list.slice(0, start)];
}

export interface SessionFeedOptions {
  limit: number;
  seen?: Set<string>;
  artistMap?: Record<string, Artist>;
}

/**
 * Build the For You feed: unseen works first (popularity order, rotated as the
 * user views more over time), then already-seen works so the feed never runs dry.
 */
export function buildSessionFeed(
  pool: Artwork[],
  { limit, seen, artistMap }: SessionFeedOptions,
): Artwork[] {
  if (!seen || seen.size === 0) {
    return sortByPopularity(pool, artistMap).slice(0, limit);
  }

  const { unseen, alreadySeen } = partitionSeen(pool, seen);
  const rankedUnseen = sortByPopularity(unseen, artistMap);
  const discoveryOffset = seen.size % Math.max(rankedUnseen.length, 1);
  const rotatedUnseen = rotateForDiscovery(rankedUnseen, discoveryOffset);
  const rankedSeen = sortByPopularity(alreadySeen, artistMap);

  return [...rotatedUnseen, ...rankedSeen].slice(0, limit);
}

export function partitionSeen(
  list: Artwork[],
  seen: Set<string>,
): { unseen: Artwork[]; alreadySeen: Artwork[] } {
  const unseen: Artwork[] = [];
  const alreadySeen: Artwork[] = [];
  for (const art of list) {
    (seen.has(art.id) ? alreadySeen : unseen).push(art);
  }
  return { unseen, alreadySeen };
}
