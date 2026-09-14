/**
 * Age / empire quizzes — three difficulties, badge on a perfect score.
 *
 * Questions are built from works that belong to the chosen age or empire;
 * distractors come from the full catalog so a small era still has wrong
 * answers. Completing a harder trial awards a higher-level seal; anything
 * short of 100% awards nothing.
 */

import { historyEras, eraForArtwork, type Artwork } from "@/data";
import type { QuizMode, QuizQuestion } from "./types";
import { buildQuestion } from "./generator";
import { isEligible, type ArtistIndex } from "./pool";
import { shuffle, type Rng } from "./random";

export type QuizDifficulty = "apprentice" | "scholar" | "master";
export type TopicKind = "age" | "empire";

export interface TopicRef {
  kind: TopicKind;
  id: string;
  title: string;
}

export interface TopicQuizLaunch extends TopicRef {
  difficulty: QuizDifficulty;
}

export interface DifficultySpec {
  id: QuizDifficulty;
  /** Court rank shown on the medal. */
  label: string;
  rank: 1 | 2 | 3;
  questionCount: number;
  modes: QuizMode[];
}

/**
 * Empires always listed in the badge case (grayed until unlocked), matching
 * the personalize-your-museum civilisation list.
 */
export const CANONICAL_EMPIRES = [
  "Roman",
  "Greek",
  "Egyptian",
  "Chinese",
  "Japanese",
  "Indian",
  "Mesoamerican",
  "Persian",
  "Byzantine",
] as const;

export const QUIZ_DIFFICULTIES: DifficultySpec[] = [
  {
    id: "apprentice",
    label: "Apprentice",
    rank: 1,
    questionCount: 5,
    modes: ["what", "who", "subject", "where"],
  },
  {
    id: "scholar",
    label: "Scholar",
    rank: 2,
    questionCount: 7,
    modes: ["what", "who", "medium", "period", "museum"],
  },
  {
    id: "master",
    label: "Master",
    rank: 3,
    questionCount: 10,
    modes: ["who", "age", "period", "medium", "museum"],
  },
];

export const MIN_TOPIC_QUESTIONS = 3;

export function difficultySpec(id: QuizDifficulty): DifficultySpec {
  return QUIZ_DIFFICULTIES.find((d) => d.id === id) ?? QUIZ_DIFFICULTIES[0]!;
}

export function badgeId(topic: TopicRef, difficulty: QuizDifficulty): string {
  return `${topic.kind}:${topic.id}:${difficulty}`;
}

export function parseBadgeId(
  id: string,
): { kind: TopicKind; topicId: string; difficulty: QuizDifficulty } | null {
  const kindEnd = id.indexOf(":");
  const diffStart = id.lastIndexOf(":");
  if (kindEnd < 0 || diffStart <= kindEnd) return null;
  const kind = id.slice(0, kindEnd);
  const difficulty = id.slice(diffStart + 1);
  const topicId = id.slice(kindEnd + 1, diffStart);
  if (
    (kind !== "age" && kind !== "empire") ||
    !QUIZ_DIFFICULTIES.some((d) => d.id === difficulty) ||
    !topicId
  ) {
    return null;
  }
  return { kind, topicId, difficulty: difficulty as QuizDifficulty };
}

/** Flawless run — the only way a seal is granted. */
export function earnsBadge(score: number, total: number): boolean {
  return total > 0 && score === total;
}

export function filterTopicTargets(
  pool: Artwork[],
  topic: TopicRef,
): Artwork[] {
  if (topic.kind === "empire") {
    return pool.filter((art) => art.empire === topic.id && !!art.image);
  }
  const era = historyEras.find((e) => e.id === topic.id);
  const pinned = new Set(era?.artworkIds ?? []);
  return pool.filter((art) => {
    if (!art.image) return false;
    if (pinned.has(art.id)) return true;
    return eraForArtwork(art)?.id === topic.id;
  });
}

function modesFor(spec: DifficultySpec, kind: TopicKind): QuizMode[] {
  // Origin is free points on an empire trial (the answer is the empire).
  if (kind === "empire") return spec.modes.filter((m) => m !== "where");
  return spec.modes;
}

export function buildTopicQuiz(
  targets: Artwork[],
  fullPool: Artwork[],
  difficulty: QuizDifficulty,
  rng: Rng,
  artists?: ArtistIndex,
  kind: TopicKind = "age",
): QuizQuestion[] {
  const spec = difficultySpec(difficulty);
  const modes = modesFor(spec, kind);
  const used = new Set<string>();
  const questions: QuizQuestion[] = [];

  for (let slot = 0; slot < spec.questionCount; slot++) {
    const order = shuffle(modes, rng);
    let built: QuizQuestion | null = null;
    for (const mode of order) {
      const candidates = shuffle(
        targets.filter(
          (art) => !used.has(art.id) && isEligible(art, mode, artists),
        ),
        rng,
      );
      for (const target of candidates) {
        const question = buildQuestion(mode, target, fullPool, rng, artists);
        if (question) {
          built = {
            ...question,
            id: `topic:${kind}:${difficulty}:${slot}:${target.id}:${mode}`,
          };
          used.add(target.id);
          break;
        }
      }
      if (built) break;
    }
    if (!built) break;
    questions.push(built);
  }

  return questions;
}

/** How many questions this difficulty can actually produce from `targets`. */
export function topicQuizCapacity(
  targets: Artwork[],
  _fullPool: Artwork[],
  difficulty: QuizDifficulty,
  artists?: ArtistIndex,
  kind: TopicKind = "age",
): number {
  // Cheap upper bound: unique works that can host at least one mode.
  const spec = difficultySpec(difficulty);
  const modes = modesFor(spec, kind);
  let eligible = 0;
  for (const art of targets) {
    if (modes.some((mode) => isEligible(art, mode, artists))) eligible += 1;
  }
  return Math.min(eligible, spec.questionCount);
}

export function canPlayTopicQuiz(
  targets: Artwork[],
  fullPool: Artwork[],
  difficulty: QuizDifficulty,
  artists?: ArtistIndex,
  kind: TopicKind = "age",
): boolean {
  const spec = difficultySpec(difficulty);
  return (
    topicQuizCapacity(targets, fullPool, difficulty, artists, kind) >=
    spec.questionCount
  );
}

/** Free plan may only trial Ancient Egypt — everything else needs Pro. */
export const FREE_TOPIC: TopicRef = {
  kind: "age",
  id: "ancient-egypt",
  title: "Ancient Egypt",
};

export function isFreeTopic(topic: TopicRef): boolean {
  return topic.kind === FREE_TOPIC.kind && topic.id === FREE_TOPIC.id;
}

/** Difficulty that must be sealed before this one unlocks (null = first). */
export function priorDifficulty(
  difficulty: QuizDifficulty,
): QuizDifficulty | null {
  const i = QUIZ_DIFFICULTIES.findIndex((d) => d.id === difficulty);
  if (i <= 0) return null;
  return QUIZ_DIFFICULTIES[i - 1]!.id;
}

export type TopicQuizAccess =
  | { status: "playable" }
  | { status: "insufficient" }
  | { status: "need_prior"; prior: QuizDifficulty }
  | { status: "need_pro" };

/**
 * Free users: only Ancient Egypt, and only after sealing the prior rank.
 * Pro users: any age/empire, still progressive Apprentice → Scholar → Master.
 * Non-Egypt topics always surface the Pro gate for free members (even if the
 * pool is still thin) so tapping opens the subscription sheet.
 */
export function accessTopicQuiz(
  topic: TopicRef,
  difficulty: QuizDifficulty,
  unlockedIds: ReadonlySet<string>,
  isPro: boolean,
  poolReady: boolean,
): TopicQuizAccess {
  if (!isPro && !isFreeTopic(topic)) return { status: "need_pro" };
  if (!poolReady) return { status: "insufficient" };
  const prior = priorDifficulty(difficulty);
  if (prior && !unlockedIds.has(badgeId(topic, prior))) {
    return { status: "need_prior", prior };
  }
  return { status: "playable" };
}

export interface BadgeDef {
  id: string;
  kind: TopicKind;
  topicId: string;
  topicTitle: string;
  difficulty: QuizDifficulty;
  rank: 1 | 2 | 3;
  label: string;
}

function defsForTopic(topic: TopicRef): BadgeDef[] {
  return QUIZ_DIFFICULTIES.map((d) => ({
    id: badgeId(topic, d.id),
    kind: topic.kind,
    topicId: topic.id,
    topicTitle: topic.title,
    difficulty: d.id,
    rank: d.rank,
    label: d.label,
  }));
}

function uniqueEmpires(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of [...CANONICAL_EMPIRES, ...names]) {
    const trimmed = name.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Every seal the profile should show: all ages, canonical empires, plus any
 * extra empires from the live catalog (or already-unlocked ids).
 */
export function listBadgeCatalog(
  extraEmpires: string[] = [],
  extraTopics: TopicRef[] = [],
): BadgeDef[] {
  const ages = historyEras.flatMap((era) =>
    defsForTopic({ kind: "age", id: era.id, title: era.title }),
  );
  const empires = uniqueEmpires(extraEmpires).flatMap((name) =>
    defsForTopic({ kind: "empire", id: name, title: name }),
  );
  const known = new Set(empires.map((b) => b.topicId));
  const extras = extraTopics
    .filter((t) => t.kind === "empire" && !known.has(t.id))
    .flatMap((t) => defsForTopic(t));
  return [...ages, ...empires, ...extras];
}

export function groupBadgesByTopic(badges: BadgeDef[]): {
  topic: TopicRef;
  badges: BadgeDef[];
}[] {
  const groups: { topic: TopicRef; badges: BadgeDef[] }[] = [];
  const index = new Map<string, number>();
  for (const badge of badges) {
    const key = `${badge.kind}:${badge.topicId}`;
    let i = index.get(key);
    if (i === undefined) {
      i = groups.length;
      index.set(key, i);
      groups.push({
        topic: {
          kind: badge.kind,
          id: badge.topicId,
          title: badge.topicTitle,
        },
        badges: [],
      });
    }
    groups[i]!.badges.push(badge);
  }
  return groups;
}
