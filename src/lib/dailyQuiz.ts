/**
 * Shared daily Royal Assessment (`supabase/daily-quiz.sql`).
 *
 * The cron writes one UTC edition. The app plays that set. If the day has no
 * rows yet, the caller falls back to the on-device generator.
 */

import type { Artwork } from "@/data";
import { supabase } from "./supabase";
import type { QuizMode, QuizQuestion } from "./quiz/types";
import { QUIZ_MODES } from "./quiz/types";

export interface DailyQuizRow {
  id: string;
  quiz_date: string;
  position: number;
  source: "generated" | "admin";
  mode: string;
  artwork_id: string | null;
  image_url: string | null;
  accent: string | null;
  title: string | null;
  artist_name: string | null;
  year: string | null;
  prompt: string;
  options: string[];
  correct_index: number;
}

export interface DailyEdition {
  quizDate: string;
  locked: boolean;
  questions: DailyQuizRow[];
}

/** UTC day, matching the cron (`date -u` / `toISOString` date). */
export function utcQuizDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function asOptions(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((o) => String(o));
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return parsed.map((o) => String(o));
    } catch {
      return [];
    }
  }
  return [];
}

function normalize(raw: Record<string, unknown>): DailyQuizRow {
  return {
    id: String(raw.id),
    quiz_date: String(raw.quiz_date),
    position: Number(raw.position) || 0,
    source: raw.source === "admin" ? "admin" : "generated",
    mode: String(raw.mode),
    artwork_id: raw.artwork_id ? String(raw.artwork_id) : null,
    image_url: raw.image_url ? String(raw.image_url) : null,
    accent: raw.accent ? String(raw.accent) : null,
    title: raw.title ? String(raw.title) : null,
    artist_name: raw.artist_name ? String(raw.artist_name) : null,
    year: raw.year ? String(raw.year) : null,
    prompt: String(raw.prompt),
    options: asOptions(raw.options),
    correct_index: Number(raw.correct_index) || 0,
  };
}

function stubArtwork(row: DailyQuizRow): Artwork {
  return {
    id: row.artwork_id || row.id,
    title: row.title || "Untitled",
    artistId: "",
    year: row.year || "",
    period: "",
    medium: "",
    source: "",
    image: row.image_url || "",
    accent: row.accent || "#3a2c1c",
    description: "",
    tags: [],
    category: "paintings",
    origin: "public-domain",
  };
}

export function dailyRowsToQuestions(rows: DailyQuizRow[]): QuizQuestion[] {
  const out: QuizQuestion[] = [];
  for (const row of rows) {
    if (!row.image_url || !row.prompt) continue;
    const mode = (
      QUIZ_MODES.includes(row.mode as QuizMode) ? row.mode : "what"
    ) as QuizMode;
    const options = row.options.slice(0, 4);
    if (options.length < 4) continue;
    let correctIndex = row.correct_index;
    if (correctIndex < 0 || correctIndex > 3) correctIndex = 0;
    out.push({
      id: row.id,
      mode,
      artworkId: row.artwork_id || row.id,
      artwork: stubArtwork(row),
      prompt: row.prompt,
      options,
      correctIndex,
    });
  }
  return out;
}

/** Published questions for a UTC day, in play order. Empty if SQL isn't applied yet. */
export async function fetchDailyQuizQuestions(
  quizDate = utcQuizDate(),
): Promise<QuizQuestion[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("daily_quiz_questions")
    .select(
      "id, quiz_date, position, source, mode, artwork_id, image_url, accent, title, artist_name, year, prompt, options, correct_index",
    )
    .eq("quiz_date", quizDate)
    .order("position", { ascending: true });
  if (error) {
    console.warn("Supabase: daily quiz load failed.", error.message);
    return [];
  }
  const rows = (data ?? []).map((r) => normalize(r as Record<string, unknown>));
  return dailyRowsToQuestions(rows);
}

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function fetchAdminDailyEdition(
  quizDate = utcQuizDate(),
): Promise<DailyEdition> {
  const { data, error } = await client().rpc("admin_list_daily_quiz", {
    p_date: quizDate,
  });
  if (error) throw new Error(error.message);
  const raw = (data ?? {}) as Record<string, unknown>;
  const questions = Array.isArray(raw.questions)
    ? raw.questions.map((r) => normalize(r as Record<string, unknown>))
    : [];
  return {
    quizDate,
    locked: Boolean(raw.locked),
    questions,
  };
}

export async function addDailySpecial(input: {
  quizDate: string;
  mode: string;
  prompt: string;
  options: string[];
  correctIndex: number;
  artworkId?: string;
  imageUrl?: string;
  accent?: string;
  title?: string;
  artistName?: string;
  year?: string;
}): Promise<void> {
  const { error } = await client().rpc("admin_add_daily_special", {
    p_date: input.quizDate,
    p_mode: input.mode,
    p_prompt: input.prompt.trim(),
    p_options: input.options.map((o) => o.trim()),
    p_correct_index: input.correctIndex,
    p_artwork_id: input.artworkId?.trim() || null,
    p_image_url: input.imageUrl?.trim() || null,
    p_accent: input.accent?.trim() || null,
    p_title: input.title?.trim() || null,
    p_artist_name: input.artistName?.trim() || null,
    p_year: input.year?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

export async function deleteDailyQuestion(id: string): Promise<void> {
  const { error } = await client().rpc("admin_delete_daily_question", {
    p_id: id,
  });
  if (error) throw new Error(error.message);
}

export async function setDailyLock(quizDate: string, locked: boolean): Promise<void> {
  const { error } = await client().rpc("admin_set_daily_lock", {
    p_date: quizDate,
    p_locked: locked,
  });
  if (error) throw new Error(error.message);
}
