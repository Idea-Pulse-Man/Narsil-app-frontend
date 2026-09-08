import {
  QUIZ_DIFFICULTIES,
  badgeId,
  canPlayTopicQuiz,
  type QuizDifficulty,
  type TopicRef,
  type TopicQuizLaunch,
} from "@/lib/quiz";
import type { Artist, Artwork } from "@/data";
import { WORLD } from "@/data/worldCopy";
import TopicMedal from "./TopicMedal";

interface TopicQuizBarProps {
  topic: TopicRef;
  targets: Artwork[];
  pool: Artwork[];
  artists: Record<string, Artist>;
  unlockedIds: ReadonlySet<string>;
  onPlay: (launch: TopicQuizLaunch) => void;
}

/**
 * Three difficulty trials for one age or empire. Each medal is visible;
 * color lands only after a perfect score on that difficulty.
 */
export default function TopicQuizBar({
  topic,
  targets,
  pool,
  artists,
  unlockedIds,
  onPlay,
}: TopicQuizBarProps) {
  const title =
    topic.kind === "empire" ? WORLD.empireTrial : WORLD.ageTrial;

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-serif text-[15px] text-white">{title}</p>
        <p className="text-[10px] text-white/40">{WORLD.trialHint}</p>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {QUIZ_DIFFICULTIES.map((spec) => {
          const unlocked = unlockedIds.has(badgeId(topic, spec.id));
          const playable = canPlayTopicQuiz(
            targets,
            pool,
            spec.id,
            artists,
            topic.kind,
          );
          return (
            <DifficultyButton
              key={spec.id}
              topic={topic}
              difficulty={spec.id}
              label={spec.label}
              unlocked={unlocked}
              playable={playable}
              onPlay={onPlay}
            />
          );
        })}
      </div>
    </div>
  );
}

function DifficultyButton({
  topic,
  difficulty,
  label,
  unlocked,
  playable,
  onPlay,
}: {
  topic: TopicRef;
  difficulty: QuizDifficulty;
  label: string;
  unlocked: boolean;
  playable: boolean;
  onPlay: (launch: TopicQuizLaunch) => void;
}) {
  return (
    <button
      type="button"
      disabled={!playable}
      title={playable ? `${label} trial` : "Not enough works in this collection yet"}
      onClick={() =>
        onPlay({
          kind: topic.kind,
          id: topic.id,
          title: topic.title,
          difficulty,
        })
      }
      className={`flex flex-col items-center gap-1.5 rounded-xl border px-1.5 py-2.5 text-center transition-colors disabled:opacity-40 ${
        unlocked
          ? "border-amber-300/30 bg-amber-300/[0.08] hover:border-amber-300/50"
          : "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
      }`}
    >
      <TopicMedal
        difficulty={difficulty}
        unlocked={unlocked}
        mark={topic.title}
        size={36}
      />
      <span
        className={`text-[10px] font-medium leading-tight ${
          unlocked ? "text-amber-100" : "text-white/60"
        }`}
      >
        {label}
      </span>
    </button>
  );
}
