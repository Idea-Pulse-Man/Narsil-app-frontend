/**
 * Quiz progress — streak + daily completion, persisted to localStorage.
 *
 * Local-only for the MVP (matches likes/saves in v1). Phase 2 can mirror this
 * to a Supabase `quiz_progress` table the same way `userData.ts` syncs
 * collections, keyed off the shape below.
 */

import { useCallback, useEffect, useState } from "react";
import { STORAGE_KEYS, readJSON, writeJSON } from "@/lib/storage";
import { fetchQuizProgress, upsertQuizProgress } from "@/lib/quizRemote";
import type { QuizProgress } from "./types";
import { EMPTY_PROGRESS } from "./types";
import { previousKey, todayKey } from "./daily";
import { clearDailySession } from "./session";

/** Streak lengths worth celebrating. */
export const MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

/** Whether `streak` is a milestone worth a celebration. */
export function isMilestone(streak: number): boolean {
  return MILESTONES.includes(streak);
}

export function loadProgress(): QuizProgress {
  return readJSON<QuizProgress>(STORAGE_KEYS.quizProgress, EMPTY_PROGRESS);
}

function saveProgress(progress: QuizProgress): void {
  writeJSON(STORAGE_KEYS.quizProgress, progress);
}

/**
 * Wipe all quiz progress — streak, last score, lifetime total — plus today's
 * frozen session, locally and (if signed in) in the cloud. The cloud write is
 * fire-and-forget; the local reset is synchronous so the UI can update at once.
 */
export async function resetQuizData(): Promise<void> {
  saveProgress(EMPTY_PROGRESS);
  clearDailySession();
  await upsertQuizProgress(EMPTY_PROGRESS);
}

/** True when today's daily quiz has already been completed. */
export function hasPlayedToday(progress: QuizProgress): boolean {
  return progress.lastPlayedDate === todayKey();
}

/**
 * The streak as it should *display* today: a missed day breaks it, so a stored
 * streak only counts if the last play was today or yesterday. (The stored value
 * isn't mutated until the next completion — this is purely for display.)
 */
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

/** Apply a completed daily result, advancing/resetting the streak. */
export function applyDailyResult(
  progress: QuizProgress,
  score: number,
  total: number,
): QuizProgress {
  const today = todayKey();
  // Replays on the same day don't change the streak or double-count.
  if (progress.lastPlayedDate === today) {
    return {
      ...progress,
      lastDailyScore: score,
      lastDailyTotal: total,
    };
  }
  const continued = progress.lastPlayedDate === previousKey(today);
  return {
    streak: continued ? progress.streak + 1 : 1,
    lastPlayedDate: today,
    lastDailyScore: score,
    lastDailyTotal: total,
    totalAnswered: progress.totalAnswered + total,
  };
}

/** Which of two progress records is further along (later day, then higher streak). */
function moreAdvanced(a: QuizProgress, b: QuizProgress): QuizProgress {
  const da = a.lastPlayedDate;
  const db = b.lastPlayedDate;
  if (da && db) {
    if (da > db) return a; // "YYYY-MM-DD" sorts lexicographically = chronologically
    if (db > da) return b;
    return a.streak >= b.streak ? a : b;
  }
  if (da && !db) return a;
  if (db && !da) return b;
  return a.streak >= b.streak ? a : b;
}

/**
 * Reconcile local and cloud progress. Takes the more advanced streak (so an
 * offline completion isn't lost, and a device that's behind catches up) and the
 * larger lifetime total. Deterministic regardless of which side is "newer".
 */
export function mergeProgress(
  local: QuizProgress,
  remote: QuizProgress | null,
): QuizProgress {
  if (!remote) return local;
  const winner = moreAdvanced(local, remote);
  return {
    ...winner,
    totalAnswered: Math.max(local.totalAnswered, remote.totalAnswered),
  };
}

function sameProgress(a: QuizProgress, b: QuizProgress): boolean {
  return (
    a.streak === b.streak &&
    a.lastPlayedDate === b.lastPlayedDate &&
    a.lastDailyScore === b.lastDailyScore &&
    a.lastDailyTotal === b.lastDailyTotal &&
    a.totalAnswered === b.totalAnswered
  );
}

/**
 * React hook over the persisted progress. Reads localStorage on mount
 * (instant, SSR-safe, offline), then — once a Supabase session exists (a
 * non-null `userId`, which AppState establishes) — reconciles with the cloud so
 * streaks follow a signed-in account across devices. Daily completions are
 * mirrored to the cloud immediately. Passing `null` keeps it local-only.
 */
export function useQuizProgress(userId?: string | null) {
  const [progress, setProgress] = useState<QuizProgress>(EMPTY_PROGRESS);

  // Instant local hydration.
  useEffect(() => {
    setProgress(loadProgress());
  }, []);

  // Cloud reconcile — re-runs when the session's user id becomes available or
  // changes (e.g. guest → signed-in). We don't create the session here; AppState
  // owns that, so there's no risk of racing a duplicate anonymous sign-in.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const remote = await fetchQuizProgress();
      if (cancelled) return;
      const local = loadProgress();
      const merged = mergeProgress(local, remote);
      if (!sameProgress(merged, local)) {
        saveProgress(merged);
        setProgress(merged);
      }
      // Push if the cloud is behind (or has no row yet).
      if (!remote || !sameProgress(merged, remote)) {
        void upsertQuizProgress(merged);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const recordDaily = useCallback((score: number, total: number) => {
    setProgress((prev) => {
      const next = applyDailyResult(prev, score, total);
      saveProgress(next);
      void upsertQuizProgress(next);
      return next;
    });
  }, []);

  const recordPractice = useCallback((answered: number) => {
    if (answered <= 0) return;
    setProgress((prev) => {
      const next = { ...prev, totalAnswered: prev.totalAnswered + answered };
      saveProgress(next);
      // Practice only bumps a lifetime stat — sync lazily via the next daily
      // completion / app-load merge rather than writing per question.
      return next;
    });
  }, []);

  /**
   * The streak + milestone this daily result *would* produce, computed from the
   * current progress without mutating it. Lets the caller show a celebration on
   * the results screen the same tick it records the result.
   */
  const previewDaily = useCallback(
    (score: number, total: number) => {
      const next = applyDailyResult(progress, score, total);
      return {
        streak: next.streak,
        milestone: isMilestone(next.streak) ? next.streak : null,
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
