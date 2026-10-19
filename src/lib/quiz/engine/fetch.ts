/**
 * Loading engine questions (supabase/quiz-engine.sql) and adapting them to the
 * app's `QuizQuestion`, so sessions, results and review keep working.
 *
 * Every row is shape-checked before use: a malformed or unknown question is
 * dropped, never rendered. If the SQL isn't applied yet every call returns
 * empty and the quiz falls back to the old paths.
 */

import type { Artwork } from "@/data";
import { supabase } from "@/lib/supabase";
import { utcQuizDate } from "@/lib/dailyQuiz";
import { STORAGE_KEYS, readJSON, writeJSON } from "@/lib/storage";
import type { QuizQuestion } from "../types";
import {
  ENGINE_ANSWER_TYPES,
  type AnswerType,
  type ChoiceAnswer,
  type ItemOption,
  type MatchAnswer,
  type NumericAnswer,
  type OrderAnswer,
  type QuizItem,
  type TextAnswer,
} from "./types";

const SUPPORTED = new Set<string>(ENGINE_ANSWER_TYPES);

function asJson<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

/** Whether `item` has everything its renderer needs. */
export function isRenderable(item: QuizItem): boolean {
  if (!SUPPORTED.has(item.answer_type) || !item.prompt || !item.media?.label) {
    return false;
  }
  const ids = new Set(item.options.map((o) => o.id));
  const okOptions = item.options.every(
    (o) => typeof o.id === "string" && (o.label || o.image_url),
  );
  if (!okOptions) return false;
  switch (item.answer_type) {
    case "single":
    case "binary":
    case "multi": {
      const correct = (item.answer as ChoiceAnswer).correct;
      return (
        Array.isArray(correct) &&
        correct.length > 0 &&
        correct.every((id) => ids.has(id)) &&
        item.options.length >= 2
      );
    }
    case "order": {
      const order = (item.answer as OrderAnswer).order;
      return Array.isArray(order) && order.length === ids.size && order.every((id) => ids.has(id));
    }
    case "match": {
      const pairs = (item.answer as MatchAnswer).pairs;
      const targets = new Set((item.media.targets ?? []).map((t) => t.id));
      return (
        !!pairs &&
        targets.size >= 2 &&
        Object.entries(pairs).every(([k, v]) => ids.has(k) && targets.has(v))
      );
    }
    case "numeric": {
      const a = item.answer as NumericAnswer;
      const s = item.media.slider;
      return !!s && Number.isFinite(a.value) && s.min < s.max;
    }
    case "text": {
      const a = item.answer as TextAnswer;
      return Array.isArray(a.accept) && a.accept.length > 0;
    }
    default:
      return false;
  }
}

/** Raw Supabase row → `QuizItem`, or null when it can't be shown. */
export function normalizeItem(raw: Record<string, unknown>): QuizItem | null {
  const item: QuizItem = {
    id: String(raw.id ?? ""),
    style: String(raw.style ?? ""),
    answer_type: String(raw.answer_type ?? "") as AnswerType,
    prompt: String(raw.prompt ?? ""),
    media: asJson(raw.media, { label: "" }),
    options: asJson<ItemOption[]>(raw.options, []),
    answer: asJson(raw.answer, { correct: [] }),
    explain: raw.explain ? String(raw.explain) : null,
    difficulty: raw.difficulty ? String(raw.difficulty) : undefined,
    artwork_ids: Array.isArray(raw.artwork_ids) ? raw.artwork_ids.map(String) : [],
  };
  if (!item.id || !Array.isArray(item.options)) return null;
  return isRenderable(item) ? item : null;
}

/** Every image the question shows (main, compare, options). */
export function itemImageUrls(item: QuizItem): string[] {
  const urls = [
    item.media.image_url,
    item.media.compare?.image_url,
    ...item.options.map((o) => o.image_url),
  ].filter((u): u is string => Boolean(u));
  return [...new Set(urls)];
}

/** The work the review row links to: the main image, else the right answer. */
function primaryWork(item: QuizItem): { id: string; image: string; accent: string } {
  if (item.media.image_url) {
    return {
      id: item.media.artwork_id || item.artwork_ids[0] || item.id,
      image: item.media.image_url,
      accent: item.media.accent || "#3a2c1c",
    };
  }
  const correct = new Set(
    "correct" in item.answer ? (item.answer as ChoiceAnswer).correct : [],
  );
  const opt =
    item.options.find((o) => o.image_url && correct.has(o.id)) ??
    item.options.find((o) => o.image_url);
  return {
    id: opt?.artwork_id || item.artwork_ids[0] || item.id,
    image: opt?.image_url || "",
    accent: opt?.accent || "#3a2c1c",
  };
}

/**
 * Wrap an engine item as a `QuizQuestion`. The review list shows the prompt
 * and the style name; `correctIndex` is 0 and the stored answer is 0 (right)
 * or -1 (wrong), so `sessionCorrectness` works unchanged.
 */
export function itemToQuestion(item: QuizItem): QuizQuestion {
  const work = primaryWork(item);
  const artwork: Artwork = {
    id: work.id,
    title: item.prompt,
    artistId: "",
    year: item.media.label,
    period: "",
    medium: "",
    source: "",
    image: work.image,
    accent: work.accent,
    description: "",
    tags: [],
    category: "paintings",
    origin: "public-domain",
  };
  return {
    id: `engine:${item.id}`,
    mode: "what",
    artworkId: work.id,
    artwork,
    prompt: item.prompt,
    options: [],
    correctIndex: 0,
    item,
  };
}

/** Today's (UTC) engine edition, or [] when there is none yet. */
export async function fetchDailyEngineQuestions(
  quizDate = utcQuizDate(),
): Promise<QuizQuestion[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("daily_quiz_edition", {
    p_date: quizDate,
    p_answer_types: [...ENGINE_ANSWER_TYPES],
  });
  if (error) {
    console.warn("Supabase: engine daily load failed.", error.message);
    return [];
  }
  const rows = asJson<Record<string, unknown>[]>(data, []);
  return rows
    .map(normalizeItem)
    .filter((i): i is QuizItem => i !== null)
    .map(itemToQuestion);
}

/** A random practice batch, skipping recently played questions. */
export async function fetchPracticeQuestions(limit = 20): Promise<QuizQuestion[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("next_quiz_items", {
    p_surface: "practice",
    p_answer_types: [...ENGINE_ANSWER_TYPES],
    p_exclude: loadSeenItems(),
    p_limit: limit,
  });
  if (error) {
    console.warn("Supabase: engine practice load failed.", error.message);
    return [];
  }
  return ((data ?? []) as Record<string, unknown>[])
    .map(normalizeItem)
    .filter((i): i is QuizItem => i !== null)
    .map(itemToQuestion);
}

/** Admin-set share (0–100) of practice questions drawn from the engine. */
export async function fetchPracticeMix(): Promise<number> {
  if (!supabase) return 0;
  const { data, error } = await supabase
    .from("quiz_engine_config")
    .select("practice_mix")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return 0;
  const mix = Number((data as { practice_mix?: number }).practice_mix);
  return Number.isFinite(mix) ? Math.min(100, Math.max(0, mix)) : 0;
}

/** Fire-and-forget play stats for the admin's difficulty flags. */
export function recordItemResult(itemId: string, correct: boolean): void {
  if (!supabase) return;
  void supabase
    .rpc("record_quiz_item_result", { p_item: itemId, p_correct: correct })
    .then(({ error }) => {
      if (error) console.warn("Supabase: quiz stat failed.", error.message);
    });
}

// ── Recently seen (practice skips these) ─────────────────────────────────

const SEEN_LIMIT = 400;

export function loadSeenItems(): string[] {
  const ids = readJSON<string[]>(STORAGE_KEYS.quizEngineSeen, []);
  return Array.isArray(ids) ? ids.slice(-SEEN_LIMIT) : [];
}

export function markItemSeen(itemId: string): void {
  const ids = loadSeenItems().filter((id) => id !== itemId);
  ids.push(itemId);
  writeJSON(STORAGE_KEYS.quizEngineSeen, ids.slice(-SEEN_LIMIT));
}
