import type { Artwork, Artist } from "@/data";
import { seededShuffle } from "./feed-utils";

/** Taste fields used to rank For You. Kept here so AppState can import this file. */
export interface TastePrefs {
  artTypes: string[];
  periods: string[];
  empires: string[];
  artists: string[];
  interests: string[];
}

/** How strongly For You should prefer the user's taste. */
export type FeedMatchMode = "normal" | "strong" | "aggressive";

export const FEED_MATCH_MODES: FeedMatchMode[] = [
  "normal",
  "strong",
  "aggressive",
];

export const FEED_MATCH_COPY: Record<
  FeedMatchMode,
  { label: string; hint: string }
> = {
  normal: {
    label: "Normal",
    hint: "Popular art first — no taste boost",
  },
  strong: {
    label: "Strong",
    hint: "Boost art that matches your taste",
  },
  aggressive: {
    label: "Aggressive",
    hint: "Push matching art to the front",
  },
};

/** Mock/catalog id shortcuts for common onboarding labels. */
const ARTIST_ID_BY_PREFERENCE_LABEL: Record<string, string> = {
  "Van Gogh": "van-gogh",
  Hokusai: "hokusai",
  "Da Vinci": "da-vinci",
  Klimt: "klimt",
  Vermeer: "vermeer",
  Monet: "monet",
  Picasso: "picasso",
  Rembrandt: "rembrandt",
  Michelangelo: "michelangelo",
  "Frida Kahlo": "frida-kahlo",
};

/** Name fragments used to match live catalog artists (ids vary by source). */
const ARTIST_NAME_HINTS: Record<string, string[]> = {
  "Van Gogh": ["van gogh"],
  Hokusai: ["hokusai"],
  "Da Vinci": ["da vinci", "leonardo"],
  Klimt: ["klimt"],
  Vermeer: ["vermeer"],
  Monet: ["monet"],
  Picasso: ["picasso"],
  Rembrandt: ["rembrandt"],
  Michelangelo: ["michelangelo"],
  "Frida Kahlo": ["frida kahlo", "kahlo"],
};

/** Onboarding period label → strings we look for in period / tags / empire. */
const PERIOD_ALIASES: Record<string, string[]> = {
  ancient: ["ancient", "egypt", "greek", "roman", "hellenistic", "bc", "b.c"],
  medieval: ["medieval", "gothic", "middle ages", "byzantine"],
  renaissance: ["renaissance"],
  baroque: ["baroque"],
  impressionism: ["impression"],
  "art nouveau": ["art nouveau", "secession", "jugendstil"],
  modern: ["modern", "expression", "cubism", "abstract"],
  contemporary: ["contemporary"],
  "japanese art": ["japanese", "edo", "ukiyo", "meiji"],
};

export function hasTastePreferences(prefs: TastePrefs): boolean {
  return (
    (prefs.artTypes?.length ?? 0) +
      (prefs.periods?.length ?? 0) +
      (prefs.empires?.length ?? 0) +
      (prefs.artists?.length ?? 0) +
      (prefs.interests?.length ?? 0) >
    0
  );
}

function lowerSet(values: string[] | undefined): Set<string> {
  return new Set(
    (values ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean),
  );
}

function artistMatchesLabel(
  art: Artwork,
  label: string,
  artistMap?: Record<string, Artist>,
): boolean {
  const mappedId = ARTIST_ID_BY_PREFERENCE_LABEL[label];
  if (mappedId && art.artistId === mappedId) return true;

  const artistName = (artistMap?.[art.artistId]?.name ?? "").toLowerCase();
  const hints = ARTIST_NAME_HINTS[label] ?? [label.toLowerCase()];
  if (artistName && hints.some((hint) => artistName.includes(hint))) {
    return true;
  }

  const haystack = `${art.title ?? ""} ${(art.tags ?? []).join(" ")}`.toLowerCase();
  return hints.some((hint) => haystack.includes(hint));
}

function periodMatches(art: Artwork, periodLabel: string): boolean {
  const key = periodLabel.trim().toLowerCase();
  const aliases = PERIOD_ALIASES[key] ?? [key];
  const haystack = [
    art.period ?? "",
    art.empire ?? "",
    ...(art.tags ?? []),
  ]
    .join(" ")
    .toLowerCase();
  return aliases.some((alias) => haystack.includes(alias));
}

export interface PreferenceScoreOptions {
  artistMap?: Record<string, Artist>;
}

export interface PrioritizeByTasteOptions extends PreferenceScoreOptions {
  /**
   * Per-session seed. When set, each taste bucket is shuffled in small
   * popularity windows so the opening card is not always the same work.
   */
  seed?: number;
}

/**
 * Score one artwork against saved taste.
 * Artist is always the top signal — higher than any period/empire/type combo.
 */
export function preferenceScore(
  art: Artwork,
  prefs: TastePrefs,
  mode: Exclude<FeedMatchMode, "normal">,
  opts: PreferenceScoreOptions = {},
): number {
  const aggressive = mode === "aggressive";
  const selectedArtists = prefs.artists ?? [];
  const selectedEmpires = lowerSet(prefs.empires);
  const selectedPeriods = prefs.periods ?? [];
  const selectedArtTypes = lowerSet(prefs.artTypes);
  const selectedInterests = lowerSet(prefs.interests);

  const empireLower = (art.empire ?? "").toLowerCase();
  const mediumLower = (art.medium ?? "").toLowerCase();
  const tagsLower = (art.tags ?? []).join(" ").toLowerCase();

  let score = 0;

  // Artist — always #1. High enough that one artist match beats any stack of
  // period / empire / type / interest points alone.
  if (selectedArtists.some((label) => artistMatchesLabel(art, label, opts.artistMap))) {
    score += aggressive ? 120 : 100;
  }

  // Empire.
  if (empireLower && selectedEmpires.has(empireLower)) {
    score += aggressive ? 7 : 5;
  } else if (selectedEmpires.size > 0) {
    for (const empire of selectedEmpires) {
      if (
        tagsLower.includes(empire) ||
        (art.period ?? "").toLowerCase().includes(empire)
      ) {
        score += aggressive ? 5 : 3;
        break;
      }
    }
  }

  // Period (with aliases so "Japanese Art" hits Edo / ukiyo-e).
  for (const period of selectedPeriods) {
    if (periodMatches(art, period)) {
      score += aggressive ? 6 : 4;
      break;
    }
  }

  // Art type — softer so "Paintings" alone does not swallow the whole feed.
  const addIf = (cond: boolean, points: number) => {
    if (cond) score += points;
  };
  addIf(selectedArtTypes.has("paintings") && art.category === "paintings", aggressive ? 2 : 1);
  addIf(selectedArtTypes.has("sculptures") && art.category === "sculptures", aggressive ? 4 : 3);
  addIf(selectedArtTypes.has("ceramics") && art.category === "pottery", aggressive ? 4 : 3);
  addIf(
    selectedArtTypes.has("modern art") &&
      (art.category === "modern-art" || tagsLower.includes("modern")),
    aggressive ? 4 : 3,
  );
  addIf(
    selectedArtTypes.has("photography") &&
      (mediumLower.includes("photo") || tagsLower.includes("photo")),
    aggressive ? 4 : 3,
  );
  addIf(
    selectedArtTypes.has("architecture") && tagsLower.includes("architecture"),
    aggressive ? 3 : 2,
  );
  addIf(
    selectedArtTypes.has("drawings") &&
      (art.category === "etching-writing-books" ||
        tagsLower.includes("drawing") ||
        mediumLower.includes("drawing")),
    aggressive ? 3 : 2,
  );
  addIf(
    selectedArtTypes.has("textile art") &&
      (tagsLower.includes("textile") || mediumLower.includes("textile")),
    aggressive ? 3 : 2,
  );

  // Interests — light extras on top of real matches.
  const likeSignal = (art.likeCount ?? 0) + (art.saveCount ?? 0);
  const isForCollecting = Boolean(art.forSale) || art.origin === "artist-original";

  if (selectedInterests.has("history & context") && score > 0) {
    score += aggressive ? 2 : 1;
  }
  if (selectedInterests.has("beauty & aesthetics")) {
    if (Boolean(art.featured) || likeSignal >= 1_000_000) {
      score += aggressive ? 2 : 1;
    }
  }
  if (selectedInterests.has("technique & craft")) {
    if (
      mediumLower.includes("oil") ||
      mediumLower.includes("woodblock") ||
      mediumLower.includes("tempera") ||
      mediumLower.includes("silverpoint") ||
      mediumLower.includes("ink") ||
      mediumLower.includes("fresco")
    ) {
      score += aggressive ? 2 : 1;
    }
  }
  if (selectedInterests.has("collecting & buying") && isForCollecting) {
    score += aggressive ? 4 : 2;
  }

  return score;
}

type ScoredArt = { art: Artwork; index: number; score: number };

const ARTIST_SCORE_FLOOR = 100;
/** Rotate among the top matches rather than always opening on #1. */
const MATCH_SHUFFLE_BATCH = 8;
/** Discovery bucket can mix a wider popular window each session. */
const REST_SHUFFLE_BATCH = 20;

/** Fisher–Yates within consecutive windows so rank stays in the same tier. */
function shuffleScoredBatches(
  list: ScoredArt[],
  seed: number,
  batchSize: number,
): ScoredArt[] {
  if (list.length <= 1) return list;
  const out: ScoredArt[] = [];
  let batch = 0;
  for (let i = 0; i < list.length; i += batchSize, batch += 1) {
    const slice = list.slice(i, i + batchSize);
    out.push(...seededShuffle(slice, (seed + batch * 0x9e3779b1) | 0));
  }
  return out;
}

/**
 * Pull from buckets in a repeating pattern, skipping empty ones.
 * Keeps favorite artists visible without stacking only their works.
 */
function weaveBuckets(
  buckets: Record<"artist" | "taste" | "rest", ScoredArt[]>,
  pattern: Array<"artist" | "taste" | "rest">,
): Artwork[] {
  const cursors: Record<keyof typeof buckets, number> = {
    artist: 0,
    taste: 0,
    rest: 0,
  };
  const take = (key: keyof typeof buckets): ScoredArt | null => {
    const i = cursors[key];
    if (i >= buckets[key].length) return null;
    cursors[key] = i + 1;
    return buckets[key][i];
  };

  const out: Artwork[] = [];
  const max = Object.values(buckets).reduce((n, list) => n + list.length, 0);
  let guard = 0;
  while (out.length < max && guard < max * pattern.length + 4) {
    guard += 1;
    let took = false;
    for (const key of pattern) {
      const item = take(key);
      if (item) {
        out.push(item.art);
        took = true;
      }
    }
    if (!took) break;
  }
  return out;
}

/**
 * Reorder a popularity-ranked pool so taste is visible, but mixed.
 *
 * Strong: 1 favorite-artist work, then 1 other taste match, then 2 discoveries.
 * Aggressive: denser — 1 artist, 1 taste, 1 discovery.
 * Within each bucket, original popularity order is kept unless `opts.seed` is
 * set — then small windows shuffle so a session does not always open on the
 * same masterpiece.
 */
export function prioritizeByTaste(
  list: Artwork[],
  prefs: TastePrefs,
  mode: FeedMatchMode,
  opts: PrioritizeByTasteOptions = {},
): Artwork[] {
  if (mode === "normal" || !hasTastePreferences(prefs)) return list;

  const scored: ScoredArt[] = list.map((art, index) => ({
    art,
    index,
    score: preferenceScore(art, prefs, mode, opts),
  }));

  const tasteFloor = mode === "aggressive" ? 1 : 3;
  const artistHits: ScoredArt[] = [];
  const tasteHits: ScoredArt[] = [];
  const rest: ScoredArt[] = [];

  for (const item of scored) {
    if (item.score >= ARTIST_SCORE_FLOOR) artistHits.push(item);
    else if (item.score >= tasteFloor) tasteHits.push(item);
    else rest.push(item);
  }

  const byScoreThenIndex = (a: ScoredArt, b: ScoredArt) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  };

  artistHits.sort(byScoreThenIndex);
  tasteHits.sort(byScoreThenIndex);

  const seed = opts.seed;
  const artistBucket =
    typeof seed === "number"
      ? shuffleScoredBatches(artistHits, seed, MATCH_SHUFFLE_BATCH)
      : artistHits;
  const tasteBucket =
    typeof seed === "number"
      ? shuffleScoredBatches(tasteHits, seed ^ 0xa5a5, MATCH_SHUFFLE_BATCH)
      : tasteHits;
  const restBucket =
    typeof seed === "number"
      ? shuffleScoredBatches(rest, seed ^ 0x5a5a, REST_SHUFFLE_BATCH)
      : rest;

  const pattern: Array<"artist" | "taste" | "rest"> =
    mode === "aggressive"
      ? ["artist", "taste", "rest"]
      : ["artist", "taste", "rest", "rest"];

  return weaveBuckets(
    { artist: artistBucket, taste: tasteBucket, rest: restBucket },
    pattern,
  );
}
