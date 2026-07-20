/**
 * Daily-quiz progress sync (Supabase).
 * ---------------------------------------------------------------------------
 * Mirrors `userData.ts`: talks to Supabase when it's configured AND a session
 * exists, otherwise every call no-ops and the caller stays on localStorage.
 * Enables cross-device streaks for signed-in accounts. Run
 * `supabase/quiz-progress.sql` to create the table.
 */

import { supabase } from "./supabase";
import type { QuizProgress } from "./quiz/types";

interface QuizProgressRow {
  streak: number | null;
  last_played_date: string | null;
  last_daily_score: number | null;
  last_daily_total: number | null;
  total_answered: number | null;
}

/** Load the current user's quiz progress, or null when unavailable. */
export async function fetchQuizProgress(): Promise<QuizProgress | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("quiz_progress")
      .select(
        "streak, last_played_date, last_daily_score, last_daily_total, total_answered",
      )
      .maybeSingle();
    if (error) {
      console.warn("Supabase: quiz progress load failed.", error.message);
      return null;
    }
    if (!data) return null;
    const row = data as QuizProgressRow;
    return {
      streak: row.streak ?? 0,
      lastPlayedDate: row.last_played_date ?? null,
      lastDailyScore: row.last_daily_score ?? null,
      lastDailyTotal: row.last_daily_total ?? null,
      totalAnswered: row.total_answered ?? 0,
    };
  } catch (err) {
    console.warn("Supabase: quiz progress load error.", err);
    return null;
  }
}

/**
 * Upsert the current user's quiz progress. `user_id` defaults to `auth.uid()`
 * (same trick as `seen`/`collections`), so the row is always the caller's.
 */
export async function upsertQuizProgress(progress: QuizProgress): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("quiz_progress").upsert(
      {
        streak: progress.streak,
        last_played_date: progress.lastPlayedDate,
        last_daily_score: progress.lastDailyScore,
        last_daily_total: progress.lastDailyTotal,
        total_answered: progress.totalAnswered,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  } catch (err) {
    console.warn("Supabase: quiz progress write failed.", err);
  }
}
