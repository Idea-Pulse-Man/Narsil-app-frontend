import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  buildDailyQuiz,
  generateQuestion,
  playableModesFor,
  todayKey,
  useQuizPool,
  useQuizProgress,
  useQuizBadges,
  useQuizScores,
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
  listDiscoverStudyBadges,
  extraEmpireTopicsFromBadges,
  findStudyBadge,
  loadSelectedBadgeId,
  sanitizeSelectedBadgeId,
  listAssessmentBadges,
  type DailySession,
  type QuizQuestion,
  type DailyPointsBreakdown,
  type BadgeMap,
} from "@/lib/quiz";
import { useCatalog } from "@/data/catalog";
import { displayImageUrl, sizedImageUrl } from "@/lib/imageUrl";
import { preloadImages } from "@/lib/imageCache";
import { fetchDailyQuizQuestions } from "@/lib/dailyQuiz";
import {
  fetchDailyEngineQuestions,
  fetchPracticeMix,
  fetchPracticeQuestions,
  markItemSeen,
  recordItemResult,
} from "@/lib/quiz/engine/fetch";
import EngineQuestion from "./quiz/EngineQuestion";
import {
  submitDailyQuizResult,
  fetchLevelBoard,
  type LevelBoard,
} from "@/lib/quizRemote";
import { WORLD } from "@/data/worldCopy";
import { useAppState } from "./AppState";
import QuizQuestionView from "./QuizQuestion";
import QuizResults from "./QuizResults";
import { HallCard } from "./HallCards";
import CardArt from "./CardArt";
import { CARD_TONE, STUDY_ART } from "@/lib/quiz/cardArt";
import { HALL_ART, HALL_KINDS, type HallKind } from "@/lib/quiz/halls";
import QuizScrollFrame from "./QuizScrollFrame";
import HallScreen from "./HallScreen";
import StudyBadgePage, {
  DiscoverLevelCard,
} from "./StudyBadgePage";
import { scrollForLevel, scrollPalette } from "@/lib/quiz/scrolls";
import { ArrowLeftIcon, CloseIcon, FlameIcon, MedalIcon } from "./Icons";
import { askForPushAfter } from "@/lib/push";
import RuneLoader from "./RuneLoader";

type Stage = "hub" | "badges" | "playing" | "results";

interface QuizOverlayProps {
  open: boolean;
  onClose: () => void;
  onOpenArtwork: (artworkId: string) => void;
  /** Open straight to the badge picker (e.g. from the profile avatar). */
  initialStage?: Stage;
}

/** How the daily quiz should behave from the hub, given saved state. */
type DailyMode = "new" | "resume" | "review" | "locked";

/** How long the correct/wrong flash lingers before advancing. */
const REVEAL_MS = 900;
/**
 * Engine questions show an explanation (and, for timelines / matches, the
 * right answer per tile), so they linger longer. "Next" skips the wait.
 */
const ENGINE_REVEAL_MS = 1800;
const ENGINE_DETAIL_REVEAL_MS = 4500;

/** How long practice waits for the engine batch before starting without it. */
const ENGINE_FETCH_TIMEOUT_MS = 4000;

function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise.catch(() => fallback),
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

function revealMsFor(question: QuizQuestion): number {
  const type = question.item?.answer_type;
  if (!type) return REVEAL_MS;
  return type === "single" || type === "binary"
    ? ENGINE_REVEAL_MS
    : ENGINE_DETAIL_REVEAL_MS;
}

/** Painted hub art — held behind the loader so the Hall never paints in pieces. */
const HUB_ART = [
  ...HALL_KINDS.map((kind) => HALL_ART[kind].src),
  ...Object.values(STUDY_ART).map((art) => art.src),
];

/**
 * Wait for a question's artwork at the quiz card's ~340px size (engine
 * questions: the main image plus every option thumbnail).
 */
function warmQuestionArt(question: QuizQuestion | undefined): Promise<void> {
  const item = question?.item;
  if (item) {
    const urls = [
      ...(item.media.image_url ? [displayImageUrl(item.media.image_url, 340)] : []),
      ...(item.media.compare ? [sizedImageUrl(item.media.compare.image_url, 140)] : []),
      ...item.options.flatMap((o) => (o.image_url ? [sizedImageUrl(o.image_url, 190)] : [])),
    ];
    return preloadImages([...new Set(urls)], 5000);
  }
  const url = question?.artwork.image;
  return preloadImages(url ? [displayImageUrl(url, 340)] : []);
}

/** Wait for the "Review works" thumbnails on the results screen. */
function warmReviewThumbs(questions: QuizQuestion[]): Promise<void> {
  return preloadImages(
    questions.flatMap((q) =>
      q.artwork.image ? [sizedImageUrl(q.artwork.image, 120)] : [],
    ),
    5000,
  );
}

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
  initialStage = "hub",
}: QuizOverlayProps) {
  const { pool, artists, loading } = useQuizPool();
  const { user, isGuest, isPro, requestPro } = useAppState();
  const {
    progress,
    streak,
    playedToday,
    recordDaily,
    recordPractice,
    previewDaily,
  } = useQuizProgress(user?.id ?? null);
  const { badges: seals } = useQuizBadges(user?.id ?? null);
  const { scores } = useQuizScores(user?.id ?? null);

  const [stage, setStage] = useState<Stage>(initialStage);
  const [isDaily, setIsDaily] = useState(true);
  /** Practice is always a mixed run across playable modes (no per-mode drill). */
  const [practicing, setPracticing] = useState(false);

  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [correct, setCorrect] = useState<boolean[]>([]);
  const [results, setResults] = useState<Results | null>(null);
  const [dailySession, setDailySession] = useState<DailySession | null>(null);
  const [hubBoard, setHubBoard] = useState<LevelBoard | null>(null);
  /** Caption for the Rune Circle while a run starts or results are tallied. */
  const [preparing, setPreparing] = useState<string | null>(null);
  const [hubArtReady, setHubArtReady] = useState(false);

  const excludeRef = useRef<Set<string>>(new Set());
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The step `advanceTimer` will run — "Next" runs it early. */
  const pendingAdvance = useRef<(() => void) | null>(null);
  /** When the current question became visible (for time bonus). */
  const questionShownAt = useRef<number>(Date.now());
  /** Practice: queued question-engine questions + the admin's mix (0–100). */
  const engineQueue = useRef<QuizQuestion[]>([]);
  const practiceMix = useRef(0);
  const refilling = useRef<Promise<void> | null>(null);

  const clearTimer = () => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
    pendingAdvance.current = null;
  };

  const scheduleAdvance = useCallback((step: () => void, ms: number) => {
    pendingAdvance.current = step;
    advanceTimer.current = setTimeout(() => {
      pendingAdvance.current = null;
      step();
    }, ms);
  }, []);

  /** Skip the post-answer wait (engine questions' "Next"). */
  const continueNow = useCallback(() => {
    const step = pendingAdvance.current;
    if (!step) return;
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    advanceTimer.current = null;
    pendingAdvance.current = null;
    step();
  }, []);

  // On open: load any saved daily session so the hub can resume/review. On
  // close: reset the transient run state (the session stays in localStorage).
  useEffect(() => {
    if (open) {
      setStage(initialStage);
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
    engineQueue.current = [];
  }, [open, isGuest, initialStage]);

  useEffect(() => clearTimer, []);

  const scrollSrc = scrollForLevel(progress.levelId).src;
  useEffect(() => {
    if (!open) {
      setHubArtReady(false);
      setPreparing(null);
      return;
    }
    let active = true;
    void preloadImages([scrollSrc, ...HUB_ART], 4000).then(() => {
      if (active) setHubArtReady(true);
    });
    return () => {
      active = false;
    };
  }, [open, scrollSrc]);

  const playableModes = useMemo(
    () => playableModesFor(pool, artists),
    [pool, artists],
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
  // Finishing today's quiz is when a "tomorrow's is ready" reminder makes
  // sense — ask for notification permission then (iOS asks only once).
  const wasCompleted = useRef(dailySession?.completed ?? false);
  useEffect(() => {
    const completed = dailySession?.completed ?? false;
    if (completed && !wasCompleted.current) void askForPushAfter("quiz");
    wasCompleted.current = completed;
  }, [dailySession?.completed]);

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
      setPreparing("Tallying your appraisal");
      const thumbs = warmReviewThumbs(finalQuestions);
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
      await thumbs;

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
      setPreparing(null);
    },
    [previewDaily, recordDaily, isGuest],
  );

  const openReview = useCallback(
    async (session: DailySession) => {
      setPreparing("Unrolling your review");
      const thumbs = warmReviewThumbs(session.questions);
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
      await thumbs;
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
      setPreparing(null);
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
      setPreparing("Summoning the works");
      void warmQuestionArt(dailySession.questions[start]).then(() => {
        setQuestions(dailySession.questions);
        setCorrect(sessionCorrectness(dailySession).slice(0, start));
        setQIndex(start);
        setSelected(null);
        questionShownAt.current = Date.now();
        setStage("playing");
        setPreparing(null);
      });
      return;
    }

    // Prefer the question-engine edition (every style the admin switched on),
    // then the classic shared edition (cron + admin specials). If neither has
    // rows yet, build one on device so the assessment is never blank.
    setPreparing("Summoning the works");
    void (async () => {
      const engine = await fetchDailyEngineQuestions();
      const remote = engine.length > 0 ? engine : await fetchDailyQuizQuestions();
      const built =
        remote.length > 0
          ? remote
          : buildDailyQuiz(pool, todayKey(), DAILY_COUNT, quizSalt(user), artists);
      if (built.length === 0) {
        setPreparing(null);
        return;
      }
      const session = newDailySession(built);
      saveDailySession(session);
      setDailySession(session);
      // Hold the loader until the first artwork is in, so the run never
      // opens on an empty frame.
      await warmQuestionArt(built[0]);
      setQuestions(built);
      setCorrect([]);
      setQIndex(0);
      setSelected(null);
      questionShownAt.current = Date.now();
      setStage("playing");
      setPreparing(null);
    })();
  }, [dailyMode, dailySession, openReview, pool, artists, user]);

  /** Top up the practice queue from the generated pool (one request at a time). */
  const refillEngine = useCallback((): Promise<void> => {
    if (refilling.current) return refilling.current;
    refilling.current = (async () => {
      try {
        const batch = await fetchPracticeQuestions(20);
        const have = new Set(engineQueue.current.map((q) => q.id));
        engineQueue.current.push(...batch.filter((q) => !have.has(q.id)));
      } finally {
        refilling.current = null;
      }
    })();
    return refilling.current;
  }, []);

  /**
   * Next practice question: a generated (engine) one `practiceMix`% of the
   * time when the queue has any, otherwise one built on device. Either side
   * covers for the other when it runs dry.
   */
  const pickPracticeQuestion = useCallback((): QuizQuestion | null => {
    const queue = engineQueue.current;
    if (queue.length < 5) void refillEngine();
    const takeEngine = (): QuizQuestion | null => {
      const q = queue.shift();
      if (q?.item) markItemSeen(q.item.id);
      return q ?? null;
    };
    if (queue.length > 0 && Math.random() * 100 < practiceMix.current) {
      return takeEngine();
    }
    // Loop the pool once exhausted so practice stays endless.
    let q = generateQuestion(pool, Math.random, excludeRef.current, undefined, artists);
    if (!q) {
      excludeRef.current = new Set();
      q = generateQuestion(pool, Math.random, excludeRef.current, undefined, artists);
    }
    if (!q) return takeEngine();
    excludeRef.current.add(q.artworkId);
    return q;
  }, [pool, artists, refillEngine]);

  const startPractice = useCallback(() => {
    excludeRef.current = new Set();
    engineQueue.current = [];
    setPreparing("Summoning the works");
    void (async () => {
      const [mix, batch] = await Promise.all([
        withTimeout(fetchPracticeMix(), ENGINE_FETCH_TIMEOUT_MS, 0),
        withTimeout(fetchPracticeQuestions(20), ENGINE_FETCH_TIMEOUT_MS, []),
      ]);
      practiceMix.current = mix;
      engineQueue.current = batch;
      const first = pickPracticeQuestion();
      if (!first) {
        setPreparing(null);
        return;
      }
      await warmQuestionArt(first);
      setIsDaily(false);
      setPracticing(true);
      setQuestions([first]);
      setQIndex(0);
      setSelected(null);
      setCorrect([]);
      questionShownAt.current = Date.now();
      setStage("playing");
      setPreparing(null);
    })();
  }, [pickPracticeQuestion]);

  const nextPractice = useCallback(() => {
    if (!practicing) return;
    void (async () => {
      // Focus mode (mix 100): wait for the next batch rather than slipping in
      // an on-device classic question while it loads.
      if (practiceMix.current >= 100 && engineQueue.current.length === 0) {
        await withTimeout(refillEngine(), ENGINE_FETCH_TIMEOUT_MS, undefined);
      }
      const q = pickPracticeQuestion();
      if (!q) return;
      setQuestions([q]);
      setQIndex(0);
      setSelected(null);
      questionShownAt.current = Date.now();
      void warmQuestionArt(engineQueue.current[0]);
    })();
  }, [practicing, pickPracticeQuestion, refillEngine]);

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
      if (question.item) recordItemResult(question.item.id, wasCorrect);
      const revealMs = revealMsFor(question);

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
        scheduleAdvance(() => {
          if (qIndex + 1 < questions.length) {
            setQIndex((i) => i + 1);
            setSelected(null);
            questionShownAt.current = Date.now();
          } else {
            void finishDaily(nextCorrect, questions, answerMs);
          }
        }, revealMs);
      } else {
        recordPractice(1);
        setCorrect((prev) => [...prev, wasCorrect]);

        // Practice is the endless mode. Free users get FREE_PRACTICE_QUESTIONS
        // per run, then the paywall — after the answer has been revealed, so the
        // run ends on a resolved question rather than mid-thought. The DAILY
        // quiz is never gated.
        const answered = correct.length + 1;
        if (!isPro && answered >= FREE_PRACTICE_QUESTIONS) {
          scheduleAdvance(() => {
            backToHub();
            requestPro("practice-quiz");
          }, revealMs);
          return;
        }

        scheduleAdvance(nextPractice, revealMs);
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
      scheduleAdvance,
    ],
  );

  const current = questions[qIndex];
  const practiceScore = !isDaily ? correct.filter(Boolean).length : 0;

  // The card is ~340px. Warm this question and the next two at that size so
  // advancing doesn't wait on another Wikimedia fetch.
  useEffect(() => {
    if (stage !== "playing") return;
    for (const q of questions.slice(qIndex, qIndex + 3)) {
      if (q.item) {
        void warmQuestionArt(q);
        continue;
      }
      const url = q.artwork.image;
      if (!url) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = displayImageUrl(url, 340);
    }
  }, [stage, questions, qIndex]);

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
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition-colors hover:bg-white/10 after:absolute after:-inset-2 after:content-['']"
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
                seals={seals}
                onDaily={startDaily}
                onStartPractice={startPractice}
                onOpenBadges={() => setStage("badges")}
                onClose={onClose}
              />
            )}

            {stage === "badges" && (
              <StudyBadgePage
                levelId={progress.levelId}
                seals={seals}
                scores={scores}
                onBack={() => setStage("hub")}
              />
            )}

            {stage === "playing" && current && current.item && (
              <EngineQuestion
                key={current.id}
                question={current}
                index={isDaily ? qIndex : 0}
                total={isDaily ? questions.length : 1}
                selected={selected}
                onSelect={handleSelect}
                onContinue={continueNow}
              />
            )}

            {stage === "playing" && current && !current.item && (
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

          {/* Rune Circle over everything while the Hall, a run, or the
              results are still loading. */}
          {(preparing !== null ||
            (stage === "hub" && (loading || !hubArtReady))) && (
            <RuneLoader
              overlay
              label={preparing ?? "Opening the Hall"}
              className="z-20"
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** The landing screen: ranking, Discover trial rank, badges, daily CTA. */
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
  seals,
  onDaily,
  onStartPractice,
  onOpenBadges,
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
  seals: BadgeMap;
  onDaily: () => void;
  onStartPractice: () => void;
  onOpenBadges: () => void;
  onClose: () => void;
}) {
  const { searchFacets } = useCatalog();
  const extraTopics = extraEmpireTopicsFromBadges(seals);
  const discoverCatalog = listDiscoverStudyBadges(
    searchFacets.empires,
    extraTopics,
  );
  const catalog = [...listAssessmentBadges(), ...discoverCatalog];
  const worn = findStudyBadge(
    sanitizeSelectedBadgeId(loadSelectedBadgeId(), levelId, seals, catalog),
    catalog,
  );
  const [hubTab, setHubTab] = useState<"hall" | "study">("hall");
  const [hallKind, setHallKind] = useState<HallKind | null>(null);
  const { requestSignIn } = useAppState();

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
  const { heading, muted, box, label } = scrollPalette(ink);
  const cardTone = CARD_TONE[ink].card;
  const cta = dark
    ? "border-[#5c3d12]/40 bg-[#2a1c0c] text-[#f6ead0]"
    : "border-amber-200/30 bg-[#f6ead0] text-[#2a1c0c]";

  return (
    <>
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
          className={`relative mb-3 flex h-9 w-9 items-center justify-center rounded-full border ${box} ${heading} after:absolute after:-inset-2 after:content-['']`}
        >
          <CloseIcon className="h-4 w-4" />
        </button>

        <h1 className={`font-serif text-[28px] leading-tight ${heading}`}>
          {WORLD.royalAssessment}
        </h1>
        <p className={`mt-1 text-sm ${muted}`}>
          {levelTitle(levelId)} · {totalPoints.toLocaleString()} pts
        </p>

        <div className="mt-4 flex gap-1 rounded-full border border-[#5c3d12]/35 bg-[#efe2c4]/80 p-0.5">
          {(
            [
              { id: "hall", label: WORLD.assessmentHallTab },
              { id: "study", label: WORLD.assessmentStudyTab },
            ] as { id: "hall" | "study"; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setHubTab(tab.id)}
              className={`flex-1 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                hubTab === tab.id
                  ? "bg-[#2a1c0c] text-[#f6ead0]"
                  : "text-[#4a3014]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {hubTab === "hall" ? (
          <div className="mt-5">
            <p
              className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${label}`}
            >
              The Halls
            </p>
            <p className={`mt-1 text-xs ${label}`}>
              {boardLocked
                ? "Sign in to join the Halls and appear on the rankings."
                : "Today, this month, and the Discover trials"}
            </p>
            <div className="mt-3 space-y-2.5">
              {HALL_KINDS.map((kind) => (
                <HallCard
                  key={kind}
                  kind={kind}
                  levelId={levelId}
                  ink={ink}
                  rank={kind === "daily" ? board?.rank : null}
                  onOpen={() =>
                    boardLocked ? requestSignIn() : setHallKind(kind)
                  }
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="mt-1">
            <DiscoverLevelCard
              seals={seals}
              catalogSize={discoverCatalog.length}
              ink={ink}
              onOpenBadges={onOpenBadges}
            />

            <button
              type="button"
              onClick={onOpenBadges}
              className={`relative mt-3 flex w-full items-center gap-3 overflow-hidden rounded-xl border px-3 py-3 text-left ${cardTone}`}
            >
              <CardArt art={STUDY_ART.badges} ink={ink} />
              <MedalIcon className={`relative h-5 w-5 shrink-0 ${heading}`} />
              <div className="relative min-w-0 flex-1">
                <p
                  className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${label}`}
                >
                  {WORLD.studyBadges}
                </p>
                <p className={`mt-0.5 text-sm ${heading}`}>
                  {worn
                    ? `Wearing ${worn.title}${worn.kind === "discover" ? ` · ${worn.label}` : ""}`
                    : "Assessment ranks and Discover seals"}
                </p>
              </div>
              <span className={`relative ${muted}`}>›</span>
            </button>

            <div
              className={`relative mt-3 flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-3 ${cardTone}`}
            >
              <CardArt art={STUDY_ART.streak} ink={ink} />
              <FlameIcon
                filled={streak > 0}
                className={`relative h-5 w-5 ${streak > 0 ? "text-amber-700" : muted}`}
              />
              <div className="relative min-w-0 flex-1">
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

            <h2 className={`mt-5 font-serif text-lg ${heading}`}>
              {WORLD.unchartedArchives}
              {!isPro && (
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${box}`}
                >
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
              className={`relative mt-2 flex w-full items-center justify-between overflow-hidden rounded-xl border px-4 py-3 text-left disabled:opacity-50 ${cardTone}`}
            >
              <CardArt art={STUDY_ART.practice} ink={ink} />
              <span className="relative">
                <span className={`block text-sm font-medium ${heading}`}>
                  Mixed practice
                </span>
                <span className={`mt-0.5 block text-[12px] ${muted}`}>
                  {practiceReady
                    ? "Title, artist, date, and more — about the piece on screen"
                    : "Not enough artworks yet"}
                </span>
              </span>
              <span className={`relative ${muted}`}>›</span>
            </button>
          </div>
        )}
      </QuizScrollFrame>
      <HallScreen
        open={hallKind != null}
        kind={hallKind ?? "daily"}
        levelId={levelId}
        board={board}
        onClose={() => setHallKind(null)}
      />
    </>
  );
}

