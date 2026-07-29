import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  buildDailyQuiz,
  generateQuestion,
  isModePlayable,
  todayKey,
  useQuizPool,
  useQuizProgress,
  QUIZ_MODES,
  MODE_LABEL,
  DAILY_COUNT,
  loadDailySession,
  saveDailySession,
  newDailySession,
  firstUnanswered,
  sessionCorrectness,
  quizSalt,
  FREE_PRACTICE_QUESTIONS,
  type DailySession,
  type QuizMode,
  type QuizQuestion,
} from "@/lib/quiz";
import { useAppState } from "./AppState";
import QuizQuestionView from "./QuizQuestion";
import QuizResults from "./QuizResults";
import { ArrowLeftIcon, CloseIcon, FlameIcon } from "./Icons";

interface QuizOverlayProps {
  open: boolean;
  onClose: () => void;
  onOpenArtwork: (artworkId: string) => void;
}

type Stage = "hub" | "playing" | "results";

/** How the daily quiz should behave from the hub, given saved state. */
type DailyMode = "new" | "resume" | "review" | "locked";

/** How long the correct/wrong flash lingers before advancing. */
const REVEAL_MS = 900;

interface Results {
  score: number;
  total: number;
  correct: boolean[];
  questions: QuizQuestion[];
  isDaily: boolean;
  milestone: number | null;
}

/**
 * Full-screen quiz flow, stacked above Discover (same overlay pattern as
 * EraScreen). Orchestrates the hub, the daily/practice question runs, and the
 * results screen; all question generation is client-side from the catalog.
 *
 * The daily quiz is deterministic per day, so it's persisted as a session and
 * played through `session.ts`: an exit resumes rather than restarts (no
 * seeing-then-retrying the same questions), and a finished session is frozen
 * for review.
 */
export default function QuizOverlay({
  open,
  onClose,
  onOpenArtwork,
}: QuizOverlayProps) {
  const { pool, loading } = useQuizPool();
  const { user, isPro, requestPro } = useAppState();
  const { streak, playedToday, recordDaily, recordPractice, previewDaily } =
    useQuizProgress(user?.id ?? null);

  const [stage, setStage] = useState<Stage>("hub");
  const [isDaily, setIsDaily] = useState(true);
  const [practiceMode, setPracticeMode] = useState<QuizMode | null>(null);

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correct, setCorrect] = useState<boolean[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [dailySession, setDailySession] = useState<DailySession | null>(null);

  const excludeRef = useRef<Set<string>>(new Set());
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
  };

  // On open: load any saved daily session so the hub can resume/review. On
  // close: reset the transient run state (the session stays in localStorage).
  useEffect(() => {
    if (open) {
      setDailySession(loadDailySession());
      return;
    }
    clearTimer();
    setStage("hub");
    setQuestions([]);
    setQIndex(0);
    setSelected(null);
    setCorrect([]);
    setResults(null);
    setPracticeMode(null);
    excludeRef.current = new Set();
  }, [open]);

  useEffect(() => clearTimer, []);

  const playableModes = useMemo(
    () =>
      QUIZ_MODES.reduce<Record<QuizMode, boolean>>(
        (acc, mode) => {
          acc[mode] = isModePlayable(pool, mode);
          return acc;
        },
        { name: false, type: false, age: false },
      ),
    [pool],
  );

  const dailyReady = useMemo(
    () => QUIZ_MODES.some((m) => playableModes[m]),
    [playableModes],
  );

  // What the daily CTA should do, given the saved session and progress.
  const dailyMode: DailyMode = dailySession?.completed
    ? "review"
    : dailySession
      ? "resume"
      : playedToday
        ? "locked" // finished earlier but the session is gone — nothing to replay
        : "new";

  const finishDaily = useCallback(
    (finalCorrect: boolean[], finalQuestions: QuizQuestion[]) => {
      const score = finalCorrect.filter(Boolean).length;
      const total = finalQuestions.length;
      // Compute the milestone from *current* progress before recording mutates it.
      const { milestone } = previewDaily(score, total);
      recordDaily(score, total);
      setResults({
        score,
        total,
        correct: finalCorrect,
        questions: finalQuestions,
        isDaily: true,
        milestone,
      });
      setStage("results");
    },
    [previewDaily, recordDaily],
  );

  const openReview = useCallback((session: DailySession) => {
    const corr = sessionCorrectness(session);
    setResults({
      score: corr.filter(Boolean).length,
      total: session.questions.length,
      correct: corr,
      questions: session.questions,
      isDaily: true,
      milestone: null, // no celebration when merely reviewing
    });
    setStage("results");
  }, []);

  const startDaily = useCallback(() => {
    if (dailyMode === "locked") return;

    if (dailyMode === "review" && dailySession) {
      openReview(dailySession);
      return;
    }

    setIsDaily(true);
    setPracticeMode(null);

    if (dailyMode === "resume" && dailySession) {
      const start = firstUnanswered(dailySession);
      setQuestions(dailySession.questions);
      setCorrect(sessionCorrectness(dailySession).slice(0, start));
      setQIndex(start);
      setSelected(null);
      setStage("playing");
      return;
    }

    // New session for today — salted per user (signed-in id, else per-install)
    // so every user gets their own daily set from the shared catalog, and a
    // signed-in account sees the same daily across devices.
    const built = buildDailyQuiz(pool, todayKey(), DAILY_COUNT, quizSalt(user));
    if (built.length === 0) return;
    const session = newDailySession(built);
    saveDailySession(session);
    setDailySession(session);
    setQuestions(built);
    setCorrect([]);
    setQIndex(0);
    setSelected(null);
    setStage("playing");
  }, [dailyMode, dailySession, openReview, pool]);

  const startPractice = useCallback(
    (mode: QuizMode) => {
      excludeRef.current = new Set();
      const first = generateQuestion(mode, pool, Math.random, excludeRef.current);
      if (!first) return;
      excludeRef.current.add(first.artworkId);
      setIsDaily(false);
      setPracticeMode(mode);
      setQuestions([first]);
      setQIndex(0);
      setSelected(null);
      setCorrect([]);
      setStage("playing");
    },
    [pool],
  );

  const nextPractice = useCallback(() => {
    if (!practiceMode) return;
    // Loop the pool once exhausted so practice stays endless.
    let q = generateQuestion(
      practiceMode,
      pool,
      Math.random,
      excludeRef.current,
    );
    if (!q) {
      excludeRef.current = new Set();
      q = generateQuestion(practiceMode, pool, Math.random, excludeRef.current);
    }
    if (!q) return;
    excludeRef.current.add(q.artworkId);
    setQuestions([q]);
    setQIndex(0);
    setSelected(null);
  }, [practiceMode, pool]);

  // Declared before `handleSelect`, which lists it as a dependency — a `const`
  // referenced in a dependency array must already be initialised.
  const backToHub = useCallback(() => {
    clearTimer();
    setStage("hub");
    setQuestions([]);
    setQIndex(0);
    setSelected(null);
    setCorrect([]);
    setPracticeMode(null);
  }, []);

  const handleSelect = useCallback(
    (choice: number) => {
      if (selected !== null) return;
      const question = questions[qIndex];
      if (!question) return;
      const wasCorrect = choice === question.correctIndex;
      setSelected(choice);

      if (isDaily) {
        // Persist the answer immediately so an exit resumes here, not restarts.
        setDailySession((prev) => {
          if (!prev) return prev;
          const answers = [...prev.answers];
          answers[qIndex] = choice;
          const completed = qIndex + 1 >= prev.questions.length;
          const next = { ...prev, answers, completed };
          saveDailySession(next);
          return next;
        });

        const nextCorrect = [...correct, wasCorrect];
        setCorrect(nextCorrect);
        advanceTimer.current = setTimeout(() => {
          if (qIndex + 1 < questions.length) {
            setQIndex((i) => i + 1);
            setSelected(null);
          } else {
            finishDaily(nextCorrect, questions);
          }
        }, REVEAL_MS);
      } else {
        recordPractice(1);
        setCorrect((prev) => [...prev, wasCorrect]);

        // Practice is the endless mode. Free users get FREE_PRACTICE_QUESTIONS
        // per run, then the paywall — after the answer has been revealed, so the
        // run ends on a resolved question rather than mid-thought. The DAILY
        // quiz is never gated.
        const answered = correct.length + 1;
        if (!isPro && answered >= FREE_PRACTICE_QUESTIONS) {
          advanceTimer.current = setTimeout(() => {
            backToHub();
            requestPro("practice-quiz");
          }, REVEAL_MS);
          return;
        }

        advanceTimer.current = setTimeout(nextPractice, REVEAL_MS);
      }
    },
    [
      selected,
      questions,
      qIndex,
      isDaily,
      correct,
      finishDaily,
      nextPractice,
      recordPractice,
      isPro,
      requestPro,
      backToHub,
    ],
  );

  const current = questions[qIndex];
  const practiceScore = !isDaily ? correct.filter(Boolean).length : 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="absolute inset-0 z-[65] flex flex-col bg-ink"
        >
          {/* Header (hidden on the results screen, which has its own actions) */}
          {stage !== "results" && (
            <div className="flex items-center gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
              <button
                onClick={stage === "hub" ? onClose : backToHub}
                aria-label={stage === "hub" ? "Close quiz" : "Back to quiz menu"}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition-colors hover:bg-white/10"
              >
                {stage === "hub" ? (
                  <CloseIcon className="h-4 w-4" />
                ) : (
                  <ArrowLeftIcon className="h-4 w-4" />
                )}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-serif text-[17px] leading-tight text-white">
                  {stage === "hub"
                    ? "Quiz"
                    : isDaily
                      ? "Daily quiz"
                      : `Practice · ${practiceMode ? MODE_LABEL[practiceMode] : ""}`}
                </p>
              </div>
              {stage === "playing" && (
                <span className="shrink-0 text-sm font-medium tabular-nums text-white/55">
                  {isDaily ? `${qIndex + 1}/${questions.length}` : practiceScore}
                </span>
              )}
            </div>
          )}

          {/* Body */}
          <div className="min-h-0 flex-1">
            {stage === "hub" && (
              <QuizHub
                loading={loading}
                streak={streak}
                dailyMode={dailyMode}
                dailyReady={dailyReady}
                playableModes={playableModes}
                isPro={isPro}
                onDaily={startDaily}
                onStartPractice={startPractice}
              />
            )}

            {stage === "playing" && current && (
              <QuizQuestionView
                key={current.id}
                question={current}
                index={isDaily ? qIndex : 0}
                total={isDaily ? questions.length : 1}
                selected={selected}
                onSelect={handleSelect}
              />
            )}

            {stage === "results" && results && (
              <QuizResults
                score={results.score}
                total={results.total}
                streak={streak}
                isDaily={results.isDaily}
                milestone={results.milestone}
                questions={results.questions}
                correct={results.correct}
                onOpenArtwork={(id) => {
                  onClose();
                  onOpenArtwork(id);
                }}
                onDone={onClose}
              />
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The landing screen: streak, daily CTA, and the three practice modes. */
function QuizHub({
  loading,
  streak,
  dailyMode,
  dailyReady,
  playableModes,
  isPro,
  onDaily,
  onStartPractice,
}: {
  loading: boolean;
  streak: number;
  dailyMode: DailyMode;
  dailyReady: boolean;
  playableModes: Record<QuizMode, boolean>;
  isPro: boolean;
  onDaily: () => void;
  onStartPractice: (mode: QuizMode) => void;
}) {
  const done = dailyMode === "review" || dailyMode === "locked";
  const dailyCta =
    dailyMode === "resume"
      ? "Resume"
      : dailyMode === "review"
        ? "Review"
        : "Start";
  const dailySubtitle = loading
    ? "Loading the collection…"
    : dailyMode === "resume"
      ? "Pick up where you left off"
      : dailyMode === "review"
        ? "See how you did today"
        : dailyMode === "locked"
          ? "Come back tomorrow for a new set"
          : `${DAILY_COUNT} questions · builds your streak`;

  return (
    <div className="h-full overflow-y-auto overscroll-contain px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <h1 className="font-serif text-[30px] leading-tight text-white">
        Test your eye
      </h1>
      <p className="mt-1.5 text-sm text-white/50">
        Guess the name, type, and age of works from the collection.
      </p>

      {/* Streak */}
      <div className="mt-6 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5">
        <FlameIcon
          filled={streak > 0}
          className={`h-6 w-6 ${streak > 0 ? "text-amber-300" : "text-white/30"}`}
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-white">
            {streak > 0 ? `${streak} day streak` : "No streak yet"}
          </p>
          <p className="text-[12px] text-white/45">
            {done
              ? "Today's quiz is done — see you tomorrow."
              : "Play the daily quiz to keep it going."}
          </p>
        </div>
      </div>

      {/* Daily CTA */}
      <button
        type="button"
        disabled={loading || dailyMode === "locked" || (!dailyReady && dailyMode === "new")}
        onClick={onDaily}
        className="mt-4 flex w-full items-center justify-between gap-3 rounded-2xl border border-emerald-300/25 bg-gradient-to-br from-emerald-400/15 to-emerald-400/5 px-5 py-4 text-left transition-colors enabled:hover:border-emerald-300/40 disabled:opacity-60"
      >
        <span>
          <span className="block font-serif text-lg text-white">
            {dailyMode === "resume"
              ? "Daily quiz — in progress"
              : done
                ? "Daily quiz complete"
                : "Daily quiz"}
          </span>
          <span className="mt-0.5 block text-[12px] text-white/55">
            {dailySubtitle}
          </span>
        </span>
        {dailyMode !== "locked" && (
          <span className="shrink-0 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink">
            {dailyCta}
          </span>
        )}
      </button>

      {/* Practice */}
      <h2 className="mt-8 flex items-center gap-2 font-serif text-lg text-white">
        Practice
        {!isPro && (
          <span className="rounded-full bg-amber-300/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300">
            Pro
          </span>
        )}
      </h2>
      <p className="mt-1 text-[12px] text-white/45">
        {isPro
          ? "Endless questions — doesn't affect your streak."
          : `${FREE_PRACTICE_QUESTIONS} free questions per round · Narsil Pro plays endless.`}
      </p>
      <div className="mt-3 space-y-2.5">
        {QUIZ_MODES.map((mode) => {
          const label = MODE_LABEL[mode];
          const desc =
            mode === "name"
              ? "Name the artwork"
              : mode === "type"
                ? "Identify the type of art"
                : "Guess when it was made";
          const enabled = !loading && playableModes[mode];
          return (
            <button
              key={mode}
              type="button"
              disabled={!enabled}
              onClick={() => onStartPractice(mode)}
              className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left transition-colors enabled:hover:bg-white/[0.06] disabled:opacity-50"
            >
              <span>
                <span className="block text-sm font-medium text-white">
                  {label}
                </span>
                <span className="mt-0.5 block text-[12px] text-white/45">
                  {enabled ? desc : "Not enough artworks yet"}
                </span>
              </span>
              <span className="text-white/30">›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
