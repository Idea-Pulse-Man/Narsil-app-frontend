/**
 * The daily quiz.
 *
 * Seven questions with a randomized mix of playable modes (title, artist,
 * date, origin, medium, period, collection, subject), selected
 * deterministically from the day's date seed so it reads as a shared "daily
 * challenge". The pool can still grow as the backend loads — we accept that
 * the exact works may shift during that window; once the catalog is settled
 * the quiz is stable for the rest of the day.
 */

import type { Artwork } from "@/data";
import type { QuizQuestion } from "./types";
import { buildQuestion, pickRandomMode } from "./generator";
import { eligibleFor, type ArtistIndex } from "./pool";
import { hashString, mulberry32, shuffle } from "./random";

export const DAILY_COUNT = 7;

/** Local calendar day as "YYYY-MM-DD". */
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Today's local calendar day. */
export function todayKey(): string {
  return dateKey(new Date());
}

/** The local calendar day before `key`. */
export function previousKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}

/** The local calendar day after `key`. */
export function nextKey(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + 1);
  return dateKey(date);
}

/** Inclusive count of calendar days from `from` to `to` (0 if from > to). */
export function daysInclusive(from: string, to: string): number {
  if (from > to) return 0;
  const [y1, m1, d1] = from.split("-").map(Number);
  const [y2, m2, d2] = to.split("-").map(Number);
  const a = Date.UTC(y1, m1 - 1, d1);
  const b = Date.UTC(y2, m2 - 1, d2);
  return Math.floor((b - a) / 86_400_000) + 1;
}

/**
 * Build today's (or any day's) quiz. Each slot draws a random playable mode
 * and a seeded shuffle of eligible artworks, never reusing a work. Returns as
 * many questions as the pool supports (up to DAILY_COUNT).
 *
 * `salt` personalizes the seed (e.g. a per-install id) so different users get
 * different daily sets from the same catalog. Omit it for the classic
 * everyone-sees-the-same daily.
 *
 * `artists` is the live catalog artist index so "who" / origin prompts
 * resolve names for museum works, not only the curated mock set.
 */
export function buildDailyQuiz(
  pool: Artwork[],
  key: string,
  count = DAILY_COUNT,
  salt = "",
  artists?: ArtistIndex,
): QuizQuestion[] {
  const seed = hashString(salt ? `${salt}:${key}` : key);
  const rng = mulberry32(seed);
  const used = new Set<string>();
  const questions: QuizQuestion[] = [];

  for (let slot = 0; slot < count; slot++) {
    const mode = pickRandomMode(pool, rng, artists);

    // Fresh seeded shuffle per slot so the ordering is stable but varied.
    const candidates = shuffle(
      eligibleFor(pool, mode, artists),
      mulberry32(seed + slot),
    );
    let built: QuizQuestion | null = null;
    for (const target of candidates) {
      if (used.has(target.id)) continue;
      built = buildQuestion(mode, target, pool, rng, artists);
      if (built) {
        used.add(target.id);
        break;
      }
    }
    if (built) questions.push({ ...built, id: `daily:${key}:${slot}` });
  }

  return questions;
}
