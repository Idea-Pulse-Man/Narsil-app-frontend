/**
 * Daily-quiz progress + competition board sync (Supabase).
 * ---------------------------------------------------------------------------
 * LocalStorage stays the offline source of truth. Signed-in users also hit
 * RPCs in quiz-levels.sql for points, absence penalties, and same-level boards.
 * Topic-quiz seals live in quiz_badges (see quiz-badges.sql).
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
  /** Member's own level, for halls that mix levels (Discover). */
  levelId?: number;
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

type RawBoard = {
  level_id?: number;
  rank?: number | null;
  points?: number | null;
  played_today?: boolean;
  played?: boolean;
  rows?: Array<{
    rank: number;
    user_id: string;
    display_name: string;
    avatar_url: string | null;
    points: number;
    is_you: boolean;
    level_id?: number;
  }>;
} | null;

function parseBoard(row: RawBoard): LevelBoard | null {
  if (!row) return null;
  return {
    levelId: row.level_id ?? 0,
    rank: row.rank ?? null,
    points: row.points ?? null,
    playedToday: !!(row.played_today ?? row.played),
    rows: (row.rows ?? []).map((r) => ({
      rank: r.rank,
      userId: r.user_id,
      displayName: r.display_name,
      avatarUrl: r.avatar_url,
      points: r.points,
      isYou: r.is_you,
      levelId: r.level_id,
    })),
  };
}

async function fetchBoard(
  rpc: string,
  args: Record<string, unknown>,
): Promise<LevelBoard | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc(rpc, args);
    if (error) {
      // Hall RPCs may not be migrated yet — soft-fail.
      console.warn(`Supabase: ${rpc} failed.`, error.message);
      return null;
    }
    return parseBoard(data as RawBoard);
  } catch (err) {
    console.warn(`Supabase: ${rpc} error.`, err);
    return null;
  }
}

/** Same-level board slice: top 50 + neighbors around you. */
export function fetchLevelBoard(playDate?: string): Promise<LevelBoard | null> {
  return fetchBoard("quiz_level_board", { p_play_date: playDate ?? undefined });
}

/** Monthly Hall: this month's daily points summed, all levels. */
export function fetchMonthBoard(month?: string): Promise<LevelBoard | null> {
  return fetchBoard("quiz_month_board", { p_month: month ?? undefined });
}

/** Discover Hall: best trial scores summed for one difficulty, all members. */
export function fetchDiscoverBoard(
  difficulty: string,
): Promise<LevelBoard | null> {
  return fetchBoard("quiz_discover_board", { p_difficulty: difficulty });
}

/** Load every seal the current user has earned. */
export async function fetchQuizBadges(): Promise<Record<
  string,
  { id: string; unlockedAt: string }
> | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("quiz_badges")
      .select("badge_id, unlocked_at");
    if (error) {
      console.warn("Supabase: quiz badges load failed.", error.message);
      return null;
    }
    const map: Record<string, { id: string; unlockedAt: string }> = {};
    for (const row of data ?? []) {
      const id = (row as { badge_id?: string }).badge_id;
      const unlockedAt = (row as { unlocked_at?: string }).unlocked_at;
      if (!id) continue;
      map[id] = { id, unlockedAt: unlockedAt ?? new Date().toISOString() };
    }
    return map;
  } catch (err) {
    console.warn("Supabase: quiz badges load error.", err);
    return null;
  }
}

/** Grant a seal (idempotent upsert). */
export async function upsertQuizBadge(
  badgeId: string,
  unlockedAt: string,
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("quiz_badges").upsert(
      {
        badge_id: badgeId,
        unlocked_at: unlockedAt,
      },
      { onConflict: "user_id,badge_id" },
    );
  } catch (err) {
    console.warn("Supabase: quiz badge write failed.", err);
  }
}

/** Load best star ratings for topic trials. */
export async function fetchQuizScores(): Promise<Record<
  string,
  { id: string; stars: number; score: number; total: number; updatedAt: string }
> | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("quiz_scores")
      .select("quiz_id, stars, score, total, updated_at");
    if (error) {
      console.warn("Supabase: quiz scores load failed.", error.message);
      return null;
    }
    const map: Record<
      string,
      { id: string; stars: number; score: number; total: number; updatedAt: string }
    > = {};
    for (const row of data ?? []) {
      const id = (row as { quiz_id?: string }).quiz_id;
      if (!id) continue;
      map[id] = {
        id,
        stars: (row as { stars?: number }).stars ?? 0,
        score: (row as { score?: number }).score ?? 0,
        total: (row as { total?: number }).total ?? 0,
        updatedAt:
          (row as { updated_at?: string }).updated_at ??
          new Date().toISOString(),
      };
    }
    return map;
  } catch (err) {
    console.warn("Supabase: quiz scores load error.", err);
    return null;
  }
}

/** Persist a best star rating (caller should only upsert improvements). */
export async function upsertQuizScore(
  quizId: string,
  stars: number,
  score: number,
  total: number,
  updatedAt: string,
): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from("quiz_scores").upsert(
      {
        quiz_id: quizId,
        stars,
        score,
        total,
        updated_at: updatedAt,
      },
      { onConflict: "user_id,quiz_id" },
    );
  } catch (err) {
    console.warn("Supabase: quiz score write failed.", err);
  }
}
