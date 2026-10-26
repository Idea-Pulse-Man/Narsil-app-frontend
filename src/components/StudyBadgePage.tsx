import { useMemo, useState } from "react";
import {
  QUIZ_DIFFICULTIES,
  difficultySpec,
  extraEmpireTopicsFromBadges,
  findStudyBadge,
  highestDiscoverRank,
  isStudyBadgeEarned,
  listAssessmentBadges,
  listDiscoverStudyBadges,
  loadSelectedBadgeId,
  parseBadgeId,
  saveSelectedBadgeId,
  sanitizeSelectedBadgeId,
  type BadgeMap,
  type QuizDifficulty,
  type ScoreMap,
  type StudyBadge,
  type StudyBadgeKind,
} from "@/lib/quiz";
import { WORLD } from "@/data/worldCopy";
import { useCatalog } from "@/data/catalog";
import { scrollForLevel, scrollPalette, type ScrollInk } from "@/lib/quiz/scrolls";
import PersonLevelFrame from "./PersonLevelFrame";
import TopicMedal from "./TopicMedal";
import CardArt from "./CardArt";
import { CARD_TONE, STUDY_ART } from "@/lib/quiz/cardArt";
import QuizStars from "./QuizStars";
import QuizScrollFrame from "./QuizScrollFrame";
import { ArrowLeftIcon } from "./Icons";

interface StudyBadgePageProps {
  levelId: number;
  seals: BadgeMap;
  scores?: ScoreMap;
  onBack: () => void;
  onSelectionChange?: (id: string | null) => void;
}

/**
 * Full badge case on Study: Assessment ranks + Discover seals.
 * Unearned badges stay white and cannot be worn; tap still explains how.
 */
export default function StudyBadgePage({
  levelId,
  seals,
  scores = {},
  onBack,
  onSelectionChange,
}: StudyBadgePageProps) {
  const { searchFacets } = useCatalog();
  const extraTopics = useMemo(
    () => extraEmpireTopicsFromBadges(seals),
    [seals],
  );
  const assessment = useMemo(() => listAssessmentBadges(), []);
  const discover = useMemo(
    () => listDiscoverStudyBadges(searchFacets.empires, extraTopics),
    [searchFacets.empires, extraTopics],
  );
  const catalog = useMemo(
    () => [...assessment, ...discover],
    [assessment, discover],
  );

  const [kind, setKind] = useState<StudyBadgeKind>("assessment");
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    sanitizeSelectedBadgeId(loadSelectedBadgeId(), levelId, seals, catalog),
  );
  const [focusId, setFocusId] = useState<string | null>(selectedId);

  const focused = findStudyBadge(focusId, catalog);
  const list = kind === "assessment" ? assessment : discover;
  const { heading, muted, box } = scrollPalette(scrollForLevel(levelId).ink);

  return (
    <QuizScrollFrame
      levelId={levelId}
      footer={
        focused ? (
          <BadgeDetail
            badge={focused}
            earned={isStudyBadgeEarned(focused, levelId, seals)}
            worn={selectedId === focused.id}
            scores={scores}
            onWear={() => {
              if (!isStudyBadgeEarned(focused, levelId, seals)) return;
              saveSelectedBadgeId(focused.id);
              setSelectedId(focused.id);
              onSelectionChange?.(focused.id);
            }}
          />
        ) : undefined
      }
    >
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to Study"
        className={`relative mb-3 flex h-9 w-9 items-center justify-center rounded-full border ${box} ${heading} after:absolute after:-inset-2 after:content-['']`}
      >
        <ArrowLeftIcon className="h-4 w-4" />
      </button>

      <h1 className={`font-serif text-[28px] leading-tight ${heading}`}>
        {WORLD.studyBadges}
      </h1>
      <p className={`mt-1 text-sm ${muted}`}>
        Wear one earned badge as your profile avatar frame. Locked ranks stay
        white until you earn them.
      </p>

      <div className="mt-4 flex gap-1 rounded-full border border-[#5c3d12]/35 bg-[#efe2c4]/80 p-0.5">
        {(
          [
            { id: "assessment", label: WORLD.studyAssessmentBadges },
            { id: "discover", label: WORLD.studyDiscoverBadges },
          ] as { id: StudyBadgeKind; label: string }[]
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setKind(tab.id)}
            className={`flex-1 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
              kind === tab.id
                ? "bg-[#2a1c0c] text-[#f6ead0]"
                : "text-[#4a3014]"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {list.map((badge) => {
          const earned = isStudyBadgeEarned(badge, levelId, seals);
          const worn = selectedId === badge.id;
          const focusedHere = focusId === badge.id;
          return (
            <button
              key={badge.id}
              type="button"
              onClick={() => setFocusId(badge.id)}
              className={`flex flex-col items-center gap-1 rounded-xl border px-1.5 py-2.5 ${
                worn
                  ? "border-[#a8841a] bg-[#c9a227]/25"
                  : focusedHere
                    ? "border-[#5c3d12]/70 bg-[#f5ead2]"
                    : "border-[#5c3d12]/30 bg-[#efe2c4]/70"
              }`}
            >
              <StudyBadgeMark badge={badge} earned={earned} size={44} />
              <span className="line-clamp-2 text-center text-[11px] font-medium leading-tight text-[#1a1208]">
                {badge.kind === "assessment" ? badge.title : badge.label}
              </span>
              {badge.kind === "discover" && (
                <span className="line-clamp-1 text-center text-[11px] text-[#4a3014]">
                  {badge.title}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </QuizScrollFrame>
  );
}

function BadgeDetail({
  badge,
  earned,
  worn,
  scores,
  onWear,
}: {
  badge: StudyBadge;
  earned: boolean;
  worn: boolean;
  scores: ScoreMap;
  onWear: () => void;
}) {
  const stars =
    badge.kind === "discover" ? (scores[badge.id]?.stars ?? 0) : null;

  return (
    <div className="relative px-[13%] pb-1 pt-1">
      <div className="rounded-2xl border border-[#5c3d12]/40 bg-[#f5ead2]/95 px-4 py-3 text-[#1a1208]">
        <p className="font-serif text-lg leading-tight">
          {badge.title}
          {badge.kind === "discover" ? ` · ${badge.label}` : ""}
        </p>
        {stars != null && (
          <QuizStars stars={stars} size={12} className="mt-1" />
        )}
        <p className="mt-1.5 text-[12px] leading-relaxed text-[#3d2810]">
          {earned ? (worn ? "This badge frames your profile avatar." : WORLD.studyWearBadge) : badge.howTo}
        </p>
        <button
          type="button"
          disabled={!earned || worn}
          onClick={onWear}
          className="mt-2.5 w-full rounded-xl bg-[#2a1c0c] py-2.5 text-sm font-semibold text-[#f6ead0] disabled:opacity-40"
        >
          {worn ? "Wearing" : earned ? WORLD.studyWearBadge : WORLD.studyBadgeLocked}
        </button>
      </div>
    </div>
  );
}

export function StudyBadgeMark({
  badge,
  earned,
  size = 44,
}: {
  badge: StudyBadge;
  earned: boolean;
  size?: number;
}) {
  if (badge.kind === "assessment") {
    return (
      <PersonLevelFrame
        levelId={badge.levelId ?? 0}
        size={size}
        unlocked={earned}
      />
    );
  }
  return (
    <TopicMedal
      difficulty={badge.difficulty ?? "apprentice"}
      unlocked={earned}
      gated={!earned}
      mark={badge.topicTitle ?? badge.title}
      size={size}
      lockedWhite
    />
  );
}

export function DiscoverLevelCard({
  seals,
  catalogSize,
  ink,
  onOpenBadges,
}: {
  seals: BadgeMap;
  catalogSize: number;
  ink: ScrollInk;
  onOpenBadges: () => void;
}) {
  const { heading, muted, label } = scrollPalette(ink);
  const rank = highestDiscoverRank(seals);
  const rankLabel = rank ? difficultySpec(rank).label : null;
  let earned = 0;
  for (const id of Object.keys(seals)) {
    if (parseBadgeId(id)) earned += 1;
  }

  return (
    <button
      type="button"
      onClick={onOpenBadges}
      className={`relative mt-4 w-full overflow-hidden rounded-xl border px-3 py-3 text-left ${CARD_TONE[ink].card}`}
    >
      <CardArt art={STUDY_ART.discover} ink={ink} />
      <div className="relative">
        <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${label}`}>
          {WORLD.studyDiscoverRank}
        </p>
        <p className={`mt-1 font-serif text-lg ${heading}`}>
          {rankLabel ? `${rankLabel} rank` : "Unranked"}
        </p>
        <p className={`mt-0.5 text-[12px] ${muted}`}>
          {rankLabel
            ? `${earned} / ${catalogSize} seals · best Discover trial`
            : WORLD.studyNoDiscoverRank}
        </p>
        <div className="mt-2.5 flex items-center gap-2">
          {QUIZ_DIFFICULTIES.map((spec) => {
            const on = Object.keys(seals).some((id) => {
              const parsed = parseBadgeId(id);
              return parsed?.difficulty === spec.id;
            });
            return (
              <span key={spec.id} className="flex flex-col items-center gap-0.5">
                <TopicMedal
                  difficulty={spec.id as QuizDifficulty}
                  unlocked={on}
                  gated={!on}
                  mark={spec.label}
                  size={28}
                  lockedWhite
                />
                <span className={`text-[11px] ${muted}`}>{spec.label}</span>
              </span>
            );
          })}
        </div>
      </div>
    </button>
  );
}
