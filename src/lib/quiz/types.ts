/**
 * Daily Quiz — domain types.
 *
 * A quiz question is built entirely client-side from the existing artwork
 * catalog (see `pool.ts` / `generator.ts`). Nothing here is persisted except
 * `QuizProgress`, which lives in localStorage (see `progress.ts`).
 */

import type { Artwork } from "@/data";

/**
 * The three things we quiz on — where it's from, what it is, and when it was
 * made. Every daily / practice run mixes these at random.
 */
export type QuizMode = "where" | "what" | "age";

export const QUIZ_MODES: QuizMode[] = ["where", "what", "age"];

/** Human-facing labels for each mode (badge on the question card, results). */
export const MODE_LABEL: Record<QuizMode, string> = {
  where: "Where",
  what: "What",
  age: "When",
};

/** Generic fallbacks — `promptFor` names the work when metadata is available. */
export const MODE_PROMPT: Record<QuizMode, string> = {
  where: "Where is it from?",
  what: "What is it?",
  age: "When was it made?",
};

export interface QuizQuestion {
  /** Stable id so React keys and answer records line up. */
  id: string;
  mode: QuizMode;
  artworkId: string;
  /** The artwork the image + correct answer come from. */
  artwork: Artwork;
  prompt: string;
  /** Four options, already shuffled. */
  options: string[];
  correctIndex: number;
}

/** A finished daily session's outcome, plus the running streak. */
export interface QuizProgress {
  /** Consecutive days the daily quiz was completed. */
  streak: number;
  /** Local calendar day of the last completed daily quiz ("YYYY-MM-DD"). */
  lastPlayedDate: string | null;
  /** Score on the most recent daily quiz (correct answers). */
  lastDailyScore: number | null;
  /** Question count of the most recent daily quiz. */
  lastDailyTotal: number | null;
  /** Lifetime questions answered (daily + practice). */
  totalAnswered: number;
}

export const EMPTY_PROGRESS: QuizProgress = {
  streak: 0,
  lastPlayedDate: null,
  lastDailyScore: null,
  lastDailyTotal: null,
  totalAnswered: 0,
};
