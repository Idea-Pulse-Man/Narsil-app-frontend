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

/** Small deterministic PRNG — same seed always yields the same sequence. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic Fisher–Yates shuffle: the same (list, seed) reshuffles the
 *  same way, so a per-session seed keeps order stable while the user scrolls. */
export function seededShuffle<T>(list: T[], seed: number): T[] {
  const arr = [...list];
  const rand = mulberry32(seed);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Default For You batches: the top 100 most-popular works, then 50 at a time. */
export const DEFAULT_FEED_BATCH_SIZES = [100, 50];

export interface BatchShuffleOptions {
  seed?: number;
  artistMap?: Record<string, Artist>;
  batchSizes?: number[];
}

/**
 * Rank by popularity, then randomize order *within* descending batches: the top
 * `batchSizes[0]` most-popular works come first (in a random order), then the
 * next `batchSizes[1]`, and so on — the last size repeats for the remainder.
 * The most-loved art always surfaces early, but the exact sequence feels fresh
 * each session instead of a fixed leaderboard.
 */
export function batchShuffleByPopularity(
  list: Artwork[],
  { seed = 0, artistMap, batchSizes = DEFAULT_FEED_BATCH_SIZES }: BatchShuffleOptions = {},
): Artwork[] {
  const sorted = sortByPopularity(list, artistMap);
  const out: Artwork[] = [];
  let i = 0;
  let batch = 0;
  while (i < sorted.length) {
    const raw = batchSizes[Math.min(batch, batchSizes.length - 1)];
    const size = Math.max(1, raw ?? 1);
    const slice = sorted.slice(i, i + size);
    // Offset the seed per batch so batches don't all shuffle in lockstep.
    out.push(...seededShuffle(slice, (seed + batch * 0x9e3779b1) | 0));
    i += size;
    batch += 1;
  }
  return out;
}

export interface SessionFeedOptions {
  limit: number;
  seen?: Set<string>;
  artistMap?: Record<string, Artist>;
  /** Per-session seed for the within-batch shuffle (stable while scrolling,
   *  fresh on the next app open). */
  seed?: number;
  /** Popularity batch sizes; order is randomized within each batch. */
  batchSizes?: number[];
}

/**
 * Build the For You feed: unseen works first (popularity-batched, shuffled
 * within each batch), then already-seen works so the feed never runs dry.
 */
export function buildSessionFeed(
  pool: Artwork[],
  { limit, seen, artistMap, seed = 0, batchSizes }: SessionFeedOptions,
): Artwork[] {
  const batched = (list: Artwork[]) =>
    batchShuffleByPopularity(list, { seed, artistMap, batchSizes });

  if (!seen || seen.size === 0) {
    return batched(pool).slice(0, limit);
  }

  const { unseen, alreadySeen } = partitionSeen(pool, seen);
  return [...batched(unseen), ...batched(alreadySeen)].slice(0, limit);
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
