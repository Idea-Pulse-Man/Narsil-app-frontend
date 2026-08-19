/**
 * Quiz progress — streak, competition points, and lasting level.
 *
 * LocalStorage is instant; signed-in users also sync via quizRemote / RPCs.
 * Level is derived only from totalPoints (missed days subtract points).
 */

import { useCallback, useEffect, useState } from "react";
import { STORAGE_KEYS, readJSON, writeJSON } from "@/lib/storage";
import {
  fetchQuizProgress,
  upsertQuizProgress,
  tickQuizAbsenceRemote,
} from "@/lib/quizRemote";
import type { QuizProgress } from "./types";
import { EMPTY_PROGRESS } from "./types";
import {
  daysInclusive,
  nextKey,
  previousKey,
  todayKey,
} from "./daily";
import { clearDailySession } from "./session";
import {
  MISS_DAY_PENALTY,
  clampPoints,
  levelFromPoints,
  type DailyPointsBreakdown,
} from "./levels";

/** Streak lengths worth celebrating. */
export const MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

export function isMilestone(streak: number): boolean {
  return MILESTONES.includes(streak);
}

/** Normalize older localStorage shapes that predate points/level. */
function normalizeProgress(raw: Partial<QuizProgress> | null): QuizProgress {
  const base = { ...EMPTY_PROGRESS, ...(raw ?? {}) };
  const totalPoints = clampPoints(base.totalPoints ?? 0);
  return {
    streak: base.streak ?? 0,
    lastPlayedDate: base.lastPlayedDate ?? null,
    lastDailyScore: base.lastDailyScore ?? null,
    lastDailyTotal: base.lastDailyTotal ?? null,
    totalAnswered: base.totalAnswered ?? 0,
    totalPoints,
    levelId: levelFromPoints(totalPoints),
    lastDailyPoints: base.lastDailyPoints ?? null,
    absenceAppliedThrough: base.absenceAppliedThrough ?? null,
  };
}

export function loadProgress(): QuizProgress {
  return normalizeProgress(
    readJSON<Partial<QuizProgress>>(STORAGE_KEYS.quizProgress, EMPTY_PROGRESS),
  );
}

function saveProgress(progress: QuizProgress): void {
  writeJSON(STORAGE_KEYS.quizProgress, progress);
}

/**
 * Wipe all quiz progress — streak, last score, lifetime total — plus today's
 * frozen session, locally and (if signed in) in the cloud.
 */
export async function resetQuizData(): Promise<void> {
  saveProgress(EMPTY_PROGRESS);
  clearDailySession();
  await upsertQuizProgress(EMPTY_PROGRESS);
}

export function hasPlayedToday(progress: QuizProgress): boolean {
  return progress.lastPlayedDate === todayKey();
}

export function effectiveStreak(progress: QuizProgress): number {
  const today = todayKey();
  if (
    progress.lastPlayedDate === today ||
    progress.lastPlayedDate === previousKey(today)
  ) {
    return progress.streak;
  }
  return 0;
}

/**
 * Charge −100 per missed calendar day since last play (through yesterday).
 * Idempotent via absenceAppliedThrough.
 */
export function applyAbsencePenalty(progress: QuizProgress): {
  progress: QuizProgress;
  missedDays: number;
  leveledDown: boolean;
} {
  const today = todayKey();
  const yesterday = previousKey(today);
  if (!progress.lastPlayedDate) {
    return { progress, missedDays: 0, leveledDown: false };
  }

  const firstMiss = nextKey(progress.lastPlayedDate);
  let from = firstMiss;
  if (
    progress.absenceAppliedThrough &&
    nextKey(progress.absenceAppliedThrough) > from
  ) {
    from = nextKey(progress.absenceAppliedThrough);
  }

  const missedDays = daysInclusive(from, yesterday);
  if (missedDays <= 0) {
    return { progress, missedDays: 0, leveledDown: false };
  }

  const prevLevel = progress.levelId;
  const totalPoints = clampPoints(
    progress.totalPoints - missedDays * MISS_DAY_PENALTY,
  );
  const levelId = levelFromPoints(totalPoints);
  return {
    progress: {
      ...progress,
      totalPoints,
      levelId,
      absenceAppliedThrough: yesterday,
    },
    missedDays,
    leveledDown: levelId < prevLevel,
  };
}

export interface ApplyDailyInput {
  correctCount: number;
  total: number;
  points: number;
  breakdown?: DailyPointsBreakdown;
}

/** Apply a completed daily result (streak + points + level). */
export function applyDailyResult(
  progress: QuizProgress,
  input: ApplyDailyInput,
): { progress: QuizProgress; leveledUp: boolean; leveledDown: boolean } {
  const today = todayKey();
  const { correctCount, total, points } = input;
  const prevLevel = progress.levelId;

  // Same-day replay: replace today's contribution instead of stacking.
  if (progress.lastPlayedDate === today) {
    const priorDaily = progress.lastDailyPoints ?? 0;
    const totalPoints = clampPoints(
      progress.totalPoints - priorDaily + points,
    );
    const levelId = levelFromPoints(totalPoints);
    const next: QuizProgress = {
      ...progress,
      lastDailyScore: correctCount,
      lastDailyTotal: total,
      lastDailyPoints: points,
      totalPoints,
      levelId,
      absenceAppliedThrough: today,
    };
    return {
      progress: next,
      leveledUp: levelId > prevLevel,
      leveledDown: levelId < prevLevel,
    };
  }

  const continued = progress.lastPlayedDate === previousKey(today);
  const totalPoints = clampPoints(progress.totalPoints + points);
  const levelId = levelFromPoints(totalPoints);
  const next: QuizProgress = {
    streak: continued ? progress.streak + 1 : 1,
    lastPlayedDate: today,
    lastDailyScore: correctCount,
    lastDailyTotal: total,
    lastDailyPoints: points,
    totalAnswered: progress.totalAnswered + total,
    totalPoints,
    levelId,
    absenceAppliedThrough: today,
  };
  return {
    progress: next,
    leveledUp: levelId > prevLevel,
    leveledDown: levelId < prevLevel,
  };
}

function moreAdvanced(a: QuizProgress, b: QuizProgress): QuizProgress {
  const da = a.lastPlayedDate;
  const db = b.lastPlayedDate;
  if (da && db) {
    if (da > db) return a;
    if (db > da) return b;
    if (a.totalPoints !== b.totalPoints) {
      return a.totalPoints >= b.totalPoints ? a : b;
    }
    return a.streak >= b.streak ? a : b;
  }
  if (da && !db) return a;
  if (db && !da) return b;
  return a.totalPoints >= b.totalPoints ? a : b;
}

export function mergeProgress(
  local: QuizProgress,
  remote: QuizProgress | null,
): QuizProgress {
  if (!remote) return normalizeProgress(local);
  const a = normalizeProgress(local);
  const b = normalizeProgress(remote);
  const winner = moreAdvanced(a, b);
  return normalizeProgress({
    ...winner,
    totalAnswered: Math.max(a.totalAnswered, b.totalAnswered),
  });
}

function sameProgress(a: QuizProgress, b: QuizProgress): boolean {
  return (
    a.streak === b.streak &&
    a.lastPlayedDate === b.lastPlayedDate &&
    a.lastDailyScore === b.lastDailyScore &&
    a.lastDailyTotal === b.lastDailyTotal &&
    a.totalAnswered === b.totalAnswered &&
    a.totalPoints === b.totalPoints &&
    a.levelId === b.levelId &&
    a.lastDailyPoints === b.lastDailyPoints &&
    a.absenceAppliedThrough === b.absenceAppliedThrough
  );
}

export function useQuizProgress(userId?: string | null) {
  const [progress, setProgress] = useState<QuizProgress>(EMPTY_PROGRESS);

  useEffect(() => {
    const local = loadProgress();
    const { progress: afterAbsence } = applyAbsencePenalty(local);
    if (!sameProgress(afterAbsence, local)) {
      saveProgress(afterAbsence);
      void upsertQuizProgress(afterAbsence);
    }
    setProgress(afterAbsence);
  }, []);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      await tickQuizAbsenceRemote();
      const remote = await fetchQuizProgress();
      if (cancelled) return;
      const local = loadProgress();
      const merged = mergeProgress(local, remote);
      const { progress: afterAbsence } = applyAbsencePenalty(merged);
      if (!sameProgress(afterAbsence, local)) {
        saveProgress(afterAbsence);
        setProgress(afterAbsence);
      } else {
        setProgress(afterAbsence);
      }
      if (!remote || !sameProgress(afterAbsence, normalizeProgress(remote))) {
        void upsertQuizProgress(afterAbsence);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const recordDaily = useCallback((input: ApplyDailyInput) => {
    const current = loadProgress();
    const result = applyDailyResult(current, input);
    saveProgress(result.progress);
    void upsertQuizProgress(result.progress);
    setProgress(result.progress);
    return {
      leveledUp: result.leveledUp,
      leveledDown: result.leveledDown,
      progress: result.progress,
    };
  }, []);

  const recordPractice = useCallback((answered: number) => {
    if (answered <= 0) return;
    setProgress((prev) => {
      const next = { ...prev, totalAnswered: prev.totalAnswered + answered };
      saveProgress(next);
      return next;
    });
  }, []);

  const previewDaily = useCallback(
    (input: ApplyDailyInput) => {
      const { progress: next, leveledUp, leveledDown } = applyDailyResult(
        progress,
        input,
      );
      return {
        streak: next.streak,
        milestone: isMilestone(next.streak) ? next.streak : null,
        levelId: next.levelId,
        totalPoints: next.totalPoints,
        leveledUp,
        leveledDown,
      };
    },
    [progress],
  );

  return {
    progress,
    streak: effectiveStreak(progress),
    playedToday: hasPlayedToday(progress),
    recordDaily,
    recordPractice,
    previewDaily,
  };
}
