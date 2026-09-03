import type { Artwork, Artist } from "@/data";

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

/**
 * Reorder a popularity-ranked pool so better matches come first.
 *
 * Strong: clear matches (score >= 3) first, then soft matches, then the rest.
 * Aggressive: any match (score >= 1) first, ordered by score.
 * Within each group, original popularity order is kept (stable).
 */
export function prioritizeByTaste(
  list: Artwork[],
  prefs: TastePrefs,
  mode: FeedMatchMode,
  opts: PreferenceScoreOptions = {},
): Artwork[] {
  if (mode === "normal" || !hasTastePreferences(prefs)) return list;

  const scored = list.map((art, index) => ({
    art,
    index,
    score: preferenceScore(art, prefs, mode, opts),
  }));

  const strongThreshold = mode === "aggressive" ? 1 : 3;

  const strong: typeof scored = [];
  const soft: typeof scored = [];
  const rest: typeof scored = [];

  for (const item of scored) {
    if (item.score >= strongThreshold) strong.push(item);
    else if (item.score > 0) soft.push(item);
    else rest.push(item);
  }

  const byScoreThenIndex = (a: (typeof scored)[number], b: (typeof scored)[number]) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.index - b.index;
  };

  strong.sort(byScoreThenIndex);
  soft.sort(byScoreThenIndex);
  // `rest` keeps original popularity order via stable index.

  return [...strong, ...soft, ...rest].map((item) => item.art);
}
