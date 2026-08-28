import type { Artwork, Artist, FeedItem, FypArtistCard } from "@/data";
import { eraForArtwork } from "@/data/history";

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

/**
 * Anonymous or generic maker attributions that don't name a single real person
 * — e.g. "a Chinese artist" / "an English painter" (Wellcome-style descriptors),
 * "British School", "Workshop of Rubens", "Circle of Rembrandt", "Unknown".
 * These have no personal likeness, so the app never shows a portrait avatar for
 * them (it falls back to the initials monogram) even if a stale photo is stored.
 */
const GENERIC_MAKER_PATTERNS: RegExp[] = [
  /^\s*(unknown|anonymous|unidentified|various|not known)\b/i,
  /^after\s+/i,
  /\b(workshop|atelier|manufactory|studio of|master of|circle of|follower of|manner of|attributed to|imitator of)\b/i,
  /\bschool\b/i,
  // Indefinite-article descriptors: "a Chinese artist", "an English painter".
  /^an?\s+.*\b(artist|painter|sculptor|engraver|printmaker|illustrator|dra[uf]ghtsman|photographer|architect|designer|potter|goldsmith|ceramicist|muralist|caricaturist|etcher|maker|master|craftsman|calligrapher|scribe)s?\b/i,
];

/** True when a name is an anonymous/generic attribution rather than a real person. */
export function isGenericMakerName(name?: string | null): boolean {
  const key = (name ?? "").trim();
  if (!key) return true;
  return GENERIC_MAKER_PATTERNS.some((re) => re.test(key));
}

const PORTRAIT_PATTERN =
  /\bportrait\b|portrait photograph|self-portrait|depicts [a-z]/i;

/** Whether an artwork is portrait-like (excluded from default feed). */
export function isPortraitArtwork(art: Artwork): boolean {
  const haystack = [art.title, art.medium, ...art.tags].join(" ").toLowerCase();
  return PORTRAIT_PATTERN.test(haystack);
}

/**
 * Monochrome sketches — pencil/graphite/chalk studies and similar working
 * drawings. Kept rare in the For You feed (see SKETCH_MIN_GAP): they read as
 * repetitive filler next to finished paintings when several appear close
 * together.
 */
const SKETCH_PATTERN =
  /\b(pencil|graphite|charcoal|chalk|crayon|sanguine|silverpoint|metalpoint)\b|\bsketch(?:es|book)?\b|\bstud(?:y|ies)\b|\bdrawings?\b/i;

/** Whether an artwork is a pencil/chalk-style sketch or study drawing. */
export function isSketchArtwork(art: Artwork): boolean {
  const haystack = [art.title, art.medium, ...art.tags].join(" ");
  return SKETCH_PATTERN.test(haystack);
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

/** Max artworks the feed keeps ranked in memory — enough variety without blocking the UI. */
export const FEED_POOL_CAP = 1000;

/** Reorder a pre-ranked pool for the current session without another popularity sort. */
export function orderSessionFeed(
  preRanked: Artwork[],
  opts: { seen?: Set<string>; limit?: number } = {},
): Artwork[] {
  const limit = opts.limit ?? FEED_POOL_CAP;
  if (!opts.seen?.size) return preRanked.slice(0, limit);
  const unseen: Artwork[] = [];
  const alreadySeen: Artwork[] = [];
  for (const art of preRanked) {
    if (opts.seen.has(art.id)) alreadySeen.push(art);
    else unseen.push(art);
  }
  return [...unseen, ...alreadySeen].slice(0, limit);
}

/** Minimum artworks between two works by the same artist in the feed. */
const ARTIST_MIN_GAP = 2;

/** Minimum number of other cards between two sketch/pencil drawings. */
export const SKETCH_MIN_GAP = 50;

export interface SpacingRule<T> {
  /** Group key for this rule; null means the item is unconstrained by it. */
  keyOf: (item: T) => string | null;
  /** Minimum number of other items between two items sharing a key. */
  gap: number;
}

/**
 * Reorder so that items sharing a key stay at least `gap` positions apart
 * (across all rules at once), disturbing the incoming order as little as
 * possible. An item that would violate a gap is deferred and re-inserted at
 * the first legal slot; if the tail of the list leaves no legal slot, the
 * gaps relax rather than dropping works.
 */
export function spaceOutBy<T>(list: T[], rules: SpacingRule<T>[]): T[] {
  const active = rules.filter((r) => r.gap > 0);
  if (active.length === 0) return [...list];
  const out: T[] = [];
  const lastPos = active.map(() => new Map<string, number>());
  const pending: T[] = [];

  const canPlace = (item: T) =>
    active.every((rule, r) => {
      const key = rule.keyOf(item);
      if (key === null) return true;
      const pos = lastPos[r].get(key);
      return pos === undefined || out.length - pos > rule.gap;
    });
  const place = (item: T) => {
    active.forEach((rule, r) => {
      const key = rule.keyOf(item);
      if (key !== null) lastPos[r].set(key, out.length);
    });
    out.push(item);
  };
  const flushPending = () => {
    let i = 0;
    while (i < pending.length) {
      if (canPlace(pending[i])) place(pending.splice(i, 1)[0]);
      else i += 1;
    }
  };

  for (const item of list) {
    flushPending();
    if (canPlace(item)) place(item);
    else pending.push(item);
  }
  // How far the item currently is from its nearest gap conflict — used to
  // degrade gracefully when the pool can't satisfy the gaps: picking the item
  // with the most breathing room yields an even rotation instead of a cluster.
  const slackOf = (item: T) => {
    let slack = Infinity;
    active.forEach((rule, r) => {
      const key = rule.keyOf(item);
      if (key === null) return;
      const pos = lastPos[r].get(key);
      if (pos !== undefined) slack = Math.min(slack, out.length - pos);
    });
    return slack;
  };

  while (pending.length > 0) {
    let i = pending.findIndex(canPlace);
    if (i === -1) {
      // No legal slot left — relax the gaps for the deferred item whose
      // keys were seen the longest ago (ties keep the earliest/most popular).
      let bestSlack = -1;
      i = 0;
      pending.forEach((item, j) => {
        const slack = slackOf(item);
        if (slack > bestSlack) {
          bestSlack = slack;
          i = j;
        }
      });
    }
    place(pending.splice(i, 1)[0]);
  }
  return out;
}

/**
 * Variety pass for the For You feed: the same artist never shows up twice in
 * quick succession, and pencil/chalk sketches stay an occasional accent
 * rather than a run. Both constraints are enforced in a single pass so one
 * can't undo the other.
 */
export function diversifyFeed(list: Artwork[]): Artwork[] {
  return spaceOutBy(list, [
    { keyOf: (art) => art.artistId, gap: ARTIST_MIN_GAP },
    {
      keyOf: (art) => (isSketchArtwork(art) ? "sketch" : null),
      gap: SKETCH_MIN_GAP,
    },
  ]);
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
 * A final variety pass spaces out same-artist works and sketch drawings.
 */
export function buildSessionFeed(
  pool: Artwork[],
  { limit, seen, artistMap, seed = 0, batchSizes }: SessionFeedOptions,
): Artwork[] {
  const batched = (list: Artwork[]) =>
    batchShuffleByPopularity(list, { seed, artistMap, batchSizes });

  let ordered: Artwork[];
  if (!seen || seen.size === 0) {
    ordered = batched(pool);
  } else {
    const { unseen, alreadySeen } = partitionSeen(pool, seen);
    ordered = [...batched(unseen), ...batched(alreadySeen)];
  }
  return diversifyFeed(ordered).slice(0, limit);
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

/** No story slides at the very top — open as a gallery. */
export const STORY_LEAD_IN = 3;
/** Minimum artworks between story slides. */
export const STORY_GAP_MIN = 4;
/** Maximum artworks between story slides. */
export const STORY_GAP_MAX = 7;
/** Only talk about art the user just saw. */
export const STORY_LOOKBACK = 8;
/** Skip stub / empty bios — Wikipedia extracts are typically longer. */
export const STORY_ARTIST_MIN_BIO = 140;

/** Thin museum stubs that must never appear on artist story cards. */
export function isMuseumStubBio(bio?: string | null): boolean {
  const text = (bio ?? "").trim();
  if (!text) return true;
  if (/is represented in the (collection|Open Access)/i.test(text)) return true;
  if (/preparatory stud/i.test(text)) return true;
  if (/Museum collection/i.test(text) && text.length < 120) return true;
  return false;
}

/**
 * Artist story cards need a cron-built profile: real person photograph +
 * detailed Wikipedia bio (`profile_ready`). Obscure museum stubs never appear.
 */
export function isStoryWorthyArtist(artist?: Artist | null): boolean {
  if (!artist) return false;
  if (artist.profileType === "freelance") return false;
  if (isGenericMakerName(artist.name)) return false;
  // Strict gate: only profiles the AWS artist-profile cron marked ready.
  if (!artist.profileReady) return false;
  // Person photo only — never invent a face from an artwork.
  if (!artist.avatar) return false;
  if (isMuseumStubBio(artist.bio)) return false;
  if (artist.bio.trim().length < STORY_ARTIST_MIN_BIO) return false;
  return true;
}

/** Prefer a recognizable / popular work by this artist as the story backdrop. */
export function pickFamousBackdrop(
  artistId: string,
  recent: Artwork[],
  pool: Artwork[],
): Artwork | undefined {
  const byArtist = pool.filter((a) => a.artistId === artistId && a.image);
  if (byArtist.length > 0) {
    const ranked = [...byArtist].sort((a, b) => {
      const score = (art: Artwork) =>
        (art.featured ? 1000 : 0) + (art.likeCount ?? 0) + (art.saveCount ?? 0);
      return score(b) - score(a);
    });
    // Prefer non-sketches when possible — finished works read better as hero art.
    const finished = ranked.find((a) => !isSketchArtwork(a));
    return finished ?? ranked[0];
  }
  return (
    [...recent].reverse().find((a) => a.artistId === artistId && a.image) ??
    [...recent].reverse().find((a) => a.image)
  );
}

export interface InterleaveStoryOptions {
  seed: number;
  /** Active For You artist cards keyed by artist id. */
  fypArtistCardMap: Record<string, FypArtistCard>;
  /** When true (tutorial), return artwork-only items. */
  skipStories?: boolean;
  /** Freelance filter: skip historical era slides. */
  filter?: "all" | "museum" | "freelance";
}

/**
 * Walk a ranked artwork list and insert full-screen artist / era story slides
 * every 4–7 cards. Stories are tied to recent works (lookback window), seeded
 * so the mix is fresh each session but stable while scrolling.
 */
export function interleaveStorySlides(
  artworks: Artwork[],
  {
    seed,
    fypArtistCardMap,
    skipStories = false,
    filter = "all",
  }: InterleaveStoryOptions,
): FeedItem[] {
  if (artworks.length === 0) return [];
  if (skipStories) {
    return artworks.map((artwork) => ({ kind: "artwork", artwork }));
  }

  const rand = mulberry32(seed ^ 0xfeedbeef);
  const usedArtists = new Set<string>();
  const usedEras = new Set<string>();
  const out: FeedItem[] = [];
  let sinceLastStory = STORY_LEAD_IN;
  let nextGap =
    STORY_GAP_MIN +
    Math.floor(rand() * (STORY_GAP_MAX - STORY_GAP_MIN + 1));

  const pickArtist = (recent: Artwork[]): FeedItem | null => {
    for (let i = recent.length - 1; i >= 0; i--) {
      const art = recent[i];
      const card = fypArtistCardMap[art.artistId];
      if (!card?.active) continue;
      if (usedArtists.has(card.artistId)) continue;
      usedArtists.add(card.artistId);
      const backdropId =
        card.backdropArtworkId ??
        pickFamousBackdrop(card.artistId, recent, artworks)?.id ??
        art.id;
      return {
        kind: "artist-story",
        artistId: card.artistId,
        backdropArtworkId: backdropId,
      };
    }
    return null;
  };

  const pickEra = (recent: Artwork[]): FeedItem | null => {
    if (filter === "freelance") return null;
    for (let i = recent.length - 1; i >= 0; i--) {
      const art = recent[i];
      const era = eraForArtwork(art);
      if (!era || usedEras.has(era.id)) continue;
      usedEras.add(era.id);
      // Prefer a finished work from the lookback that belongs to this era.
      const eraBackdrop =
        [...recent]
          .reverse()
          .find(
            (a) =>
              eraForArtwork(a)?.id === era.id &&
              a.image &&
              !isSketchArtwork(a),
          ) ?? art;
      return {
        kind: "era-story",
        eraId: era.id,
        backdropArtworkId: eraBackdrop.id,
      };
    }
    return null;
  };

  for (let i = 0; i < artworks.length; i++) {
    const artwork = artworks[i];
    out.push({ kind: "artwork", artwork });
    sinceLastStory += 1;

    if (sinceLastStory < nextGap) continue;

    const recent = artworks.slice(Math.max(0, i - STORY_LOOKBACK + 1), i + 1);
    const wantArtist = rand() < 0.5;
    const story =
      (wantArtist ? pickArtist(recent) : pickEra(recent)) ??
      (wantArtist ? pickEra(recent) : pickArtist(recent));

    if (story) {
      out.push(story);
      sinceLastStory = 0;
      nextGap =
        STORY_GAP_MIN +
        Math.floor(rand() * (STORY_GAP_MAX - STORY_GAP_MIN + 1));
    }
  }

  return out;
}
