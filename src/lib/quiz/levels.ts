/**
 * Competition score + lasting levels for the Royal Assessment.
 *
 * Level is driven only by total points. Rankings are same-level display;
 * place on the board never promotes or demotes.
 */

export const BASE_POINTS = 50;
export const PERFECT_DAILY_BONUS = 50;
export const MISS_DAY_PENALTY = 100;
/** Soft cap per correct answer (base + time + continue). */
export const PER_ANSWER_CAP = 120;

/** Cumulative thresholds: 1000 × 3^(n-1) for n ≥ 1. */
export const LEVEL_THRESHOLDS = [0, 1000, 3000, 9000, 27000] as const;

export const LEVEL_TITLES = [
  "Peasant",
  "Scholar",
  "Archivist",
  "Master Archivist",
  "Grand Archivist",
] as const;

export type LevelId = 0 | 1 | 2 | 3 | 4;

export interface AnswerPoints {
  base: number;
  time: number;
  continue: number;
  total: number;
}

export interface DailyPointsBreakdown {
  base: number;
  time: number;
  continue: number;
  perfectBonus: number;
  total: number;
  correctCount: number;
  totalQuestions: number;
}

/** Time-to-answer → bonus (correct answers only). */
export function timeBonusMs(elapsedMs: number): number {
  if (elapsedMs <= 3000) return 40;
  if (elapsedMs <= 5000) return 25;
  if (elapsedMs <= 8000) return 10;
  return 0;
}

/**
 * Continue (streak) bonus after this correct answer.
 * streakAfter = number of correct in a row including this one.
 */
export function continueBonus(streakAfter: number): number {
  if (streakAfter <= 1) return 0;
  if (streakAfter === 2) return 10;
  if (streakAfter === 3) return 20;
  if (streakAfter === 4) return 30;
  return 40;
}

/** Score one correct answer. Wrong answers are 0 (caller skips this). */
export function scoreCorrectAnswer(
  elapsedMs: number,
  streakAfter: number,
): AnswerPoints {
  const base = BASE_POINTS;
  const time = timeBonusMs(elapsedMs);
  const cont = continueBonus(streakAfter);
  const raw = base + time + cont;
  const total = Math.min(PER_ANSWER_CAP, raw);
  // Prefer keeping base; trim continue then time if over cap (rare).
  let t = time;
  let c = cont;
  if (raw > PER_ANSWER_CAP) {
    const over = raw - PER_ANSWER_CAP;
    const cutC = Math.min(c, over);
    c -= cutC;
    const still = over - cutC;
    t = Math.max(0, t - still);
  }
  return { base, time: t, continue: c, total };
}

/** Aggregate a finished daily from per-question correctness + answer times. */
export function scoreDaily(answers: {
  correct: boolean;
  elapsedMs: number;
}[]): DailyPointsBreakdown {
  let base = 0;
  let time = 0;
  let cont = 0;
  let streak = 0;
  let correctCount = 0;

  for (const a of answers) {
    if (!a.correct) {
      streak = 0;
      continue;
    }
    streak += 1;
    correctCount += 1;
    const pts = scoreCorrectAnswer(a.elapsedMs, streak);
    base += pts.base;
    time += pts.time;
    cont += pts.continue;
  }

  const perfectBonus =
    correctCount === answers.length && answers.length > 0
      ? PERFECT_DAILY_BONUS
      : 0;

  return {
    base,
    time,
    continue: cont,
    perfectBonus,
    total: base + time + cont + perfectBonus,
    correctCount,
    totalQuestions: answers.length,
  };
}

export function levelFromPoints(totalPoints: number): LevelId {
  const pts = Math.max(0, totalPoints);
  let level: LevelId = 0;
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (pts >= LEVEL_THRESHOLDS[i]) {
      level = i as LevelId;
      break;
    }
  }
  return level;
}

export function levelTitle(levelId: number): string {
  return LEVEL_TITLES[levelId] ?? LEVEL_TITLES[0];
}

/** Points required to enter this level (0 for Peasant). */
export function thresholdFor(levelId: number): number {
  return LEVEL_THRESHOLDS[levelId] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];
}

/** Next tier threshold, or null at the top. */
export function nextThreshold(levelId: number): number | null {
  if (levelId >= LEVEL_THRESHOLDS.length - 1) return null;
  return LEVEL_THRESHOLDS[levelId + 1];
}

export function clampPoints(n: number): number {
  return Math.max(0, Math.floor(n));
}
