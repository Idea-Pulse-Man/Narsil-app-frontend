import { useState } from "react";
import {
  QUIZ_DIFFICULTIES,
  difficultySpec,
  groupBadgesByTopic,
  listBadgeCatalog,
  parseBadgeId,
  type BadgeDef,
  type BadgeMap,
  type QuizDifficulty,
  type ScoreMap,
  type TopicRef,
} from "@/lib/quiz";
import { WORLD } from "@/data/worldCopy";
import TopicMedal from "./TopicMedal";
import QuizStars from "./QuizStars";
import { ChevronDownIcon } from "./Icons";

interface BadgeCaseProps {
  badges: BadgeMap;
  scores?: ScoreMap;
  extraEmpires?: string[];
}

/**
 * Seal catalog on the profile. Trials with a seal or star progress get a
 * line (highest seal, or best attempt); the rest stay behind "Browse all".
 */
export default function BadgeCase({
  badges,
  scores = {},
  extraEmpires = [],
}: BadgeCaseProps) {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const extraTopics: TopicRef[] = [];
  const seen = new Set(extraEmpires);
  for (const id of [...Object.keys(badges), ...Object.keys(scores)]) {
    const parsed = parseBadgeId(id);
    if (!parsed || parsed.kind !== "empire" || seen.has(parsed.topicId)) continue;
    seen.add(parsed.topicId);
    extraTopics.push({
      kind: "empire",
      id: parsed.topicId,
      title: parsed.topicId,
    });
  }
  const catalog = listBadgeCatalog(extraEmpires, extraTopics);
  const groups = groupBadgesByTopic(catalog);
  const earned = catalog.filter((b) => badges[b.id]).length;

  const withProgress = groups.filter((g) => topicHasProgress(g.badges, badges, scores));
  const locked = groups.filter((g) => !topicHasProgress(g.badges, badges, scores));
  const lockedAges = locked.filter((g) => g.topic.kind === "age");
  const lockedEmpires = locked.filter((g) => g.topic.kind === "empire");

  const renderRow = (group: (typeof groups)[number]) => {
    const key = `${group.topic.kind}:${group.topic.id}`;
    return (
      <TopicAccordion
        key={key}
        title={group.topic.title}
        badges={group.badges}
        unlocked={badges}
        scores={scores}
        open={openKey === key}
        onToggle={() => setOpenKey((cur) => (cur === key ? null : key))}
      />
    );
  };

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg text-white">{WORLD.seals}</h2>
        <p className="text-[11px] tabular-nums text-white/40">
          {earned} / {catalog.length}
        </p>
      </div>
      <p className="mt-1 text-xs text-white/45">
        Trials you have played, with your highest seal or best stars. Expand
        for every rank.
      </p>

      <div className="mt-3 divide-y divide-white/[0.06] rounded-2xl border border-white/10 bg-white/[0.03]">
        {withProgress.length > 0 ? (
          withProgress.map(renderRow)
        ) : (
          <p className="px-3 py-3 text-xs text-white/45">
            No trials yet — play on Discover to earn stars and light seals.
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={() => setShowAll((v) => !v)}
        aria-expanded={showAll}
        className="mt-2 flex w-full items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.05]"
      >
        <span className="min-w-0 flex-1 truncate text-[13px] text-white/70">
          Browse all trials
        </span>
        <span className="shrink-0 text-[11px] tabular-nums text-white/35">
          {locked.length} locked
        </span>
        <ChevronDownIcon
          className={`h-3.5 w-3.5 shrink-0 text-white/35 transition-transform ${
            showAll ? "rotate-180" : ""
          }`}
        />
      </button>

      {showAll && (
        <>
          {lockedAges.length > 0 && (
            <>
              <h3 className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Ages
              </h3>
              <div className="mt-1.5 divide-y divide-white/[0.06] rounded-2xl border border-white/10 bg-white/[0.03]">
                {lockedAges.map(renderRow)}
              </div>
            </>
          )}

          {lockedEmpires.length > 0 && (
            <>
              <h3 className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                Empires
              </h3>
              <div className="mt-1.5 divide-y divide-white/[0.06] rounded-2xl border border-white/10 bg-white/[0.03]">
                {lockedEmpires.map(renderRow)}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}

function highestEarnedDifficulty(
  badges: BadgeDef[],
  unlocked: BadgeMap,
): QuizDifficulty | null {
  let best: QuizDifficulty | null = null;
  let bestRank = 0;
  for (const badge of badges) {
    if (!unlocked[badge.id]) continue;
    const rank = difficultySpec(badge.difficulty).rank;
    if (rank > bestRank) {
      bestRank = rank;
      best = badge.difficulty;
    }
  }
  return best;
}

/** Best non-zero star attempt across the topic's ranks (even without a seal). */
function bestAttempt(
  badges: BadgeDef[],
  scores: ScoreMap,
): { difficulty: QuizDifficulty; stars: number } | null {
  let best: { difficulty: QuizDifficulty; stars: number } | null = null;
  for (const badge of badges) {
    const stars = scores[badge.id]?.stars ?? 0;
    if (stars <= 0) continue;
    if (
      !best ||
      stars > best.stars ||
      (stars === best.stars &&
        difficultySpec(badge.difficulty).rank > difficultySpec(best.difficulty).rank)
    ) {
      best = { difficulty: badge.difficulty, stars };
    }
  }
  return best;
}

function topicHasProgress(
  badges: BadgeDef[],
  unlocked: BadgeMap,
  scores: ScoreMap,
): boolean {
  return (
    highestEarnedDifficulty(badges, unlocked) !== null ||
    bestAttempt(badges, scores) !== null
  );
}

function TopicAccordion({
  title,
  badges,
  unlocked,
  scores,
  open,
  onToggle,
}: {
  title: string;
  badges: BadgeDef[];
  unlocked: BadgeMap;
  scores: ScoreMap;
  open: boolean;
  onToggle: () => void;
}) {
  const highest = highestEarnedDifficulty(badges, unlocked);
  const attempt = bestAttempt(badges, scores);
  const summaryBadge = highest
    ? badges.find((b) => b.difficulty === highest)
    : attempt
      ? badges.find((b) => b.difficulty === attempt.difficulty)
      : null;

  let summary = "Not started";
  let summaryTone = "text-white/35";
  if (highest) {
    const label = difficultySpec(highest).label;
    const stars = scores[summaryBadge?.id ?? ""]?.stars ?? 0;
    summary = stars > 0 ? `${label} · ${stars}★` : label;
    summaryTone = "text-amber-200/90";
  } else if (attempt) {
    summary = `${difficultySpec(attempt.difficulty).label} · ${attempt.stars}★`;
    summaryTone = "text-amber-200/70";
  }

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
      >
        <p className="min-w-0 flex-1 truncate text-[13px] text-white/85">
          {title}
        </p>
        <span className="flex shrink-0 items-center gap-2">
          {summaryBadge && (
            <TopicMedal
              difficulty={summaryBadge.difficulty}
              unlocked={!!highest}
              gated={!highest}
              mark={title}
              size={22}
            />
          )}
          <span className={`text-[11px] ${summaryTone}`}>{summary}</span>
          <ChevronDownIcon
            className={`h-3.5 w-3.5 text-white/35 transition-transform ${
              open ? "rotate-180" : ""
            }`}
          />
        </span>
      </button>

      {open && (
        <div className="flex items-center justify-end gap-3 px-3 pb-3 pt-0.5">
          {QUIZ_DIFFICULTIES.map((spec) => {
            const badge = badges.find((b) => b.difficulty === spec.id);
            if (!badge) return null;
            const on = !!unlocked[badge.id];
            const stars = scores[badge.id]?.stars ?? 0;
            return (
              <span
                key={badge.id}
                className="flex flex-col items-center gap-0.5"
                title={`${spec.label}${on ? " — earned" : " — locked"} · ${stars}/5 stars`}
              >
                <TopicMedal
                  difficulty={badge.difficulty}
                  unlocked={on}
                  gated={!on}
                  mark={title}
                  size={34}
                />
                <span className="text-[9px] text-white/40">{spec.label}</span>
                <QuizStars stars={stars} size={7} />
                <span className="sr-only">
                  {title} {spec.label}
                  {on ? ", earned" : ", locked"}, {stars} of 5 stars
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
