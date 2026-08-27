/** Public surface for the daily quiz feature. */

export type { QuizMode, QuizQuestion, QuizProgress } from "./types";
export {
  QUIZ_MODES,
  MODE_LABEL,
  MODE_PROMPT,
  EMPTY_PROGRESS,
} from "./types";
export {
  eligibleFor,
  isModePlayable,
  answerFor,
  whereFrom,
  artistName,
  subjectOf,
  museumOf,
} from "./pool";
export type { ArtistIndex } from "./pool";
export { promptFor, piecePhrase } from "./prompts";
export {
  buildQuestion,
  generateQuestion,
  pickRandomMode,
  playableModesFor,
} from "./generator";
export {
  buildDailyQuiz,
  todayKey,
  previousKey,
  nextKey,
  DAILY_COUNT,
} from "./daily";

/**
 * Questions a non-subscriber may answer per practice run before the paywall.
 *
 * Practice mode is the endless quiz — it already loops the pool forever
 * (`QuizOverlay.nextPractice`). Narsil Pro removes this cap; the DAILY quiz is
 * untouched and stays free at DAILY_COUNT questions, so nobody loses something
 * they already had.
 */
export const FREE_PRACTICE_QUESTIONS = 5;
export { mulberry32, hashString } from "./random";
export type { Rng } from "./random";
export {
  useQuizProgress,
  effectiveStreak,
  hasPlayedToday,
  loadProgress,
  isMilestone,
  MILESTONES,
  resetQuizData,
} from "./progress";
export type { ApplyDailyInput } from "./progress";
export {
  scoreDaily,
  scoreCorrectAnswer,
  levelFromPoints,
  levelTitle,
  nextThreshold,
  thresholdFor,
  LEVEL_THRESHOLDS,
  LEVEL_TITLES,
  BASE_POINTS,
  MISS_DAY_PENALTY,
} from "./levels";
export type {
  DailyPointsBreakdown,
  AnswerPoints,
  LevelId,
} from "./levels";
export { useQuizPool } from "./usePool";
export { getQuizInstallId, quizSalt } from "./install";
export type { DailySession } from "./session";
export {
  loadDailySession,
  saveDailySession,
  clearDailySession,
  newDailySession,
  firstUnanswered,
  sessionCorrectness,
  sessionScore,
} from "./session";
