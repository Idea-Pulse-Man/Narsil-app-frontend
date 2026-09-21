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
 * Seal catalog on the profile. Only passed ages / empires get a line, each
 * showing the highest rank earned; the rest stay behind "Browse all trials".
 * Every line expands to its Apprentice → Master medals.
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
  for (const id of Object.keys(badges)) {
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

  const passed = groups.filter(
    (g) => highestEarnedDifficulty(g.badges, badges) !== null,
  );
  const locked = groups.filter(
    (g) => highestEarnedDifficulty(g.badges, badges) === null,
  );
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
        Trials you have passed, with your highest rank. Expand a line for its
        seals and stars.
      </p>

      <div className="mt-3 divide-y divide-white/[0.06] rounded-2xl border border-white/10 bg-white/[0.03]">
        {passed.length > 0 ? (
          passed.map(renderRow)
        ) : (
          <p className="px-3 py-3 text-xs text-white/45">
            No seals yet — perfect a trial on Discover to light your first one.
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
  const summary = highest ? difficultySpec(highest).label : "Not started";
  const summaryBadge = highest
    ? badges.find((b) => b.difficulty === highest)
    : null;

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
              unlocked
              mark={title}
              size={22}
            />
          )}
          <span
            className={`text-[11px] ${
              highest ? "text-amber-200/90" : "text-white/35"
            }`}
          >
            {summary}
          </span>
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
