/**
 * The daily quiz.
 *
 * Seven questions in a fixed category rotation (2 name · 2 type · 2 age · 1
 * bonus), selected deterministically from the day's date seed so it reads as a
 * shared "daily challenge". The pool can still grow as the backend loads —
 * we accept that the exact works may shift during that window; once the catalog
 * is settled the quiz is stable for the rest of the day.
 */

import type { Artwork } from "@/data";
import type { QuizMode, QuizQuestion } from "./types";
import { buildQuestion } from "./generator";
import { eligibleFor } from "./pool";
import { hashString, mulberry32, shuffle } from "./random";

export const DAILY_COUNT = 7;

/** Fixed rotation of modes for the daily set (the 7th is a mixed bonus). */
const DAILY_ROTATION: (QuizMode | "mixed")[] = [
  "name",
  "type",
  "age",
  "name",
  "type",
  "age",
  "mixed",
];

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

/**
 * Build today's (or any day's) quiz. Walks the rotation, drawing each question
 * from a seeded shuffle of the eligible pool, never reusing an artwork. Returns
 * as many questions as the pool supports (up to DAILY_COUNT).
 *
 * `salt` personalizes the seed (e.g. a per-install id) so different users get
 * different daily sets from the same catalog. Omit it for the classic
 * everyone-sees-the-same daily.
 */
export function buildDailyQuiz(
  pool: Artwork[],
  key: string,
  count = DAILY_COUNT,
  salt = "",
): QuizQuestion[] {
  const seed = hashString(salt ? `${salt}:${key}` : key);
  const rng = mulberry32(seed);
  const used = new Set<string>();
  const questions: QuizQuestion[] = [];

  for (let slot = 0; slot < count; slot++) {
    const planned = DAILY_ROTATION[slot % DAILY_ROTATION.length];
    const mode: QuizMode =
      planned === "mixed"
        ? (["name", "type", "age"] as QuizMode[])[Math.floor(rng() * 3)]
        : planned;

    // Fresh seeded shuffle per slot so the ordering is stable but varied.
    const candidates = shuffle(eligibleFor(pool, mode), mulberry32(seed + slot));
    let built: QuizQuestion | null = null;
    for (const target of candidates) {
      if (used.has(target.id)) continue;
      built = buildQuestion(mode, target, pool, rng);
      if (built) {
        used.add(target.id);
        break;
      }
    }
    if (built) questions.push({ ...built, id: `daily:${key}:${slot}` });
  }

  return questions;
}
