import { useEffect, useState } from "react";
import {
  QUIZ_DIFFICULTIES,
  accessTopicQuiz,
  badgeId,
  canPlayTopicQuiz,
  difficultySpec,
  formatRemainingMs,
  getTopicCooldown,
  hasCachedTopicQuiz,
  isTopicQuizPrepared,
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
 * Free: Ancient Egypt Apprentice only. Scholar/Master after sealing the prior.
 * Failed runs apply an escalating retry wait before the next attempt.
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
  const [hint, setHint] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const title =
    topic.kind === "empire" ? WORLD.empireTrial : WORLD.ageTrial;

  useEffect(() => {
    if (!hint) return;
    const t = window.setTimeout(() => setHint(null), 2800);
    return () => window.clearTimeout(t);
  }, [hint]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Hide unauthored periods (Medieval & Byzantine) and any era that cannot
  // actually produce a trial. Cache alone must not keep a dead card visible.
  if (!isTopicQuizPrepared(topic)) return null;
  const prepared = QUIZ_DIFFICULTIES.some((spec) =>
    canPlayTopicQuiz(targets, pool, spec.id, artists, topic.kind),
  );
  if (!prepared) return null;

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-serif text-[15px] text-white">{title}</p>
        <p className="text-[10px] text-white/40">{WORLD.trialHint}</p>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        {QUIZ_DIFFICULTIES.map((spec) => {
          const id = badgeId(topic, spec.id);
          const earned = unlockedIds.has(id);
          const poolReady =
            hasCachedTopicQuiz(topic, spec.id) ||
            canPlayTopicQuiz(
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
          const cooldown = getTopicCooldown(topic, spec.id, now);
          const bestStars = scores[id]?.stars ?? 0;
          return (
            <DifficultyButton
              key={spec.id}
              topic={topic}
              difficulty={spec.id}
              label={spec.label}
              earned={earned}
              access={access}
              cooldownMs={cooldown?.remainingMs ?? 0}
              bestStars={bestStars}
              onPlay={onPlay}
              onNeedPro={() => requestPro("topic-quiz")}
              onHint={setHint}
            />
          );
        })}
      </div>
      {hint && (
        <p className="mt-2 text-center text-[11px] text-amber-200/90">
          {hint}
        </p>
      )}
    </div>
  );
}

function DifficultyButton({
  topic,
  difficulty,
  label,
  earned,
  access,
  cooldownMs,
  bestStars,
  onPlay,
  onNeedPro,
  onHint,
}: {
  topic: TopicRef;
  difficulty: QuizDifficulty;
  label: string;
  earned: boolean;
  access: ReturnType<typeof accessTopicQuiz>;
  cooldownMs: number;
  bestStars: number;
  onPlay: (launch: TopicQuizLaunch) => void;
  onNeedPro: () => void;
  onHint: (message: string) => void;
}) {
  const cooling = cooldownMs > 0;
  const accessOk = access.status === "playable";
  const playable = accessOk && !cooling;
  // Lock only for real gates (prior rank / Pro / empty pool) — never for a
  // temporary retry wait on a level the member can already attempt.
  const showLock = !accessOk;
  const priorLabel =
    access.status === "need_prior"
      ? difficultySpec(access.prior).label
      : null;

  let title = `${label} trial`;
  if (cooling) {
    title = `${WORLD.trialRetryWait} ${formatRemainingMs(cooldownMs)}`;
  } else if (access.status === "insufficient") {
    title = "Not enough works in this collection yet";
  } else if (access.status === "need_prior") {
    title = `Pass ${priorLabel} first`;
  } else if (access.status === "need_pro") {
    title = WORLD.trialNeedPro;
  }

  return (
    <button
      type="button"
      title={title}
      onClick={() => {
        if (access.status === "need_pro") {
          onNeedPro();
          return;
        }
        if (access.status === "need_prior") {
          onHint(`Pass ${priorLabel} first`);
          return;
        }
        if (access.status === "insufficient") {
          onHint("Not enough works in this collection yet");
          return;
        }
        if (cooling) {
          onHint(`${WORLD.trialRetryWait} ${formatRemainingMs(cooldownMs)}`);
          return;
        }
        onPlay({
          kind: topic.kind,
          id: topic.id,
          title: topic.title,
          difficulty,
        });
      }}
      className={`flex flex-col items-center gap-1 rounded-xl border px-1.5 py-2.5 text-center transition-colors ${
        earned
          ? "border-amber-300/30 bg-amber-300/[0.08] hover:border-amber-300/50"
          : accessOk
            ? "border-white/20 bg-white/[0.05] hover:border-white/30 hover:bg-white/[0.08]"
            : "border-white/10 bg-white/[0.03] opacity-55 hover:opacity-70"
      }`}
    >
      <TopicMedal
        difficulty={difficulty}
        unlocked={earned}
        gated={showLock}
        mark={topic.title}
        size={36}
      />
      <span
        className={`text-[10px] font-medium leading-tight ${
          earned
            ? "text-amber-100"
            : accessOk
              ? "text-white/85"
              : "text-white/45"
        }`}
      >
        {label}
      </span>
      <QuizStars stars={bestStars} size={8} />
      {cooling && (
        <span className="text-[9px] tabular-nums text-amber-200/80">
          {formatRemainingMs(cooldownMs)}
        </span>
      )}
    </button>
  );
}
