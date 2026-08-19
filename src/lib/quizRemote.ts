/**
 * Daily-quiz progress + competition board sync (Supabase).
 * ---------------------------------------------------------------------------
 * LocalStorage stays the offline source of truth. Signed-in users also hit
 * RPCs in quiz-levels.sql for points, absence penalties, and same-level boards.
 */

import { supabase } from "./supabase";
import type { QuizProgress } from "./quiz/types";
import { levelFromPoints } from "./quiz/levels";

interface QuizProgressRow {
  streak: number | null;
  last_played_date: string | null;
  last_daily_score: number | null;
  last_daily_total: number | null;
  total_answered: number | null;
  total_points: number | null;
  level_id: number | null;
  last_daily_points: number | null;
  absence_applied_through: string | null;
}

export interface SubmitDailyResult {
  totalPoints: number;
  levelId: number;
  leveledUp: boolean;
  leveledDown: boolean;
  todayPoints: number;
  correct: number;
  total: number;
}

export interface BoardRow {
  rank: number;
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  points: number;
  isYou: boolean;
}

export interface LevelBoard {
  levelId: number;
  rank: number | null;
  points: number | null;
  playedToday: boolean;
  rows: BoardRow[];
}

/** Load the current user's quiz progress, or null when unavailable. */
export async function fetchQuizProgress(): Promise<QuizProgress | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("quiz_progress")
      .select(
        "streak, last_played_date, last_daily_score, last_daily_total, total_answered, total_points, level_id, last_daily_points, absence_applied_through",
      )
      .maybeSingle();
    if (error) {
      console.warn("Supabase: quiz progress load failed.", error.message);
      return null;
    }
    if (!data) return null;
    const row = data as QuizProgressRow;
    const totalPoints = row.total_points ?? 0;
    return {
      streak: row.streak ?? 0,
      lastPlayedDate: row.last_played_date ?? null,
      lastDailyScore: row.last_daily_score ?? null,
      lastDailyTotal: row.last_daily_total ?? null,
      totalAnswered: row.total_answered ?? 0,
      totalPoints,
      levelId: row.level_id ?? levelFromPoints(totalPoints),
      lastDailyPoints: row.last_daily_points ?? null,
      absenceAppliedThrough: row.absence_applied_through ?? null,
    };
  } catch (err) {
    console.warn("Supabase: quiz progress load error.", err);
    return null;
  }
}

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
        total_points: progress.totalPoints,
        level_id: progress.levelId,
        last_daily_points: progress.lastDailyPoints,
        absence_applied_through: progress.absenceAppliedThrough,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
  } catch (err) {
    console.warn("Supabase: quiz progress write failed.", err);
  }
}

/** Apply missed-day −100 penalties on the server (idempotent). */
export async function tickQuizAbsenceRemote(): Promise<void> {
  if (!supabase) return;
  try {
    const { error } = await supabase.rpc("tick_quiz_absence");
    if (error) {
      // Table/RPC may not be migrated yet — soft-fail.
      console.warn("Supabase: tick_quiz_absence failed.", error.message);
    }
  } catch (err) {
    console.warn("Supabase: tick_quiz_absence error.", err);
  }
}

/** Submit today's competition points; returns level change flags. */
export async function submitDailyQuizResult(
  points: number,
  correct: number,
  total: number,
  playDate?: string,
): Promise<SubmitDailyResult | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("submit_daily_quiz_result", {
      p_points: points,
      p_correct: correct,
      p_total: total,
      p_play_date: playDate ?? undefined,
    });
    if (error) {
      console.warn("Supabase: submit_daily_quiz_result failed.", error.message);
      return null;
    }
    const row = data as {
      total_points?: number;
      level_id?: number;
      leveled_up?: boolean;
      leveled_down?: boolean;
      today_points?: number;
      correct?: number;
      total?: number;
    } | null;
    if (!row) return null;
    return {
      totalPoints: row.total_points ?? 0,
      levelId: row.level_id ?? 0,
      leveledUp: !!row.leveled_up,
      leveledDown: !!row.leveled_down,
      todayPoints: row.today_points ?? points,
      correct: row.correct ?? correct,
      total: row.total ?? total,
    };
  } catch (err) {
    console.warn("Supabase: submit_daily_quiz_result error.", err);
    return null;
  }
}

/** Same-level board slice: top 5 + neighbors around you. */
export async function fetchLevelBoard(
  playDate?: string,
): Promise<LevelBoard | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc("quiz_level_board", {
      p_play_date: playDate ?? undefined,
    });
    if (error) {
      console.warn("Supabase: quiz_level_board failed.", error.message);
      return null;
    }
    const row = data as {
      level_id?: number;
      rank?: number | null;
      points?: number | null;
      played_today?: boolean;
      rows?: Array<{
        rank: number;
        user_id: string;
        display_name: string;
        avatar_url: string | null;
        points: number;
        is_you: boolean;
      }>;
    } | null;
    if (!row) return null;
    return {
      levelId: row.level_id ?? 0,
      rank: row.rank ?? null,
      points: row.points ?? null,
      playedToday: !!row.played_today,
      rows: (row.rows ?? []).map((r) => ({
        rank: r.rank,
        userId: r.user_id,
        displayName: r.display_name,
        avatarUrl: r.avatar_url,
        points: r.points,
        isYou: r.is_you,
      })),
    };
  } catch (err) {
    console.warn("Supabase: quiz_level_board error.", err);
    return null;
  }
}
