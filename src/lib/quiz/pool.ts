/**
 * Turning the catalog into a quiz pool.
 *
 * Two jobs live here:
 *  1. `answerFor` / `answerKey` — how each mode reads its answer off an artwork.
 *  2. `eligibleFor` — which artworks can *host* a question of a given mode.
 *
 * The catalog's live `artworks` list is empty until the backend responds, so
 * callers should merge the curated mock set in first (see `useQuizPool`) — that
 * keeps the quiz working instantly and offline.
 */

import type { Artist, Artwork } from "@/data";
import { artistMap as fallbackArtists, placeOfArtwork } from "@/data";
import { isGenericMakerName } from "@/lib/feed-utils";
import type { QuizMode } from "./types";
import { QUIZ_OPTION_COUNT } from "./types";

export type ArtistIndex = Record<string, Artist>;

const SUBJECTS = [
  "portrait",
  "self-portrait",
  "landscape",
  "cityscape",
  "seascape",
  "still life",
  "religious",
  "mythological",
  "mythology",
  "interior",
  "allegory",
  "marine",
  "floral",
  "abstract",
  "domestic",
  "night",
  "funerary",
  "geometric",
  "nude",
  "battle",
];

function artistsOf(artists?: ArtistIndex): ArtistIndex {
  return artists ?? fallbackArtists;
}

/** Drop empty / placeholder catalog values ("—", "Unknown"). */
function usable(value: string | undefined | null): string {
  const v = value?.trim() ?? "";
  if (!v || v === "—" || /^unknown$/i.test(v)) return "";
  return v;
}

export function artistOf(
  artwork: Artwork,
  artists?: ArtistIndex,
): Artist | undefined {
  return artistsOf(artists)[artwork.artistId];
}

export function artistName(artwork: Artwork, artists?: ArtistIndex): string {
  const name = usable(artistOf(artwork, artists)?.name);
  if (!name || isGenericMakerName(name)) return "";
  return name;
}

/** Scene / subject tag used for "subject" questions (Portrait, Landscape…). */
export function subjectOf(artwork: Artwork): string {
  const hit = artwork.tags.find((t) =>
    SUBJECTS.includes(t.trim().toLowerCase()),
  );
  return hit?.trim() ?? "";
}

/**
 * Holding collection for "Where is this held?" Skip Narsil originals — they
 * are not a public museum a player could reasonably name.
 */
export function museumOf(artwork: Artwork): string {
  const place = placeOfArtwork(artwork);
  const museum = usable(place.museum);
  if (!museum || /^narsil/i.test(museum)) return "";
  return museum;
}

/**
 * Cultural / geographic origin.
 * Prefer empire (Roman, Greek…), then holding-country, then artist nationality.
 */
export function whereFrom(artwork: Artwork, artists?: ArtistIndex): string {
  const empire = usable(artwork.empire);
  if (empire) return empire;

  const country = usable(placeOfArtwork(artwork).country);
  if (country) return country;

  const nationality = usable(artistOf(artwork, artists)?.nationality);
  if (nationality) {
    // "Independent · Lisbon" style freelance tags aren't a useful origin.
    if (/^independent/i.test(nationality)) return "";
    // Take the primary label before an en-dash qualifier ("Etruscan · Roman").
    return nationality.split("·")[0]?.trim() || nationality;
  }
  return "";
}

/** The correct, display-ready answer for `mode` on `artwork` (or "" if none). */
export function answerFor(
  artwork: Artwork,
  mode: QuizMode,
  artists?: ArtistIndex,
): string {
  switch (mode) {
    case "where":
      return whereFrom(artwork, artists);
    case "what":
      return usable(artwork.title);
    case "age":
      // Year only — period is its own mode so options stay the same kind.
      return /\d/.test(artwork.year ?? "") ? usable(artwork.year) : "";
    case "who":
      return artistName(artwork, artists);
    case "medium":
      return usable(artwork.medium);
    case "period":
      return usable(artwork.period);
    case "museum":
      return museumOf(artwork);
    case "subject":
      return subjectOf(artwork);
  }
}

/** Normalized key for de-duping answers ("Mona Lisa" === "mona lisa "). */
export function answerKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Whether an artwork can host a question of this mode (image + answer present). */
export function isEligible(
  artwork: Artwork,
  mode: QuizMode,
  artists?: ArtistIndex,
): boolean {
  if (!artwork.image) return false;
  return answerFor(artwork, mode, artists).length > 0;
}

/** Every artwork in `pool` that can host a `mode` question. */
export function eligibleFor(
  pool: Artwork[],
  mode: QuizMode,
  artists?: ArtistIndex,
): Artwork[] {
  return pool.filter((a) => isEligible(a, mode, artists));
}

/**
 * Minimum eligible artworks before a mode is playable. We need one target plus
 * three distinct answers, with a little headroom so questions don't feel
 * repetitive.
 */
export const MIN_POOL = 8;

/** Whether `mode` has enough material in `pool` to generate questions. */
export function isModePlayable(
  pool: Artwork[],
  mode: QuizMode,
  artists?: ArtistIndex,
): boolean {
  const eligible = eligibleFor(pool, mode, artists);
  if (eligible.length < MIN_POOL) return false;
  const keys = new Set(
    eligible.map((a) => answerKey(answerFor(a, mode, artists))),
  );
  return keys.size >= QUIZ_OPTION_COUNT;
}
