import type { Artwork } from "@/data";

/** Popularity score for feed ranking. */
export function popularityScore(art: Artwork): number {
  const likes = art.likeCount ?? 0;
  const saves = art.saveCount ?? 0;
  const featuredBoost = art.featured ? 1000 : 0;
  return likes + saves + featuredBoost;
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

export function sortByPopularity(a: Artwork, b: Artwork): number {
  const aLow = isLowAttentionArtwork(a) ? 1 : 0;
  const bLow = isLowAttentionArtwork(b) ? 1 : 0;
  if (aLow !== bLow) return aLow - bLow;
  return popularityScore(b) - popularityScore(a);
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
