/**
 * Escalating retry waits after a failed Discover trial (not 100%).
 * Ladder: 30s → 5m → 30m → 1h → 6h → 24h (caps at 24h).
 */

import { STORAGE_KEYS, readJSON, writeJSON } from "@/lib/storage";
import { badgeId, type QuizDifficulty, type TopicRef } from "./topic";

export const TOPIC_RETRY_WAITS_MS = [
  30_000,
  5 * 60_000,
  30 * 60_000,
  60 * 60_000,
  6 * 60 * 60_000,
  24 * 60 * 60_000,
] as const;

export interface TopicCooldown {
  /** Consecutive failed finishes (resets on a perfect run). */
  failCount: number;
  lockedUntil: string;
}

export type CooldownMap = Record<string, TopicCooldown>;

/** In-memory mirror so tests and SSR-less environments still work. */
let memory: CooldownMap | null = null;

export function loadCooldowns(): CooldownMap {
  if (memory) return memory;
  memory = readJSON<CooldownMap>(STORAGE_KEYS.quizCooldowns, {});
  return memory;
}

function saveCooldowns(map: CooldownMap): void {
  memory = map;
  writeJSON(STORAGE_KEYS.quizCooldowns, map);
}

/** Test helper — wipe persisted + memory state. */
export function resetCooldownsForTests(): void {
  memory = {};
  writeJSON(STORAGE_KEYS.quizCooldowns, {});
}

export function waitMsForFailCount(failCount: number): number {
  if (failCount <= 0) return 0;
  const i = Math.min(failCount, TOPIC_RETRY_WAITS_MS.length) - 1;
  return TOPIC_RETRY_WAITS_MS[i]!;
}

/** Human label for a wait duration. */
export function formatWaitMs(ms: number): string {
  if (ms < 60_000) {
    const s = Math.max(1, Math.ceil(ms / 1000));
    return `${s}s`;
  }
  if (ms < 60 * 60_000) {
    const m = Math.max(1, Math.ceil(ms / 60_000));
    return `${m} min`;
  }
  const h = Math.max(1, Math.round(ms / (60 * 60_000)));
  return h === 1 ? "1 hour" : `${h} hours`;
}

export function formatRemainingMs(ms: number): string {
  if (ms <= 0) return "0s";
  if (ms < 60_000) {
    return `${Math.max(1, Math.ceil(ms / 1000))}s`;
  }
  if (ms < 60 * 60_000) {
    const totalSec = Math.ceil(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function getTopicCooldown(
  topic: TopicRef,
  difficulty: QuizDifficulty,
  now = Date.now(),
): { id: string; failCount: number; remainingMs: number; lockedUntil: string } | null {
  const id = badgeId(topic, difficulty);
  const entry = loadCooldowns()[id];
  if (!entry?.lockedUntil) return null;
  const until = Date.parse(entry.lockedUntil);
  if (!Number.isFinite(until)) return null;
  const remainingMs = until - now;
  if (remainingMs <= 0) return null;
  return {
    id,
    failCount: entry.failCount,
    remainingMs,
    lockedUntil: entry.lockedUntil,
  };
}

/** Record a non-perfect finish and start/extend the retry lock. */
export function recordTopicFail(
  topic: TopicRef,
  difficulty: QuizDifficulty,
  now = Date.now(),
): TopicCooldown {
  const id = badgeId(topic, difficulty);
  const map = loadCooldowns();
  const prev = map[id];
  const failCount = (prev?.failCount ?? 0) + 1;
  const wait = waitMsForFailCount(failCount);
  const next: TopicCooldown = {
    failCount,
    lockedUntil: new Date(now + wait).toISOString(),
  };
  map[id] = next;
  saveCooldowns(map);
  return next;
}

/** Clear the ladder after a perfect seal run. */
export function clearTopicCooldown(
  topic: TopicRef,
  difficulty: QuizDifficulty,
): void {
  const id = badgeId(topic, difficulty);
  const map = loadCooldowns();
  if (!map[id]) return;
  delete map[id];
  saveCooldowns(map);
}
