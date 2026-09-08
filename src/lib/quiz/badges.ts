/**
 * Topic-quiz seals. LocalStorage is instant; signed-in users also sync via
 * quizRemote so a perfect score follows the account.
 */

import { useCallback, useEffect, useState } from "react";
import { STORAGE_KEYS, readJSON, writeJSON } from "@/lib/storage";
import { fetchQuizBadges, upsertQuizBadge } from "@/lib/quizRemote";
import type { QuizDifficulty, TopicRef } from "./topic";
import { badgeId, earnsBadge } from "./topic";

export interface UnlockedBadge {
  id: string;
  unlockedAt: string;
}

export type BadgeMap = Record<string, UnlockedBadge>;

export function loadBadges(): BadgeMap {
  return readJSON<BadgeMap>(STORAGE_KEYS.quizBadges, {});
}

function saveBadges(map: BadgeMap): void {
  writeJSON(STORAGE_KEYS.quizBadges, map);
}

export function isBadgeUnlocked(map: BadgeMap, id: string): boolean {
  return !!map[id];
}

export function mergeBadges(local: BadgeMap, remote: BadgeMap): BadgeMap {
  const out: BadgeMap = { ...local };
  for (const [id, badge] of Object.entries(remote)) {
    const existing = out[id];
    if (!existing || badge.unlockedAt < existing.unlockedAt) {
      out[id] = badge;
    }
  }
  return out;
}

function grant(map: BadgeMap, id: string): { map: BadgeMap; newly: boolean } {
  if (map[id]) return { map, newly: false };
  const next = {
    ...map,
    [id]: { id, unlockedAt: new Date().toISOString() },
  };
  return { map: next, newly: true };
}

/**
 * Persist a seal only on a perfect score. Replays of an already-earned trial
 * do not revoke or restamp it.
 */
export function applyTopicResult(
  map: BadgeMap,
  topic: TopicRef,
  difficulty: QuizDifficulty,
  score: number,
  total: number,
): { map: BadgeMap; unlocked: boolean; badgeId: string } {
  const id = badgeId(topic, difficulty);
  if (!earnsBadge(score, total)) {
    return { map, unlocked: false, badgeId: id };
  }
  const { map: next, newly } = grant(map, id);
  return { map: next, unlocked: newly, badgeId: id };
}

export function useQuizBadges(userId?: string | null, refreshKey = 0) {
  const [badges, setBadges] = useState<BadgeMap>({});

  useEffect(() => {
    setBadges(loadBadges());
  }, [refreshKey]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    void (async () => {
      const remote = await fetchQuizBadges();
      if (cancelled || !remote) return;
      const local = loadBadges();
      const merged = mergeBadges(local, remote);
      saveBadges(merged);
      setBadges(merged);
      for (const [id, badge] of Object.entries(local)) {
        if (!remote[id]) void upsertQuizBadge(id, badge.unlockedAt);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, refreshKey]);

  const recordResult = useCallback(
    (
      topic: TopicRef,
      difficulty: QuizDifficulty,
      score: number,
      total: number,
    ) => {
      const current = loadBadges();
      const result = applyTopicResult(
        current,
        topic,
        difficulty,
        score,
        total,
      );
      if (result.unlocked) {
        saveBadges(result.map);
        const granted = result.map[result.badgeId];
        if (granted) void upsertQuizBadge(result.badgeId, granted.unlockedAt);
      }
      setBadges(result.map);
      return result;
    },
    [],
  );

  return { badges, recordResult };
}
