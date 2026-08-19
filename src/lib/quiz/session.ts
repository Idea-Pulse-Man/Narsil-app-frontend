/**
 * The in-flight daily session, persisted to localStorage.
 *
 * Why persist mid-quiz? The daily quiz is deterministic per day, so without a
 * saved session a user could start it, read the questions, back out, and
 * restart with the answers already known. Freezing the session on start and
 * recording each answer as it happens closes that hole: an exit *resumes*
 * instead of restarting, and a completed session powers a real "Review".
 *
 * The whole `QuizQuestion` (artwork included — all plain, serializable data) is
 * stored so review and resume render exactly what was played, even if the live
 * catalog shifts underneath during the day.
 */

import { STORAGE_KEYS, readJSON, writeJSON } from "@/lib/storage";
import type { QuizQuestion } from "./types";
import { todayKey } from "./daily";

export interface DailySession {
  /** Local calendar day this session belongs to ("YYYY-MM-DD"). */
  date: string;
  /** The frozen questions for the day. */
  questions: QuizQuestion[];
  /** Chosen option per question (null = not yet answered). Answered in order. */
  answers: (number | null)[];
  /**
   * Milliseconds from question show → answer, aligned with `answers`.
   * Null when unanswered (or legacy sessions without timing).
   */
  answerMs: (number | null)[];
  completed: boolean;
}

/** Load today's session, or null if there's none (or it's from a past day). */
export function loadDailySession(): DailySession | null {
  const stored = readJSON<DailySession | null>(STORAGE_KEYS.quizDaily, null);
  if (!stored || stored.date !== todayKey()) return null;
  // Legacy sessions (pre-timing) get empty answerMs so scoring still runs.
  if (!stored.answerMs || stored.answerMs.length !== stored.questions.length) {
    return {
      ...stored,
      answerMs: stored.questions.map((_, i) =>
        stored.answers[i] != null ? 10_000 : null,
      ),
    };
  }
  return stored;
}

export function saveDailySession(session: DailySession): void {
  writeJSON(STORAGE_KEYS.quizDaily, session);
}

/** Forget today's frozen session (used when resetting quiz data). */
export function clearDailySession(): void {
  writeJSON<DailySession | null>(STORAGE_KEYS.quizDaily, null);
}

/** Fresh session for `questions`, all answers empty. */
export function newDailySession(questions: QuizQuestion[]): DailySession {
  return {
    date: todayKey(),
    questions,
    answers: questions.map(() => null),
    answerMs: questions.map(() => null),
    completed: false,
  };
}

/** Index of the first unanswered question (= count answered, answered in order). */
export function firstUnanswered(session: DailySession): number {
  const i = session.answers.findIndex((a) => a === null);
  return i === -1 ? session.questions.length : i;
}

/** Per-question correctness, index-aligned with `questions`. */
export function sessionCorrectness(session: DailySession): boolean[] {
  return session.questions.map(
    (q, i) => session.answers[i] === q.correctIndex,
  );
}

/** Correct-answer count. */
export function sessionScore(session: DailySession): number {
  return sessionCorrectness(session).filter(Boolean).length;
}
