import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  accessTopicQuiz,
  buildTopicQuiz,
  canPlayTopicQuiz,
  difficultySpec,
  filterTopicTargets,
  getCachedTopicQuiz,
  loadBadges,
  MIN_TOPIC_QUESTIONS,
  starsFromScore,
  useQuizBadges,
  useQuizPool,
  useQuizScores,
  type QuizQuestion,
  type TopicQuizLaunch,
} from "@/lib/quiz";
import { WORLD } from "@/data/worldCopy";
import { useAppState } from "./AppState";
import QuizQuestionView from "./QuizQuestion";
import QuizStars from "./QuizStars";
import TopicMedal from "./TopicMedal";
import { ArrowLeftIcon, CloseIcon } from "./Icons";

interface TopicQuizOverlayProps {
  launch: TopicQuizLaunch;
  onClose: () => void;
}

type Stage = "playing" | "results" | "blocked";

const REVEAL_MS = 900;

/**
 * Age / empire trial. Starts only when access rules allow it; a seal is
 * granted only when every answer is correct. Stars update on every run.
 */
export default function TopicQuizOverlay({
  launch,
  onClose,
}: TopicQuizOverlayProps) {
  const { pool, artists } = useQuizPool();
  const { user, isPro, requestPro } = useAppState();
  const { recordResult } = useQuizBadges(user?.id ?? null);
  const { recordScore } = useQuizScores(user?.id ?? null);
  const spec = difficultySpec(launch.difficulty);

  const [stage, setStage] = useState<Stage>("playing");
  const [blockReason, setBlockReason] = useState<"need_pro" | "need_prior" | "insufficient" | null>(null);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correct, setCorrect] = useState<boolean[]>([]);
  const [newlyEarned, setNewlyEarned] = useState(false);
  const [runStars, setRunStars] = useState(0);
  const [run, setRun] = useState(0);

  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const poolRef = useRef(pool);
  const artistsRef = useRef(artists);
  poolRef.current = pool;
  artistsRef.current = artists;

  const clearTimer = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
  };

  const topic = useMemo(
    () => ({ kind: launch.kind, id: launch.id, title: launch.title }),
    [launch.kind, launch.id, launch.title],
  );

  const heading =
    launch.kind === "empire" ? WORLD.empireTrial : WORLD.ageTrial;

  const startRun = useCallback(() => {
    clearTimer();
    const full = poolRef.current;
    const index = artistsRef.current;
    const targets = filterTopicTargets(full, topic);
    const cached =
      run === 0 ? getCachedTopicQuiz(topic, launch.difficulty) : null;
    const poolReady =
      !!getCachedTopicQuiz(topic, launch.difficulty) ||
      canPlayTopicQuiz(
        targets,
        full,
        launch.difficulty,
        index,
        topic.kind,
      );
    const unlockedIds = new Set(Object.keys(loadBadges()));
    const access = accessTopicQuiz(
      topic,
      launch.difficulty,
      unlockedIds,
      isPro,
      poolReady,
    );
    if (access.status !== "playable") {
      setBlockReason(
        access.status === "need_prior"
          ? "need_prior"
          : access.status === "need_pro"
            ? "need_pro"
            : "insufficient",
      );
      setStage("blocked");
      setQuestions([]);
      return;
    }

    const built =
      cached ??
      buildTopicQuiz(
        targets,
        full,
        launch.difficulty,
        Math.random,
        index,
        topic.kind,
      );
    if (built.length < MIN_TOPIC_QUESTIONS) {
      setBlockReason("insufficient");
      setStage("blocked");
      setQuestions([]);
      return;
    }
    setBlockReason(null);
    setQuestions(built);
    setQIndex(0);
    setSelected(null);
    setCorrect([]);
    setNewlyEarned(false);
    setRunStars(0);
    setStage("playing");
  }, [topic, launch.difficulty, isPro, run]);

  useEffect(() => {
    startRun();
    return clearTimer;
  }, [startRun]);

  const finish = useCallback(
    (finalCorrect: boolean[]) => {
      const score = finalCorrect.filter(Boolean).length;
      const total = questions.length;
      const starResult = recordScore(topic, launch.difficulty, score, total);
      const result = recordResult(topic, launch.difficulty, score, total);
      setRunStars(starResult.stars);
      setNewlyEarned(result.unlocked);
      setCorrect(finalCorrect);
      setStage("results");
    },
    [recordResult, recordScore, topic, launch.difficulty, questions.length],
  );

  const handleSelect = useCallback(
    (choice: number) => {
      if (selected !== null) return;
      const question = questions[qIndex];
      if (!question) return;
      const wasCorrect = choice === question.correctIndex;
      setSelected(choice);
      const nextCorrect = [...correct, wasCorrect];
      setCorrect(nextCorrect);
      advanceTimer.current = setTimeout(() => {
        if (qIndex + 1 < questions.length) {
          setQIndex((i) => i + 1);
          setSelected(null);
        } else {
          finish(nextCorrect);
        }
      }, REVEAL_MS);
    },
    [selected, questions, qIndex, correct, finish],
  );

  const current = questions[qIndex];
  const score = correct.filter(Boolean).length;
  const total = questions.length;
  const perfect = total > 0 && score === total;
  const displayStars =
    stage === "results" ? runStars : starsFromScore(score, total);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 24 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 24 }}
        transition={{ duration: 0.22, ease: "easeOut" }}
        className="absolute inset-0 z-[70] flex flex-col bg-[#1a120c]"
      >
        <div className="flex items-center gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
          <button
            type="button"
            onClick={onClose}
            aria-label={stage === "playing" ? "Leave trial" : "Close"}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition-colors hover:bg-white/10"
          >
            {stage === "playing" ? (
              <ArrowLeftIcon className="h-4 w-4" />
            ) : (
              <CloseIcon className="h-4 w-4" />
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-[17px] leading-tight text-white">
              {heading}
            </p>
            <p className="truncate text-[11px] text-white/45">
              {launch.title} · {spec.label}
            </p>
          </div>
          {stage === "playing" && questions.length > 0 && (
            <span className="shrink-0 text-sm font-medium tabular-nums text-white/55">
              {qIndex + 1}/{questions.length}
            </span>
          )}
        </div>

        <div className="min-h-0 flex-1">
          {stage === "blocked" && (
            <div className="flex h-full flex-col items-center px-6 pt-16 text-center">
              <p className="max-w-[16rem] text-sm leading-relaxed text-white/60">
                {blockReason === "need_pro"
                  ? WORLD.trialNeedPro
                  : blockReason === "need_prior"
                    ? WORLD.trialNeedPrior
                    : "Not enough works in this collection yet. Come back as the archive grows."}
              </p>
              {blockReason === "need_pro" && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    requestPro("topic-quiz");
                  }}
                  className="mt-6 w-full max-w-xs rounded-2xl bg-accent py-3.5 text-sm font-semibold text-ink"
                >
                  {WORLD.explorersGuild}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full max-w-xs rounded-2xl border border-white/15 bg-white/5 py-3.5 text-sm font-semibold text-white"
              >
                Done
              </button>
            </div>
          )}

          {stage === "playing" && current && (
            <QuizQuestionView
              key={current.id}
              question={current}
              index={qIndex}
              total={questions.length}
              selected={selected}
              onSelect={handleSelect}
            />
          )}

          {stage === "results" && (
            <div className="flex h-full flex-col items-center overflow-y-auto px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-8 text-center [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <motion.div
                initial={{ scale: 0.86, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 18 }}
              >
                <TopicMedal
                  difficulty={launch.difficulty}
                  unlocked={perfect}
                  mark={launch.title}
                  size={88}
                />
              </motion.div>
              <QuizStars stars={displayStars} size={18} className="mt-4" />
              <p className="mt-4 font-serif text-[28px] leading-tight text-white">
                {score}/{total}
              </p>
              <p className="mt-1 text-sm text-white/55">
                {spec.label} · {launch.title}
              </p>
              <p className="mt-4 max-w-[16rem] text-sm leading-relaxed text-white/70">
                {perfect
                  ? newlyEarned
                    ? WORLD.trialEarned
                    : "Already in your case — still a flawless run."
                  : WORLD.trialNeedPerfect}
              </p>
              <div className="mt-8 flex w-full max-w-xs flex-col gap-2">
                {!perfect && (
                  <button
                    type="button"
                    onClick={() => setRun((n) => n + 1)}
                    className="w-full rounded-2xl bg-accent py-3.5 text-sm font-semibold text-ink"
                  >
                    {WORLD.trialRetry}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className={`w-full rounded-2xl py-3.5 text-sm font-semibold ${
                    perfect
                      ? "bg-accent text-ink"
                      : "border border-white/15 bg-white/5 text-white"
                  }`}
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
