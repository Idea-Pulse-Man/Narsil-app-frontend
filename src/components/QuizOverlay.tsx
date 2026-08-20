import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  buildDailyQuiz,
  generateQuestion,
  playableModesFor,
  todayKey,
  useQuizPool,
  useQuizProgress,
  QUIZ_MODES,
  DAILY_COUNT,
  loadDailySession,
  saveDailySession,
  clearDailySession,
  newDailySession,
  firstUnanswered,
  sessionCorrectness,
  quizSalt,
  scoreDaily,
  FREE_PRACTICE_QUESTIONS,
  levelTitle,
  type DailySession,
  type QuizQuestion,
  type DailyPointsBreakdown,
} from "@/lib/quiz";
import {
  submitDailyQuizResult,
  fetchLevelBoard,
  type LevelBoard,
} from "@/lib/quizRemote";
import { WORLD } from "@/data/worldCopy";
import { useAppState } from "./AppState";
import QuizQuestionView from "./QuizQuestion";
import QuizResults from "./QuizResults";
import QuizRanking from "./QuizRanking";
import QuizScrollFrame from "./QuizScrollFrame";
import { scrollForLevel, scrollPalette } from "@/lib/quiz/scrolls";
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
  points: DailyPointsBreakdown | null;
  totalPoints: number;
  levelId: number;
  leveledUp: boolean;
  board: LevelBoard | null;
  boardLocked: boolean;
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
  const { user, isGuest, isPro, requestPro } = useAppState();
  const {
    progress,
    streak,
    playedToday,
    recordDaily,
    recordPractice,
    previewDaily,
  } = useQuizProgress(user?.id ?? null);

  const [stage, setStage] = useState<Stage>("hub");
  const [isDaily, setIsDaily] = useState(true);
  /** Practice is always a mixed Where/What/When run (no per-mode drill). */
  const [practicing, setPracticing] = useState(false);

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correct, setCorrect] = useState<boolean[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [dailySession, setDailySession] = useState<DailySession | null>(null);
  const [hubBoard, setHubBoard] = useState<LevelBoard | null>(null);

  const excludeRef = useRef<Set<string>>(new Set());
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When the current question became visible (for time bonus). */
  const questionShownAt = useRef<number>(Date.now());

  const clearTimer = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
  };

  // On open: load any saved daily session so the hub can resume/review. On
  // close: reset the transient run state (the session stays in localStorage).
  useEffect(() => {
    if (open) {
      setDailySession(loadDailySession());
      if (!isGuest) {
        void fetchLevelBoard(todayKey()).then((board) => {
          setHubBoard(board);
        });
      } else {
        setHubBoard(null);
      }
      return;
    }
    clearTimer();
    setStage("hub");
    setQuestions([]);
    setQIndex(0);
    setSelected(null);
    setCorrect([]);
    setResults(null);
    setPracticing(false);
    setHubBoard(null);
    excludeRef.current = new Set();
  }, [open, isGuest]);

  useEffect(() => clearTimer, []);

  const playableModes = useMemo(
    () => playableModesFor(pool),
    [pool],
  );

  const dailyReady = playableModes.length > 0;

  // Drop a mid-day session built under the old name/type/age schema so we
  // don't render unknown mode labels after this quiz reshape.
  useEffect(() => {
    if (!dailySession) return;
    const ok = dailySession.questions.every((q) =>
      (QUIZ_MODES as readonly string[]).includes(q.mode),
    );
    if (ok) return;
    clearDailySession();
    setDailySession(null);
  }, [dailySession]);

  // What the daily CTA should do, given the saved session and progress.
  const dailyMode: DailyMode = dailySession?.completed
    ? "review"
    : dailySession
      ? "resume"
      : playedToday
        ? "locked" // finished earlier but the session is gone — nothing to replay
        : "new";

  const finishDaily = useCallback(
    async (
      finalCorrect: boolean[],
      finalQuestions: QuizQuestion[],
      answerMs: (number | null)[],
    ) => {
      const score = finalCorrect.filter(Boolean).length;
      const total = finalQuestions.length;
      const breakdown = scoreDaily(
        finalQuestions.map((_, i) => ({
          correct: finalCorrect[i] ?? false,
          elapsedMs: answerMs[i] ?? 10_000,
        })),
      );
      const input = {
        correctCount: score,
        total,
        points: breakdown.total,
        breakdown,
      };
      const preview = previewDaily(input);
      const recorded = recordDaily(input);

      let board: LevelBoard | null = null;
      let leveledUp = recorded.leveledUp;
      let totalPoints = recorded.progress.totalPoints;
      let levelId = recorded.progress.levelId;

      if (!isGuest) {
        const day = todayKey();
        const remote = await submitDailyQuizResult(
          breakdown.total,
          score,
          total,
          day,
        );
        if (remote) {
          leveledUp = remote.leveledUp;
          totalPoints = remote.totalPoints;
          levelId = remote.levelId;
        }
        board = await fetchLevelBoard(day);
        setHubBoard(board);
      }

      setResults({
        score,
        total,
        correct: finalCorrect,
        questions: finalQuestions,
        isDaily: true,
        milestone: preview.milestone,
        points: breakdown,
        totalPoints,
        levelId,
        leveledUp,
        board,
        boardLocked: isGuest,
      });
      setStage("results");
    },
    [previewDaily, recordDaily, isGuest],
  );

  const openReview = useCallback(
    async (session: DailySession) => {
      const corr = sessionCorrectness(session);
      const breakdown = scoreDaily(
        session.questions.map((_, i) => ({
          correct: corr[i] ?? false,
          elapsedMs: session.answerMs?.[i] ?? 10_000,
        })),
      );
      let board: LevelBoard | null = null;
      if (!isGuest) {
        board = await fetchLevelBoard(todayKey());
      }
      setResults({
        score: corr.filter(Boolean).length,
        total: session.questions.length,
        correct: corr,
        questions: session.questions,
        isDaily: true,
        milestone: null,
        points: breakdown,
        totalPoints: progress.totalPoints,
        levelId: progress.levelId,
        leveledUp: false,
        board,
        boardLocked: isGuest,
      });
      setStage("results");
    },
    [isGuest, progress.levelId, progress.totalPoints],
  );

  const startDaily = useCallback(() => {
    if (dailyMode === "locked") return;

    if (dailyMode === "review" && dailySession) {
      openReview(dailySession);
      return;
    }

    setIsDaily(true);
    setPracticing(false);

    if (dailyMode === "resume" && dailySession) {
      const start = firstUnanswered(dailySession);
      setQuestions(dailySession.questions);
      setCorrect(sessionCorrectness(dailySession).slice(0, start));
      setQIndex(start);
      setSelected(null);
      questionShownAt.current = Date.now();
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
    questionShownAt.current = Date.now();
    setStage("playing");
  }, [dailyMode, dailySession, openReview, pool, user]);

  const startPractice = useCallback(() => {
    excludeRef.current = new Set();
    const first = generateQuestion(pool, Math.random, excludeRef.current);
    if (!first) return;
    excludeRef.current.add(first.artworkId);
    setIsDaily(false);
    setPracticing(true);
    setQuestions([first]);
    setQIndex(0);
    setSelected(null);
    setCorrect([]);
    setStage("playing");
  }, [pool]);

  const nextPractice = useCallback(() => {
    if (!practicing) return;
    // Loop the pool once exhausted so practice stays endless.
    let q = generateQuestion(pool, Math.random, excludeRef.current);
    if (!q) {
      excludeRef.current = new Set();
      q = generateQuestion(pool, Math.random, excludeRef.current);
    }
    if (!q) return;
    excludeRef.current.add(q.artworkId);
    setQuestions([q]);
    setQIndex(0);
    setSelected(null);
  }, [practicing, pool]);

  // Declared before `handleSelect`, which lists it as a dependency — a `const`
  // referenced in a dependency array must already be initialised.
  const backToHub = useCallback(() => {
    clearTimer();
    setStage("hub");
    setQuestions([]);
    setQIndex(0);
    setSelected(null);
    setCorrect([]);
    setPracticing(false);
    if (!isGuest) {
      void fetchLevelBoard(todayKey()).then((board) => setHubBoard(board));
    }
  }, [isGuest]);

  const handleSelect = useCallback(
    (choice: number) => {
      if (selected !== null) return;
      const question = questions[qIndex];
      if (!question) return;
      const wasCorrect = choice === question.correctIndex;
      setSelected(choice);

      if (isDaily) {
        const elapsedMs = Math.max(0, Date.now() - questionShownAt.current);
        const prev = dailySession;
        const baseAnswers = prev?.answers ?? questions.map(() => null);
        const baseMs =
          prev?.answerMs ?? questions.map(() => null as number | null);
        const answers = [...baseAnswers];
        const answerMs = [...baseMs];
        answers[qIndex] = choice;
        answerMs[qIndex] = elapsedMs;
        const completed = qIndex + 1 >= questions.length;
        const nextSession: DailySession = {
          date: prev?.date ?? todayKey(),
          questions: prev?.questions ?? questions,
          answers,
          answerMs,
          completed,
        };
        saveDailySession(nextSession);
        setDailySession(nextSession);

        const nextCorrect = [...correct, wasCorrect];
        setCorrect(nextCorrect);
        advanceTimer.current = setTimeout(() => {
          if (qIndex + 1 < questions.length) {
            setQIndex((i) => i + 1);
            setSelected(null);
            questionShownAt.current = Date.now();
          } else {
            void finishDaily(nextCorrect, questions, answerMs);
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
      dailySession,
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
          className="absolute inset-0 z-[65] flex flex-col bg-[#1a120c]"
        >
          {/* Header — playing only; hub/results use the parchment frame */}
          {stage === "playing" && (
            <div className="flex items-center gap-3 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
              <button
                onClick={backToHub}
                aria-label="Back to quiz menu"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition-colors hover:bg-white/10"
              >
                <ArrowLeftIcon className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-serif text-[17px] leading-tight text-white">
                  {isDaily ? WORLD.royalAssessment : WORLD.unchartedArchives}
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
                practiceReady={dailyReady}
                isPro={isPro}
                levelId={progress.levelId}
                totalPoints={progress.totalPoints}
                board={hubBoard}
                boardLocked={isGuest}
                onDaily={startDaily}
                onStartPractice={startPractice}
                onClose={onClose}
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
                points={results.points}
                totalPoints={results.totalPoints}
                levelId={results.levelId}
                leveledUp={results.leveledUp}
                board={results.board}
                boardLocked={results.boardLocked}
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

/** The landing screen: parchment scroll, same-level ranking, daily CTA. */
function QuizHub({
  loading,
  streak,
  dailyMode,
  dailyReady,
  practiceReady,
  isPro,
  levelId,
  totalPoints,
  board,
  boardLocked,
  onDaily,
  onStartPractice,
  onClose,
}: {
  loading: boolean;
  streak: number;
  dailyMode: DailyMode;
  dailyReady: boolean;
  practiceReady: boolean;
  isPro: boolean;
  levelId: number;
  totalPoints: number;
  board: LevelBoard | null;
  boardLocked: boolean;
  onDaily: () => void;
  onStartPractice: () => void;
  onClose: () => void;
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
          : `${DAILY_COUNT} questions · where, what & when · builds your streak`;

  const { ink } = scrollForLevel(levelId);
  const dark = ink === "dark";
  const { heading, muted, box } = scrollPalette(ink);
  const cta = dark
    ? "border-[#5c3d12]/40 bg-[#2a1c0c] text-[#f6ead0]"
    : "border-amber-200/30 bg-[#f6ead0] text-[#2a1c0c]";

  return (
    <QuizScrollFrame
      levelId={levelId}
      footer={
        <div className="relative px-[13%] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-1">
          <button
            type="button"
            disabled={
              loading || dailyMode === "locked" || (!dailyReady && dailyMode === "new")
            }
            onClick={onDaily}
            className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left disabled:opacity-55 ${cta}`}
          >
            <span>
              <span className="block font-serif text-lg">
                {dailyMode === "resume"
                  ? `${WORLD.royalAssessment} — in progress`
                  : done
                    ? `${WORLD.royalAssessment} complete`
                    : WORLD.royalAssessment}
              </span>
              <span className="mt-0.5 block text-[12px] opacity-90">
                {dailySubtitle}
              </span>
            </span>
            {dailyMode !== "locked" && (
              <span
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
                  dark ? "bg-[#f6ead0] text-[#2a1c0c]" : "bg-[#2a1c0c] text-[#f6ead0]"
                }`}
              >
                {dailyCta}
              </span>
            )}
          </button>
        </div>
      }
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close quiz"
        className={`mb-3 flex h-9 w-9 items-center justify-center rounded-full border ${box} ${heading}`}
      >
        <CloseIcon className="h-4 w-4" />
      </button>

      <h1 className={`font-serif text-[28px] leading-tight ${heading}`}>
        {WORLD.royalAssessment}
      </h1>
      <p className={`mt-1 text-sm ${muted}`}>
        {levelTitle(levelId)} · {totalPoints.toLocaleString()} pts
      </p>

      <div className={`mt-4 flex items-center gap-3 rounded-xl border px-3 py-3 ${box}`}>
        <FlameIcon
          filled={streak > 0}
          className={`h-5 w-5 ${streak > 0 ? "text-amber-700" : muted}`}
        />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${heading}`}>
            {streak > 0 ? `${streak} day streak` : "No streak yet"}
          </p>
          <p className={`text-[12px] ${muted}`}>
            {done
              ? "Today's assessment is done — see you tomorrow."
              : "Play to keep your streak and climb the Hall."}
          </p>
        </div>
      </div>

      <div className="mt-5">
        <QuizRanking
          levelId={levelId}
          board={board}
          boardLocked={boardLocked}
          ink={ink}
          compact
        />
      </div>

      <h2 className={`mt-6 font-serif text-lg ${heading}`}>
        {WORLD.unchartedArchives}
        {!isPro && (
          <span className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${box}`}>
            Guild
          </span>
        )}
      </h2>
      <p className={`mt-1 text-[12px] ${muted}`}>
        {isPro
          ? "Endless mixed questions — doesn't affect your streak."
          : `${FREE_PRACTICE_QUESTIONS} free questions per round · ${WORLD.explorersGuild} plays endless.`}
      </p>
      <button
        type="button"
        disabled={loading || !practiceReady}
        onClick={onStartPractice}
        className={`mt-2 flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left disabled:opacity-50 ${box}`}
      >
        <span>
          <span className={`block text-sm font-medium ${heading}`}>
            Mixed practice
          </span>
          <span className={`mt-0.5 block text-[12px] ${muted}`}>
            {practiceReady
              ? "Where · What · When — randomized each question"
              : "Not enough artworks yet"}
          </span>
        </span>
        <span className={muted}>›</span>
      </button>
    </QuizScrollFrame>
  );
}

