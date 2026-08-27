/**
 * Question generation.
 *
 * Given a target artwork and a pool to draw distractors from, build a
 * four-option multiple-choice question. Distractors are de-duped against the
 * correct answer and each other. The prompt is written for *this* piece
 * (`promptFor`) so it never falls back to a generic "What is it?".
 */

import type { Artwork } from "@/data";
import type { QuizMode, QuizQuestion } from "./types";
import { QUIZ_MODES, QUIZ_OPTION_COUNT } from "./types";
import {
  answerFor,
  answerKey,
  eligibleFor,
  isModePlayable,
  type ArtistIndex,
} from "./pool";
import { promptFor } from "./prompts";
import type { Rng } from "./random";
import { shuffle } from "./random";

/** Long museum titles overflow the mobile buttons — cap them with an ellipsis. */
function trimOption(value: string, max = 60): string {
  const clean = value.trim().replace(/\s+/g, " ");
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/**
 * Parse a display year into a number for nearby-distractor ranking.
 * Returns null when the string is too messy to compare (mixed BC + later
 * additions, century-only labels without a year).
 */
function parseYear(value: string): number | null {
  const nums = [...value.matchAll(/\d{3,4}/g)].map((m) => Number(m[0]));
  if (nums.length === 0) return null;
  const bc = /\bbc\b/i.test(value);
  if (bc && nums.length > 1 && nums.some((n) => n > 500)) return null;
  const n = nums[0]!;
  return bc ? -n : n;
}

/** Candidate distractor values for a mode, excluding the correct answer. */
function distractorValues(
  mode: QuizMode,
  correct: string,
  target: Artwork,
  pool: Artwork[],
  rng: Rng,
  artists?: ArtistIndex,
): string[] {
  const correctK = answerKey(correct);
  const seen = new Set<string>([correctK]);
  const values: string[] = [];

  const consider = (raw: string) => {
    const value = raw.trim();
    if (!value) return;
    const key = answerKey(value);
    if (seen.has(key)) return;
    seen.add(key);
    values.push(value);
  };

  for (const art of pool) {
    if (art.id === target.id) continue;
    consider(answerFor(art, mode, artists));
  }

  if (mode === "age") {
    const cy = parseYear(correct);
    if (cy != null) {
      return [...values].sort((a, b) => {
        const da = Math.abs((parseYear(a) ?? 1e9) - cy);
        const db = Math.abs((parseYear(b) ?? 1e9) - cy);
        return da - db;
      });
    }
  }

  return shuffle(values, rng);
}

/**
 * Build one question for `target`. Returns null when there aren't three
 * distinct distractors available (caller should skip and try another target).
 */
export function buildQuestion(
  mode: QuizMode,
  target: Artwork,
  pool: Artwork[],
  rng: Rng,
  artists?: ArtistIndex,
): QuizQuestion | null {
  const correct = answerFor(target, mode, artists);
  if (!correct) return null;

  const distractors = distractorValues(
    mode,
    correct,
    target,
    pool,
    rng,
    artists,
  ).slice(0, QUIZ_OPTION_COUNT - 1);
  if (distractors.length < QUIZ_OPTION_COUNT - 1) return null;

  const options = shuffle(
    [correct, ...distractors].map((v) => trimOption(v)),
    rng,
  );
  const correctIndex = options.indexOf(trimOption(correct));
  if (correctIndex < 0) return null;

  return {
    id: `${target.id}:${mode}`,
    mode,
    artworkId: target.id,
    artwork: target,
    prompt: promptFor(mode, target, rng, artists),
    options,
    correctIndex,
  };
}

/** Playable modes for `pool`, in QUIZ_MODES order. */
export function playableModesFor(
  pool: Artwork[],
  artists?: ArtistIndex,
): QuizMode[] {
  return QUIZ_MODES.filter((m) => isModePlayable(pool, m, artists));
}

/** Pick a random playable mode (uniform). Falls back to any QUIZ_MODE. */
export function pickRandomMode(
  pool: Artwork[],
  rng: Rng,
  artists?: ArtistIndex,
): QuizMode {
  const playable = playableModesFor(pool, artists);
  const modes = playable.length > 0 ? playable : QUIZ_MODES;
  return modes[Math.floor(rng() * modes.length)]!;
}

/**
 * One random question with a randomly chosen mode, avoiding artworks in
 * `excludeIds`. Returns null if the pool is exhausted.
 */
export function generateQuestion(
  pool: Artwork[],
  rng: Rng,
  excludeIds: Set<string> = new Set(),
  mode?: QuizMode,
  artists?: ArtistIndex,
): QuizQuestion | null {
  const chosen = mode ?? pickRandomMode(pool, rng, artists);
  const candidates = shuffle(
    eligibleFor(pool, chosen, artists).filter((a) => !excludeIds.has(a.id)),
    rng,
  );
  for (const target of candidates) {
    const question = buildQuestion(chosen, target, pool, rng, artists);
    if (question) return question;
  }

  // If a forced mode failed, try the remaining playable modes so mixed practice
  // doesn't stall when one mode runs short of unused artworks.
  if (mode) return null;
  for (const fallback of shuffle(
    QUIZ_MODES.filter((m) => m !== chosen),
    rng,
  )) {
    const more = shuffle(
      eligibleFor(pool, fallback, artists).filter((a) => !excludeIds.has(a.id)),
      rng,
    );
    for (const target of more) {
      const question = buildQuestion(fallback, target, pool, rng, artists);
      if (question) return question;
    }
  }
  return null;
}
