/** Public surface for the daily quiz feature. */

export type { QuizMode, QuizQuestion, QuizProgress } from "./types";
export {
  QUIZ_MODES,
  MODE_LABEL,
  MODE_PROMPT,
  EMPTY_PROGRESS,
} from "./types";
export { eligibleFor, isModePlayable, answerFor } from "./pool";
export { buildQuestion, generateQuestion } from "./generator";
export { buildDailyQuiz, todayKey, DAILY_COUNT } from "./daily";
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
