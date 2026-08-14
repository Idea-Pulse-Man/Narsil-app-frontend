/**
 * Question generation.
 *
 * Given a target artwork and a pool to draw distractors from, build a
 * four-option multiple-choice question. Distractors are de-duped against the
 * correct answer and each other.
 */

import type { Artwork } from "@/data";
import type { QuizMode, QuizQuestion } from "./types";
import { MODE_PROMPT, QUIZ_MODES } from "./types";
import { answerFor, answerKey, eligibleFor, isModePlayable } from "./pool";
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

  for (const art of pool) {
    if (art.id === target.id) continue;
    consider(answerFor(art, mode));
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

/** Playable modes for `pool`, in QUIZ_MODES order. */
export function playableModesFor(pool: Artwork[]): QuizMode[] {
  return QUIZ_MODES.filter((m) => isModePlayable(pool, m));
}

/** Pick a random playable mode (uniform). Falls back to any QUIZ_MODE. */
export function pickRandomMode(pool: Artwork[], rng: Rng): QuizMode {
  const playable = playableModesFor(pool);
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
): QuizQuestion | null {
  const chosen = mode ?? pickRandomMode(pool, rng);
  const candidates = shuffle(
    eligibleFor(pool, chosen).filter((a) => !excludeIds.has(a.id)),
    rng,
  );
  for (const target of candidates) {
    const question = buildQuestion(chosen, target, pool, rng);
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
      eligibleFor(pool, fallback).filter((a) => !excludeIds.has(a.id)),
      rng,
    );
    for (const target of more) {
      const question = buildQuestion(fallback, target, pool, rng);
      if (question) return question;
    }
  }
  return null;
}
