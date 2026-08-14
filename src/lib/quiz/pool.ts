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

import type { Artwork } from "@/data";
import { artistMap, placeOfArtwork } from "@/data";
import type { QuizMode } from "./types";

/**
 * Cultural / geographic origin for "Where is it from?"
 * Prefer empire (Roman, Greek…), then holding-country, then artist nationality.
 */
export function whereFrom(artwork: Artwork): string {
  const empire = artwork.empire?.trim();
  if (empire) return empire;

  const country = placeOfArtwork(artwork).country?.trim();
  if (country) return country;

  const nationality = artistMap[artwork.artistId]?.nationality?.trim();
  if (nationality) {
    // "Independent · Lisbon" style freelance tags aren't a useful origin.
    if (/^independent/i.test(nationality)) return "";
    // Take the primary label before an en-dash qualifier ("Etruscan · Roman").
    return nationality.split("·")[0]?.trim() || nationality;
  }
  return "";
}

/** The correct, display-ready answer for `mode` on `artwork` (or "" if none). */
export function answerFor(artwork: Artwork, mode: QuizMode): string {
  switch (mode) {
    case "where":
      return whereFrom(artwork);
    case "what":
      return artwork.title?.trim() ?? "";
    case "age":
      // Prefer a concrete year; fall back to the art-historical period.
      return (artwork.year?.trim() || artwork.period?.trim()) ?? "";
  }
}

/** Normalized key for de-duping answers ("Mona Lisa" === "mona lisa "). */
export function answerKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Whether an artwork can host a question of this mode (image + answer present). */
export function isEligible(artwork: Artwork, mode: QuizMode): boolean {
  if (!artwork.image) return false;
  return answerFor(artwork, mode).length > 0;
}

/** Every artwork in `pool` that can host a `mode` question. */
export function eligibleFor(pool: Artwork[], mode: QuizMode): Artwork[] {
  return pool.filter((a) => isEligible(a, mode));
}

/**
 * Minimum eligible artworks before a mode is playable. We need one target plus
 * three distractors, but ask for a little headroom so questions don't feel
 * repetitive.
 */
export const MIN_POOL = 8;

/** Whether `mode` has enough material in `pool` to generate questions. */
export function isModePlayable(pool: Artwork[], mode: QuizMode): boolean {
  return eligibleFor(pool, mode).length >= MIN_POOL;
}
