/**
 * Study dashboard badges — two catalogs:
 *   1. Assessment (daily Royal Assessment person-level ranks)
 *   2. Discover (age / empire trial seals)
 *
 * Only earned badges can be worn. Locked ones stay visible so the member
 * can read how to earn them.
 */

import { readJSON, writeJSON, STORAGE_KEYS } from "@/lib/storage";
import {
  LEVEL_TITLES,
  MAX_LEVEL_ID,
  personLevelNumber,
} from "./levels";
import {
  QUIZ_DIFFICULTIES,
  difficultySpec,
  listBadgeCatalog,
  parseBadgeId,
  type BadgeDef,
  type QuizDifficulty,
  type TopicRef,
} from "./topic";
import type { BadgeMap } from "./badges";

export type StudyBadgeKind = "assessment" | "discover";

export interface StudyBadge {
  id: string;
  kind: StudyBadgeKind;
  title: string;
  label: string;
  howTo: string;
  /** Person-level id 0–6 for Assessment ranks. */
  levelId?: number;
  /** Discover seal fields. */
  difficulty?: QuizDifficulty;
  topicTitle?: string;
}

export function assessmentBadgeId(levelId: number): string {
  return `assessment:level:${levelId}`;
}

export function parseAssessmentBadgeId(id: string): number | null {
  const prefix = "assessment:level:";
  if (!id.startsWith(prefix)) return null;
  const n = Number(id.slice(prefix.length));
  if (!Number.isInteger(n) || n < 0 || n > MAX_LEVEL_ID) return null;
  return n;
}

export function listAssessmentBadges(): StudyBadge[] {
  return Array.from({ length: MAX_LEVEL_ID + 1 }, (_, levelId) => {
    const title = LEVEL_TITLES[levelId] ?? LEVEL_TITLES[0];
    const n = personLevelNumber(levelId);
    return {
      id: assessmentBadgeId(levelId),
      kind: "assessment" as const,
      title,
      label: `Level ${n}`,
      howTo: `Reach Level ${n} (${title}) in the daily Royal Assessment by earning points.`,
      levelId,
    };
  });
}

export function listDiscoverStudyBadges(
  extraEmpires: string[] = [],
  extraTopics: TopicRef[] = [],
): StudyBadge[] {
  return listBadgeCatalog(extraEmpires, extraTopics).map((badge) =>
    discoverStudyBadge(badge),
  );
}

export function discoverStudyBadge(badge: BadgeDef): StudyBadge {
  const spec = difficultySpec(badge.difficulty);
  return {
    id: badge.id,
    kind: "discover",
    title: badge.topicTitle,
    label: spec.label,
    howTo: `Score 100% on the ${spec.label} trial of ${badge.topicTitle} on Discover.`,
    difficulty: badge.difficulty,
    topicTitle: badge.topicTitle,
  };
}

export function extraEmpireTopicsFromBadges(badges: BadgeMap): TopicRef[] {
  const extra: TopicRef[] = [];
  const seen = new Set<string>();
  for (const id of Object.keys(badges)) {
    const parsed = parseBadgeId(id);
    if (!parsed || parsed.kind !== "empire" || seen.has(parsed.topicId)) continue;
    seen.add(parsed.topicId);
    extra.push({
      kind: "empire",
      id: parsed.topicId,
      title: parsed.topicId,
    });
  }
  return extra;
}

export function isStudyBadgeEarned(
  badge: StudyBadge,
  levelId: number,
  seals: BadgeMap,
): boolean {
  if (badge.kind === "assessment") {
    return (badge.levelId ?? 0) <= levelId;
  }
  return !!seals[badge.id];
}

/** Highest Discover seal rank the member has earned, or null. */
export function highestDiscoverRank(seals: BadgeMap): QuizDifficulty | null {
  const earned = new Set<QuizDifficulty>();
  for (const id of Object.keys(seals)) {
    const parsed = parseBadgeId(id);
    if (parsed) earned.add(parsed.difficulty);
  }
  for (let i = QUIZ_DIFFICULTIES.length - 1; i >= 0; i--) {
    const id = QUIZ_DIFFICULTIES[i]!.id;
    if (earned.has(id)) return id;
  }
  return null;
}

export function discoverSealCounts(seals: BadgeMap, catalogSize: number): {
  earned: number;
  total: number;
} {
  let earned = 0;
  for (const id of Object.keys(seals)) {
    if (parseBadgeId(id)) earned += 1;
  }
  return { earned, total: catalogSize };
}

export function loadSelectedBadgeId(): string | null {
  const raw = readJSON<string | null>(STORAGE_KEYS.quizSelectedBadge, null);
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

export function saveSelectedBadgeId(id: string | null): void {
  writeJSON(STORAGE_KEYS.quizSelectedBadge, id);
}

/** Drop a worn badge that is no longer earned. */
export function sanitizeSelectedBadgeId(
  selectedId: string | null,
  levelId: number,
  seals: BadgeMap,
  catalog: StudyBadge[],
): string | null {
  if (!selectedId) return null;
  const badge = catalog.find((b) => b.id === selectedId);
  if (!badge || !isStudyBadgeEarned(badge, levelId, seals)) return null;
  return selectedId;
}

export function findStudyBadge(
  id: string | null,
  catalog: StudyBadge[],
): StudyBadge | null {
  if (!id) return null;
  return catalog.find((b) => b.id === id) ?? null;
}
