/**
 * Question generation.
 *
 * Given a target artwork and a pool to draw distractors from, build a
 * four-option multiple-choice question. Distractors are de-duped against the
 * correct answer and each other; `type` questions draw their distractors from
 * the fixed category label list so they never run short.
 */

import type { Artwork } from "@/data";
import { categories } from "@/data";
import type { QuizMode, QuizQuestion } from "./types";
import { MODE_PROMPT } from "./types";
import { answerFor, answerKey, eligibleFor } from "./pool";
import type { Rng } from "./random";
import { shuffle } from "./random";

const OPTION_COUNT = 4;

/** Long museum titles overflow the mobile buttons — cap them with an ellipsis. */
function trimOption(value: string, max = 60): string {
  const clean = value.trim().replace(/\s+/g, " ");
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

/** Candidate distractor values for a mode, excluding the correct answer. */
function distractorValues(
  mode: QuizMode,
  correct: string,
  target: Artwork,
  pool: Artwork[],
  rng: Rng,
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

  if (mode === "type") {
    // Fixed set of category labels — always yields three plausible wrong types.
    for (const c of categories) consider(c.label);
  } else {
    for (const art of pool) {
      if (art.id === target.id) continue;
      consider(answerFor(art, mode));
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
): QuizQuestion | null {
  const correct = answerFor(target, mode);
  if (!correct) return null;

  const distractors = distractorValues(mode, correct, target, pool, rng).slice(
    0,
    OPTION_COUNT - 1,
  );
  if (distractors.length < OPTION_COUNT - 1) return null;

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
    prompt: MODE_PROMPT[mode],
    options,
    correctIndex,
  };
}

/**
 * One random practice question of `mode`, avoiding artworks in `excludeIds`.
 * Returns null if the pool is exhausted.
 */
export function generateQuestion(
  mode: QuizMode,
  pool: Artwork[],
  rng: Rng,
  excludeIds: Set<string> = new Set(),
): QuizQuestion | null {
  const candidates = shuffle(
    eligibleFor(pool, mode).filter((a) => !excludeIds.has(a.id)),
    rng,
  );
  for (const target of candidates) {
    const question = buildQuestion(mode, target, pool, rng);
    if (question) return question;
  }
  return null;
}
