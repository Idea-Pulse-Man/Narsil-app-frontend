/**
 * Admin + member helpers for the authored quiz question bank
 * (`supabase/quiz-questions.sql`).
 */

import { supabase } from "./supabase";
import { API_URL } from "./api";
import { ngrokFetch } from "./ngrok";
import type { Artwork } from "@/data";
import type { QuizMode, QuizQuestion } from "./quiz/types";
import type { QuizDifficulty, TopicKind } from "./quiz/topic";
import { QUIZ_MODES } from "./quiz/types";
import { shuffle } from "./quiz/random";

export interface QuizBankRow {
  id: string;
  topic_kind: TopicKind;
  topic_id: string;
  difficulty: QuizDifficulty;
  mode: string;
  artwork_id: string | null;
  prompt: string;
  options: string[];
  correct_index: number;
  created_at: string;
}

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function normalizeRow(raw: Record<string, unknown>): QuizBankRow {
  const opts = raw.options;
  const options = Array.isArray(opts)
    ? opts.map((o) => String(o))
    : typeof opts === "string"
      ? (JSON.parse(opts) as string[])
      : [];
  return {
    id: String(raw.id),
    topic_kind: raw.topic_kind as TopicKind,
    topic_id: String(raw.topic_id),
    difficulty: raw.difficulty as QuizDifficulty,
    mode: String(raw.mode),
    artwork_id: raw.artwork_id ? String(raw.artwork_id) : null,
    prompt: String(raw.prompt),
    options,
    correct_index: Number(raw.correct_index) || 0,
    created_at: String(raw.created_at),
  };
}

export async function fetchAdminQuizQuestions(opts?: {
  topicKind?: TopicKind | null;
  topicId?: string | null;
  difficulty?: QuizDifficulty | null;
  limit?: number;
  offset?: number;
}): Promise<{ rows: QuizBankRow[]; total: number }> {
  const { data, error } = await client().rpc("admin_list_quiz_questions", {
    topic_kind_filter: opts?.topicKind ?? null,
    topic_id_filter: opts?.topicId ?? null,
    difficulty_filter: opts?.difficulty ?? null,
    page_limit: opts?.limit ?? 30,
    page_offset: opts?.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  const payload = data as { rows?: unknown[]; total?: number } | null;
  const rows = (payload?.rows ?? []).map((r) =>
    normalizeRow(r as Record<string, unknown>),
  );
  return { rows, total: payload?.total ?? 0 };
}

export async function insertQuizQuestion(input: {
  topicKind: TopicKind;
  topicId: string;
  difficulty: QuizDifficulty;
  mode: QuizMode | string;
  prompt: string;
  options: [string, string, string, string] | string[];
  correctIndex: number;
  artworkId?: string | null;
}): Promise<QuizBankRow> {
  if (input.options.length !== 4) {
    throw new Error("Exactly four options are required.");
  }
  const { data, error } = await client().rpc("admin_insert_quiz_question", {
    p_topic_kind: input.topicKind,
    p_topic_id: input.topicId,
    p_difficulty: input.difficulty,
    p_mode: input.mode,
    p_prompt: input.prompt,
    p_options: input.options,
    p_correct_index: input.correctIndex,
    p_artwork_id: input.artworkId ?? null,
  });
  if (error) throw new Error(error.message);
  return normalizeRow(data as Record<string, unknown>);
}

export async function deleteQuizQuestion(id: string): Promise<void> {
  const { error } = await client().rpc("admin_delete_quiz_question", {
    target_id: id,
  });
  if (error) throw new Error(error.message);
}

/** Member/live: bank rows for a topic trial. Empty if SQL not applied. */
export async function fetchTopicBankQuestions(
  topicKind: TopicKind,
  topicId: string,
  difficulty: QuizDifficulty,
): Promise<QuizBankRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("list_quiz_questions_for_topic", {
    p_topic_kind: topicKind,
    p_topic_id: topicId,
    p_difficulty: difficulty,
  });
  if (error) return [];
  const rows = Array.isArray(data) ? data : [];
  return rows.map((r) => normalizeRow(r as Record<string, unknown>));
}

/**
 * Turn bank rows into live QuizQuestion objects (needs artwork images from the
 * pool). Rows without a resolvable image are skipped.
 */
export function bankRowsToQuizQuestions(
  rows: QuizBankRow[],
  pool: Artwork[],
  fallbackTargets: Artwork[] = [],
): QuizQuestion[] {
  const byId = new Map(pool.map((a) => [a.id, a]));
  const fallback = fallbackTargets.find((a) => !!a.image) ?? pool.find((a) => !!a.image);
  const out: QuizQuestion[] = [];

  for (const row of rows) {
    const art =
      (row.artwork_id ? byId.get(row.artwork_id) : undefined) ?? fallback;
    if (!art?.image) continue;
    const mode = (QUIZ_MODES.includes(row.mode as QuizMode)
      ? row.mode
      : "what") as QuizMode;
    const options = row.options.slice(0, 4);
    while (options.length < 4) options.push("—");
    let correctIndex = row.correct_index;
    if (correctIndex < 0 || correctIndex > 3) correctIndex = 0;
    out.push({
      id: row.id,
      mode,
      artworkId: art.id,
      artwork: art,
      prompt: row.prompt,
      options,
      correctIndex,
    });
  }
  return out;
}

/** Fetch + convert bank questions for a topic trial (shuffled). */
export async function loadBankQuizQuestions(
  topicKind: TopicKind,
  topicId: string,
  difficulty: QuizDifficulty,
  pool: Artwork[],
  targets: Artwork[],
): Promise<QuizQuestion[]> {
  const rows = await fetchTopicBankQuestions(topicKind, topicId, difficulty);
  if (!rows.length) return [];
  return shuffle(bankRowsToQuizQuestions(rows, pool, targets), Math.random);
}

export interface GeneratedQuizQuestion {
  mode: string;
  artwork_id: string | null;
  prompt: string;
  options: string[];
  correct_index: number;
}

/** Admin: ask the backend to generate grounded MCQs via OpenAI. */
export async function generateQuizQuestionsAi(input: {
  topicKind: TopicKind;
  topicId: string;
  topicTitle: string;
  difficulty: QuizDifficulty;
  count: number;
  mode?: QuizMode | "auto";
}): Promise<GeneratedQuizQuestion[]> {
  const { data } = await client().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired — sign in again.");

  const res = await ngrokFetch(`${API_URL}/api/admin/quiz/generate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      topic_kind: input.topicKind,
      topic_id: input.topicId,
      topic_title: input.topicTitle,
      difficulty: input.difficulty,
      count: input.count,
      mode: input.mode ?? "auto",
    }),
  });

  const json = (await res.json().catch(() => null)) as
    | { questions?: GeneratedQuizQuestion[]; message?: string }
    | null;
  if (!res.ok) {
    throw new Error(json?.message ?? `Generate failed (${res.status})`);
  }
  return json?.questions ?? [];
}
