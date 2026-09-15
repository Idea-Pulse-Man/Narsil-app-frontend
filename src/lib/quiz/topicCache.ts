/**
 * Pre-built Discover trials (age / empire × difficulty).
 *
 * Warmed when the quiz pool is ready so tapping Apprentice opens saved
 * questions immediately instead of building on the cold path.
 */

import { useEffect, useMemo, useState } from "react";
import { historyEras, type Artwork } from "@/data";
import { hashString, mulberry32 } from "./random";
import type { ArtistIndex } from "./pool";
import type { QuizQuestion } from "./types";
import {
  QUIZ_DIFFICULTIES,
  MIN_TOPIC_QUESTIONS,
  buildTopicQuiz,
  filterTopicTargets,
  isTopicQuizPrepared,
  type QuizDifficulty,
  type TopicKind,
  type TopicRef,
} from "./topic";

export function topicQuizCacheKey(
  kind: TopicKind,
  topicId: string,
  difficulty: QuizDifficulty,
): string {
  return `${kind}:${topicId}:${difficulty}`;
}

type CacheEntry = {
  questions: QuizQuestion[];
  /** Pool fingerprint when this run was built. */
  fingerprint: string;
};

const cache = new Map<string, CacheEntry>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function poolFingerprint(pool: Artwork[]): string {
  // Length + a few ids is enough to know curated → live growth.
  const head = pool
    .slice(0, 8)
    .map((a) => a.id)
    .join(",");
  const tail = pool.length > 8 ? pool[pool.length - 1]?.id ?? "" : "";
  return `${pool.length}:${head}:${tail}`;
}

function seedFor(key: string, fingerprint: string): number {
  return hashString(`${key}|${fingerprint}`);
}

function listEmpireTopics(pool: Artwork[]): TopicRef[] {
  const names = new Set<string>();
  for (const art of pool) {
    if (art.empire?.trim()) names.add(art.empire.trim());
  }
  return Array.from(names)
    .sort()
    .map((name) => ({ kind: "empire" as const, id: name, title: name }));
}

function listAgeTopics(): TopicRef[] {
  return historyEras.map((era) => ({
    kind: "age" as const,
    id: era.id,
    title: era.title,
  }));
}

/**
 * Build (or refresh) every age/empire trial the current pool can support.
 * Safe to call often — skips keys whose fingerprint has not changed.
 */
export function warmTopicQuizCache(
  pool: Artwork[],
  artists?: ArtistIndex,
): void {
  if (pool.length === 0) return;
  const fingerprint = poolFingerprint(pool);
  const topics = [...listAgeTopics(), ...listEmpireTopics(pool)];
  let changed = false;

  for (const topic of topics) {
    if (!isTopicQuizPrepared(topic)) continue;
    const targets = filterTopicTargets(pool, topic);
    for (const spec of QUIZ_DIFFICULTIES) {
      const key = topicQuizCacheKey(topic.kind, topic.id, spec.id);
      const existing = cache.get(key);
      if (existing && existing.fingerprint === fingerprint) continue;

      const built = buildTopicQuiz(
        targets,
        pool,
        spec.id,
        mulberry32(seedFor(key, fingerprint)),
        artists,
        topic.kind,
      );
      if (built.length >= MIN_TOPIC_QUESTIONS) {
        cache.set(key, { questions: built, fingerprint });
        changed = true;
      } else if (existing) {
        cache.delete(key);
        changed = true;
      }
    }
  }

  if (changed) notify();
}

export function getCachedTopicQuiz(
  topic: TopicRef,
  difficulty: QuizDifficulty,
): QuizQuestion[] | null {
  const entry = cache.get(
    topicQuizCacheKey(topic.kind, topic.id, difficulty),
  );
  if (!entry || entry.questions.length < MIN_TOPIC_QUESTIONS) return null;
  // Return a shallow copy so a run can mutate selection state safely later.
  return entry.questions.map((q) => ({ ...q, options: [...q.options] }));
}

export function hasCachedTopicQuiz(
  topic: TopicRef,
  difficulty: QuizDifficulty,
): boolean {
  return getCachedTopicQuiz(topic, difficulty) != null;
}

/** Snapshot of which trials are ready (for Discover bars). */
export function listCachedTopicQuizKeys(): string[] {
  return Array.from(cache.keys()).filter((key) => {
    const entry = cache.get(key);
    return !!entry && entry.questions.length >= MIN_TOPIC_QUESTIONS;
  });
}

export function subscribeTopicQuizCache(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Keep the Discover trial cache warm from the live quiz pool.
 * Returns the set of ready `kind:id:difficulty` keys.
 */
export function useTopicQuizCache(
  pool: Artwork[],
  artists: ArtistIndex,
): ReadonlySet<string> {
  const [version, setVersion] = useState(0);

  useEffect(() => subscribeTopicQuizCache(() => setVersion((v) => v + 1)), []);

  useEffect(() => {
    warmTopicQuizCache(pool, artists);
  }, [pool, artists]);

  return useMemo(() => {
    void version;
    return new Set(listCachedTopicQuizKeys());
  }, [version, pool]);
}
