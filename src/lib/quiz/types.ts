/**
 * Daily Quiz — domain types.
 *
 * A quiz question is built entirely client-side from the existing artwork
 * catalog (see `pool.ts` / `generator.ts` / `prompts.ts`). Nothing here is
 * persisted except `QuizProgress`, which lives in localStorage (see
 * `progress.ts`).
 */

import type { Artwork } from "@/data";
import type { QuizItem } from "./engine/types";

/**
 * What a question asks about. `where` / `what` / `age` keep their original
 * ids so in-flight daily sessions from the previous three-mode quiz still
 * resume. Newer modes add artist, medium, period, collection, and subject.
 */
export type QuizMode =
  | "where"
  | "what"
  | "age"
  | "who"
  | "medium"
  | "period"
  | "museum"
  | "subject";

export const QUIZ_MODES: QuizMode[] = [
  "what",
  "who",
  "age",
  "where",
  "medium",
  "period",
  "museum",
  "subject",
];

export const QUIZ_OPTION_COUNT = 4;

/** Human-facing labels for each mode (badge on the question card, results). */
export const MODE_LABEL: Record<QuizMode, string> = {
  where: "Origin",
  what: "Title",
  age: "Date",
  who: "Artist",
  medium: "Medium",
  period: "Period",
  museum: "Collection",
  subject: "Subject",
};

/**
 * Fallback prompts when a piece has too little metadata to name. Real
 * questions use `promptFor()` so the copy is about that artwork.
 */
export const MODE_PROMPT: Record<QuizMode, string> = {
  where: "Where is this work from?",
  what: "What is this work titled?",
  age: "When was this work made?",
  who: "Who created this work?",
  medium: "What medium is this?",
  period: "Which period does this belong to?",
  museum: "Where is this work held?",
  subject: "What kind of scene is this?",
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
  /**
   * Set for questions from the question engine (any style beyond the classic
   * four-option card). Those render via `EngineQuestion`; `options` is empty,
   * `correctIndex` is 0 and the recorded answer is 0 (right) or -1 (wrong).
   */
  item?: QuizItem;
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
  /** Competition points (level is derived from this only). */
  totalPoints: number;
  /** Lasting ladder tier 0–6 (Peasant → Royal Archivist; display levels 1–7). */
  levelId: number;
  /** Points earned on the most recent daily (base+time+continue). */
  lastDailyPoints: number | null;
  /**
   * Last calendar day we've already charged miss penalties through
   * ("YYYY-MM-DD"). Prevents double-charging on every app open.
   */
  absenceAppliedThrough: string | null;
}

export const EMPTY_PROGRESS: QuizProgress = {
  streak: 0,
  lastPlayedDate: null,
  lastDailyScore: null,
  lastDailyTotal: null,
  totalAnswered: 0,
  totalPoints: 0,
  levelId: 0,
  lastDailyPoints: null,
  absenceAppliedThrough: null,
};
