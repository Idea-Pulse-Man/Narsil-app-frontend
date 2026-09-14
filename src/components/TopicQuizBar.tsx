import {
  QUIZ_DIFFICULTIES,
  accessTopicQuiz,
  badgeId,
  canPlayTopicQuiz,
  difficultySpec,
  type QuizDifficulty,
  type ScoreMap,
  type TopicRef,
  type TopicQuizLaunch,
} from "@/lib/quiz";
import type { Artist, Artwork } from "@/data";
import { WORLD } from "@/data/worldCopy";
import { useAppState } from "./AppState";
import TopicMedal from "./TopicMedal";
import QuizStars from "./QuizStars";

interface TopicQuizBarProps {
  topic: TopicRef;
  targets: Artwork[];
  pool: Artwork[];
  artists: Record<string, Artist>;
  unlockedIds: ReadonlySet<string>;
  scores?: ScoreMap;
  onPlay: (launch: TopicQuizLaunch) => void;
}

/**
 * Three difficulty trials for one age or empire.
 * Free plan: Ancient Egypt only, Apprentice → Scholar → Master.
 * Pro: any topic, same progressive unlock. Stars show best score so far.
 */
export default function TopicQuizBar({
  topic,
  targets,
  pool,
  artists,
  unlockedIds,
  scores = {},
  onPlay,
}: TopicQuizBarProps) {
  const { isPro, requestPro } = useAppState();
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
          const id = badgeId(topic, spec.id);
          const unlocked = unlockedIds.has(id);
          const poolReady = canPlayTopicQuiz(
            targets,
            pool,
            spec.id,
            artists,
            topic.kind,
          );
          const access = accessTopicQuiz(
            topic,
            spec.id,
            unlockedIds,
            isPro,
            poolReady,
          );
          const bestStars = scores[id]?.stars ?? 0;
          return (
            <DifficultyButton
              key={spec.id}
              topic={topic}
              difficulty={spec.id}
              label={spec.label}
              unlocked={unlocked}
              access={access}
              bestStars={bestStars}
              onPlay={onPlay}
              onNeedPro={() => requestPro("topic-quiz")}
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
  access,
  bestStars,
  onPlay,
  onNeedPro,
}: {
  topic: TopicRef;
  difficulty: QuizDifficulty;
  label: string;
  unlocked: boolean;
  access: ReturnType<typeof accessTopicQuiz>;
  bestStars: number;
  onPlay: (launch: TopicQuizLaunch) => void;
  onNeedPro: () => void;
}) {
  const playable = access.status === "playable";
  const proGate = access.status === "need_pro";
  const clickable = playable || proGate;
  const priorLabel =
    access.status === "need_prior"
      ? difficultySpec(access.prior).label
      : null;

  let title = `${label} trial`;
  if (access.status === "insufficient") {
    title = "Not enough works in this collection yet";
  } else if (access.status === "need_prior") {
    title = `Pass ${priorLabel} first`;
  } else if (proGate) {
    title = WORLD.trialNeedPro;
  }

  return (
    <button
      type="button"
      disabled={!clickable}
      title={title}
      onClick={() => {
        if (proGate) {
          onNeedPro();
          return;
        }
        if (!playable) return;
        onPlay({
          kind: topic.kind,
          id: topic.id,
          title: topic.title,
          difficulty,
        });
      }}
      className={`flex flex-col items-center gap-1 rounded-xl border px-1.5 py-2.5 text-center transition-colors disabled:opacity-40 ${
        unlocked
          ? "border-amber-300/30 bg-amber-300/[0.08] hover:border-amber-300/50"
          : playable
            ? "border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]"
            : proGate
              ? "border-white/15 bg-white/[0.04] hover:border-accent/40 hover:bg-white/[0.07]"
              : "border-white/10 bg-white/[0.03]"
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
      <QuizStars stars={bestStars} size={8} />
    </button>
  );
}
