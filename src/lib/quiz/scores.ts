/**
 * Best star rating per topic trial. Stars update on every finished run;
 * seals (badges) still require a perfect score separately.
 */

import { useCallback, useEffect, useState } from "react";
import { STORAGE_KEYS, readJSON, writeJSON } from "@/lib/storage";
import { fetchQuizScores, upsertQuizScore } from "@/lib/quizRemote";
import type { QuizDifficulty, TopicRef } from "./topic";
import { badgeId } from "./topic";

export interface QuizScore {
  id: string;
  /** Best stars earned so far (0–5). */
  stars: number;
  score: number;
  total: number;
  updatedAt: string;
}

export type ScoreMap = Record<string, QuizScore>;

/** Map raw correct/total onto a 0–5 star rating. */
export function starsFromScore(score: number, total: number): number {
  if (total <= 0) return 0;
  const raw = Math.round((score / total) * 5);
  return Math.max(0, Math.min(5, raw));
}

export function loadScores(): ScoreMap {
  return readJSON<ScoreMap>(STORAGE_KEYS.quizScores, {});
}

function saveScores(map: ScoreMap): void {
  writeJSON(STORAGE_KEYS.quizScores, map);
}

/** Keep the higher star count when merging local + remote. */
export function mergeScores(local: ScoreMap, remote: ScoreMap): ScoreMap {
  const out: ScoreMap = { ...local };
  for (const [id, score] of Object.entries(remote)) {
    const existing = out[id];
    if (
      !existing ||
      score.stars > existing.stars ||
      (score.stars === existing.stars && score.updatedAt > existing.updatedAt)
    ) {
      out[id] = score;
    }
  }
  return out;
}

/**
 * Record a finished run. Only raises the stored best; a worse replay does
 * not overwrite stars.
 */
export function applyTopicScore(
  map: ScoreMap,
  topic: TopicRef,
  difficulty: QuizDifficulty,
  score: number,
  total: number,
): { map: ScoreMap; stars: number; bestStars: number; improved: boolean } {
  const id = badgeId(topic, difficulty);
  const stars = starsFromScore(score, total);
  const existing = map[id];
  if (existing && existing.stars >= stars) {
    return {
      map,
      stars,
      bestStars: existing.stars,
      improved: false,
    };
  }
  const next: ScoreMap = {
    ...map,
    [id]: {
      id,
      stars,
      score,
      total,
      updatedAt: new Date().toISOString(),
    },
  };
  return { map: next, stars, bestStars: stars, improved: true };
}

export function useQuizScores(userId?: string | null, refreshKey = 0) {
  const [scores, setScores] = useState<ScoreMap>({});

  useEffect(() => {
    setScores(loadScores());
  }, [refreshKey]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const remote = await fetchQuizScores();
      if (cancelled || !remote) return;
      const local = loadScores();
      const merged = mergeScores(local, remote);
      saveScores(merged);
      setScores(merged);
      for (const [id, score] of Object.entries(local)) {
        const r = remote[id];
        if (!r || score.stars > r.stars) {
          void upsertQuizScore(id, score.stars, score.score, score.total, score.updatedAt);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  const recordScore = useCallback(
    (
      topic: TopicRef,
      difficulty: QuizDifficulty,
      score: number,
      total: number,
    ) => {
      const current = loadScores();
      const result = applyTopicScore(current, topic, difficulty, score, total);
      if (result.improved) {
        saveScores(result.map);
        const saved = result.map[badgeId(topic, difficulty)];
        if (saved) {
          void upsertQuizScore(
            saved.id,
            saved.stars,
            saved.score,
            saved.total,
            saved.updatedAt,
          );
        }
      }
      setScores(result.map);
      return result;
    },
    [],
  );

  return { scores, recordScore };
}
