/**
 * Admin helpers for the question engine (supabase/quiz-engine.sql +
 * backend /api/admin/quiz/engine/*). Switches and settings go straight to
 * Supabase under admin RLS; generating and previewing need the backend.
 */

import { supabase } from "./supabase";
import { API_URL } from "./api";
import { ngrokFetch } from "./ngrok";
import { normalizeItem } from "./quiz/engine/fetch";
import type { AnswerType, QuizItem } from "./quiz/engine/types";

export type SettingValue = number | boolean | string | string[];
export type StyleSettings = Record<string, SettingValue>;

export type SettingField =
  | { key: string; label: string; type: "number"; min: number; max: number; step?: number }
  | { key: string; label: string; type: "boolean" }
  | { key: string; label: string; type: "select"; options: { value: string; label: string }[] }
  | { key: string; label: string; type: "multiselect"; options: { value: string; label: string }[] };

/** A style as the backend registry describes it. */
export interface StyleDef {
  id: string;
  label: string;
  answer_type: AnswerType;
  description: string;
  surfaces: string[];
  settings: SettingField[];
  defaults: StyleSettings;
}

/** A style's admin-controlled row in `quiz_styles`. */
export interface StyleRow {
  id: string;
  label: string;
  answer_type: string;
  enabled: boolean;
  per_run: number;
  surfaces: string[];
  settings: StyleSettings;
  require_review: boolean;
  min_app_version: string | null;
  sort_order: number;
}

export interface EngineConfig {
  daily_count: number;
  practice_mix: number;
}

export interface StyleStats {
  live: number;
  review: number;
  retired: number;
  shown: number;
  correct: number;
}

export interface GenerationRun {
  id: string;
  trigger: "cron" | "admin";
  status: "running" | "done" | "failed";
  started_at: string;
  finished_at: string | null;
  created: Record<string, number>;
  rejected: Record<string, number>;
  problems: string[];
  daily_added: number;
}

export interface RunSummary {
  runId: string | null;
  created: Record<string, number>;
  rejected: Record<string, number>;
  problems: string[];
  daily: { date: string; added: number; total: number } | null;
}

export type ItemStatus = "live" | "review" | "retired";

export interface AdminItem extends QuizItem {
  status: ItemStatus;
  shown_count: number;
  correct_count: number;
  created_at: string;
}

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

async function backend<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const { data } = await client().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired — sign in again.");
  const res = await ngrokFetch(`${API_URL}/api/admin/quiz/engine${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = (await res.json().catch(() => null)) as (T & { message?: string }) | null;
  if (!res.ok) throw new Error(json?.message ?? `Request failed (${res.status})`);
  return json as T;
}

const SQL_HINT = " — run supabase/quiz-engine.sql?";

export async function fetchStyleDefs(): Promise<StyleDef[]> {
  const res = await backend<{ styles: StyleDef[] }>("/styles");
  return res.styles ?? [];
}

export async function fetchStyleRows(): Promise<StyleRow[]> {
  const { data, error } = await client()
    .from("quiz_styles")
    .select("id, label, answer_type, enabled, per_run, surfaces, settings, require_review, min_app_version, sort_order")
    .order("sort_order");
  if (error) throw new Error(error.message + SQL_HINT);
  return (data ?? []) as StyleRow[];
}

export async function updateStyle(
  id: string,
  patch: Partial<Pick<StyleRow, "enabled" | "per_run" | "surfaces" | "settings" | "require_review">>,
): Promise<void> {
  const { error } = await client()
    .from("quiz_styles")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchEngineConfig(): Promise<EngineConfig> {
  const { data, error } = await client()
    .from("quiz_engine_config")
    .select("daily_count, practice_mix")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw new Error(error.message + SQL_HINT);
  return (data as EngineConfig | null) ?? { daily_count: 10, practice_mix: 60 };
}

export async function updateEngineConfig(patch: Partial<EngineConfig>): Promise<void> {
  const { error } = await client()
    .from("quiz_engine_config")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", 1);
  if (error) throw new Error(error.message);
}

export async function fetchStyleStats(): Promise<Record<string, StyleStats>> {
  const { data, error } = await client().rpc("admin_quiz_style_stats");
  if (error) throw new Error(error.message + SQL_HINT);
  return (data ?? {}) as Record<string, StyleStats>;
}

/** Sample questions with these settings. Nothing is saved. */
export async function previewStyle(
  style: string,
  settings: StyleSettings,
  count = 3,
): Promise<{ items: QuizItem[]; rejected: number; problems: string[] }> {
  const res = await backend<{ items: Record<string, unknown>[]; rejected: number; problems: string[] }>(
    "/preview",
    { method: "POST", body: { style, settings, count } },
  );
  const items = (res.items ?? [])
    .map((raw, i) => normalizeItem({ id: `preview-${i}`, ...raw }))
    .filter((i): i is QuizItem => i !== null);
  return { items, rejected: res.rejected ?? 0, problems: res.problems ?? [] };
}

/** "Generate now": every enabled style, or just `style`. */
export async function runGenerationNow(opts: {
  style?: string;
  count?: number;
  fillDaily?: boolean;
} = {}): Promise<RunSummary> {
  return backend<RunSummary>("/run", {
    method: "POST",
    body: { style: opts.style, count: opts.count, fill_daily: opts.fillDaily ?? true },
  });
}

export async function fetchRuns(limit = 10): Promise<GenerationRun[]> {
  const res = await backend<{ runs: GenerationRun[] }>(`/runs?limit=${limit}`);
  return res.runs ?? [];
}

const ITEM_COLUMNS =
  "id, style, answer_type, prompt, media, options, answer, explain, difficulty, artwork_ids, status, shown_count, correct_count, created_at";

function toAdminItem(raw: Record<string, unknown>): AdminItem | null {
  const item = normalizeItem(raw);
  if (!item) return null;
  return {
    ...item,
    status: raw.status as ItemStatus,
    shown_count: Number(raw.shown_count) || 0,
    correct_count: Number(raw.correct_count) || 0,
    created_at: String(raw.created_at),
  };
}

/** Items for one style and status ("flagged" = plays show it's too easy / hard). */
export async function fetchItems(opts: {
  style: string | null;
  status: ItemStatus | "flagged";
  limit?: number;
}): Promise<AdminItem[]> {
  let query = client().from("quiz_items").select(ITEM_COLUMNS);
  if (opts.style) query = query.eq("style", opts.style);
  if (opts.status === "flagged") {
    query = query.eq("status", "live").gte("shown_count", FLAG_MIN_PLAYS).order("shown_count", { ascending: false });
  } else {
    query = query.eq("status", opts.status).order("created_at", { ascending: false });
  }
  const { data, error } = await query.limit(opts.limit ?? 60);
  if (error) throw new Error(error.message + SQL_HINT);
  const items = ((data ?? []) as Record<string, unknown>[])
    .map(toAdminItem)
    .filter((i): i is AdminItem => i !== null);
  return opts.status === "flagged" ? items.filter(isFlagged) : items;
}

/** Plays before an item can be flagged, and the right-answer rates that flag it. */
export const FLAG_MIN_PLAYS = 30;
export const FLAG_TOO_HARD = 0.15;
export const FLAG_TOO_EASY = 0.97;

export function correctRate(item: { shown_count: number; correct_count: number }): number | null {
  return item.shown_count > 0 ? item.correct_count / item.shown_count : null;
}

export function isFlagged(item: AdminItem): boolean {
  const rate = correctRate(item);
  return item.shown_count >= FLAG_MIN_PLAYS && rate !== null && (rate < FLAG_TOO_HARD || rate > FLAG_TOO_EASY);
}

export async function setItemStatus(id: string, status: ItemStatus): Promise<void> {
  const { error } = await client().from("quiz_items").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
}
