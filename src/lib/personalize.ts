import type { Artwork } from "@/data";

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
  return new Set((values ?? []).map((x) => x.trim().toLowerCase()).filter(Boolean));
}

/**
 * Score one artwork against saved taste. Cheap field checks only — no extra
 * network and no sorting. Strength only changes the weights / extra keyword
 * matching, not the work we do per item.
 */
export function preferenceScore(
  art: Artwork,
  prefs: TastePrefs,
  mode: Exclude<FeedMatchMode, "normal">,
): number {
  const aggressive = mode === "aggressive";
  const selectedArtists = new Set<string>();
  for (const label of prefs.artists ?? []) {
    const id = ARTIST_ID_BY_PREFERENCE_LABEL[label];
    if (id) selectedArtists.add(id);
  }
  const selectedEmpires = lowerSet(prefs.empires);
  const selectedPeriods = lowerSet(prefs.periods);
  const selectedArtTypes = lowerSet(prefs.artTypes);
  const selectedInterests = lowerSet(prefs.interests);
  const selectedArtistLabels = lowerSet(prefs.artists);

  const periodLower = (art.period ?? "").toLowerCase();
  const empireLower = (art.empire ?? "").toLowerCase();
  const mediumLower = (art.medium ?? "").toLowerCase();
  const titleLower = (art.title ?? "").toLowerCase();
  const tagsLower = (art.tags ?? []).join(" ").toLowerCase();
  const haystack = `${periodLower} ${empireLower} ${mediumLower} ${titleLower} ${tagsLower}`;

  let score = 0;

  if (selectedArtists.has(art.artistId)) {
    score += aggressive ? 10 : 5;
  } else if (aggressive) {
    for (const label of selectedArtistLabels) {
      if (haystack.includes(label)) {
        score += 6;
        break;
      }
    }
  }

  if (empireLower && selectedEmpires.has(empireLower)) {
    score += aggressive ? 6 : 3;
  } else if (aggressive) {
    for (const empire of selectedEmpires) {
      if (haystack.includes(empire)) {
        score += 4;
        break;
      }
    }
  }

  if (selectedPeriods.size > 0) {
    for (const period of selectedPeriods) {
      if (periodLower.includes(period) || (aggressive && haystack.includes(period))) {
        score += aggressive ? 5 : 2;
        break;
      }
    }

    if (selectedPeriods.has("ancient")) {
      const isAncientHint =
        Boolean(art.empire) ||
        periodLower.includes("bc") ||
        periodLower.includes("hellenistic") ||
        periodLower.includes("egypt") ||
        periodLower.includes("greece");
      if (isAncientHint) score += aggressive ? 4 : 2;
    }
  }

  const addIf = (cond: boolean, points: number) => {
    if (cond) score += points;
  };
  const typeBoost = aggressive ? 4 : 2;
  const typeSoft = aggressive ? 2 : 1;

  addIf(selectedArtTypes.has("paintings") && art.category === "paintings", typeBoost);
  addIf(selectedArtTypes.has("sculptures") && art.category === "sculptures", typeBoost);
  addIf(selectedArtTypes.has("ceramics") && art.category === "pottery", typeBoost);
  addIf(
    selectedArtTypes.has("modern art") &&
      (art.category === "modern-art" || tagsLower.includes("modern")),
    typeBoost,
  );
  addIf(
    selectedArtTypes.has("photography") &&
      (mediumLower.includes("photo") || tagsLower.includes("photo")),
    typeBoost,
  );
  addIf(
    selectedArtTypes.has("architecture") && tagsLower.includes("architecture"),
    typeSoft,
  );
  addIf(
    selectedArtTypes.has("drawings") &&
      (art.category === "etching-writing-books" ||
        tagsLower.includes("drawing") ||
        mediumLower.includes("drawing")),
    typeSoft,
  );
  addIf(
    selectedArtTypes.has("textile art") &&
      (tagsLower.includes("textile") || mediumLower.includes("textile")),
    typeSoft,
  );

  const likeSignal = (art.likeCount ?? 0) + (art.saveCount ?? 0);
  const isForCollecting = Boolean(art.forSale) || art.origin === "artist-original";

  if (selectedInterests.has("history & context")) {
    if (
      score > 0 ||
      tagsLower.includes("perspective") ||
      tagsLower.includes("religious")
    ) {
      score += aggressive ? 2 : 1;
    }
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
 * Stable buckets keep the original order inside each score group.
 */
export function prioritizeByTaste(
  list: Artwork[],
  prefs: TastePrefs,
  mode: FeedMatchMode,
): Artwork[] {
  if (mode === "normal" || !hasTastePreferences(prefs)) return list;

  const bucketCount = mode === "aggressive" ? 9 : 5;
  const buckets: Artwork[][] = Array.from({ length: bucketCount }, () => []);
  const maxBucket = bucketCount - 1;

  for (const art of list) {
    const score = preferenceScore(art, prefs, mode);
    const bucket = Math.max(0, Math.min(maxBucket, score));
    buckets[bucket].push(art);
  }

  const ranked: Artwork[] = [];
  for (let i = maxBucket; i >= 0; i -= 1) {
    ranked.push(...buckets[i]);
  }
  return ranked;
}
