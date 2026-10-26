import { useState } from "react";
import { motion } from "framer-motion";
import { appraisalFor, WORLD } from "@/data/worldCopy";
import type { QuizQuestion, DailyPointsBreakdown } from "@/lib/quiz";
import { levelTitle, nextThreshold, personLevelNumber } from "@/lib/quiz";
import type { LevelBoard } from "@/lib/quizRemote";
import { scrollForLevel, scrollPalette } from "@/lib/quiz/scrolls";
import BlurImage from "./BlurImage";
import RuneLoader from "./RuneLoader";
import { FlameIcon } from "./Icons";
import PersonLevelFrame from "./PersonLevelFrame";
import QuizRanking from "./QuizRanking";
import QuizScrollFrame from "./QuizScrollFrame";
import HallScreen from "./HallScreen";
import StreakCelebration from "./StreakCelebration";

interface QuizResultsProps {
  score: number;
  total: number;
  streak: number;
  isDaily: boolean;
  milestone: number | null;
  questions: QuizQuestion[];
  correct: boolean[];
  points: DailyPointsBreakdown | null;
  totalPoints: number;
  levelId: number;
  leveledUp: boolean;
  board: LevelBoard | null;
  boardLocked: boolean;
  onOpenArtwork: (artworkId: string) => void;
  onDone: () => void;
}

export default function QuizResults({
  score,
  total,
  streak,
  isDaily,
  milestone,
  questions,
  correct,
  points,
  totalPoints,
  levelId,
  leveledUp,
  board,
  boardLocked,
  onOpenArtwork,
  onDone,
}: QuizResultsProps) {
  const appraisal = appraisalFor(score, total, isDaily);
  const title = levelTitle(levelId);
  const next = nextThreshold(levelId);
  const { ink } = scrollForLevel(levelId);
  const dark = ink === "dark";
  const { heading, muted, accent, box } = scrollPalette(ink);
  const plus = dark ? "text-[#1f5a2c]" : "text-emerald-300";
  const [hallOpen, setHallOpen] = useState(false);

  return (
    <>
      <QuizScrollFrame
        levelId={levelId}
        className={milestone !== null ? "pt-4" : ""}
        footer={
          <div className="relative px-[13%] pb-1 pt-2">
            <button
              type="button"
              onClick={onDone}
              className="w-full rounded-2xl bg-[#2a1c0c] py-3.5 text-center text-sm font-semibold text-[#f6ead0] shadow-[0_8px_20px_rgba(0,0,0,0.35)] transition-transform active:scale-[0.99]"
            >
              Done
            </button>
          </div>
        }
      >
        {milestone !== null && <StreakCelebration streak={milestone} />}

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="text-center"
        >
          {leveledUp && (
            <p className={`mb-2 text-[11px] font-semibold uppercase tracking-[0.22em] ${accent}`}>
              Level up
            </p>
          )}
          <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${accent}`}>
            {isDaily
              ? `${WORLD.royalAssessment} complete`
              : `${WORLD.unchartedArchives} complete`}
          </p>

          <div className="mt-4 flex justify-center">
            <PersonLevelFrame levelId={levelId} size={96} />
          </div>
          <p className={`mt-3 font-serif text-3xl ${heading}`}>{title}</p>
          <p className={`mt-0.5 text-xs font-medium uppercase tracking-[0.16em] ${muted}`}>
            Person level {personLevelNumber(levelId)}
          </p>
          <p className={`mt-1 text-sm ${muted}`}>
            {totalPoints.toLocaleString()} pts
            {next != null && (
              <span>
                {" "}
                · next {next.toLocaleString()}
              </span>
            )}
          </p>

          {points && (
            <div className={`mx-auto mt-4 max-w-xs rounded-2xl border px-4 py-3 text-left text-sm ${box}`}>
              <div className={`flex justify-between ${muted}`}>
                <span>Base</span>
                <span className={`tabular-nums ${heading}`}>{points.base}</span>
              </div>
              <div className={`mt-1 flex justify-between ${muted}`}>
                <span>Time bonus</span>
                <span className={`tabular-nums ${plus}`}>+{points.time}</span>
              </div>
              <div className={`mt-1 flex justify-between ${muted}`}>
                <span>Continue bonus</span>
                <span className={`tabular-nums ${plus}`}>+{points.continue}</span>
              </div>
              {points.perfectBonus > 0 && (
                <div className={`mt-1 flex justify-between ${muted}`}>
                  <span>Perfect</span>
                  <span className={`tabular-nums ${accent}`}>
                    +{points.perfectBonus}
                  </span>
                </div>
              )}
              <div
                className={`mt-2 flex justify-between border-t pt-2 font-semibold ${heading} ${
                  dark ? "border-[#5c3d12]/20" : "border-white/10"
                }`}
              >
                <span>Today</span>
                <span className="tabular-nums">
                  +{points.total.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          <p className={`mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] ${muted}`}>
            {WORLD.appraisal}
          </p>
          <p className={`mt-2 font-serif text-[40px] leading-none ${heading}`}>
            {score}
            <span className={muted}>/{total}</span>
          </p>
          {appraisal.title && (
            <p className={`mt-3 font-serif text-lg leading-snug ${heading}`}>
              {appraisal.title}
            </p>
          )}
          <p className={`mt-2 text-sm leading-relaxed ${muted}`}>
            {appraisal.message}
          </p>

          {isDaily && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.25, type: "spring", stiffness: 300, damping: 18 }}
              className={`mt-4 inline-flex items-center gap-2 rounded-full border px-4 py-2 ${box}`}
            >
              <FlameIcon filled className={`h-5 w-5 ${accent}`} />
              <span className={`text-sm font-semibold ${heading}`}>
                {streak} day{streak === 1 ? "" : "s"} streak
              </span>
            </motion.div>
          )}
        </motion.div>

        {isDaily && (
          <div className="mt-7">
            <QuizRanking
              levelId={levelId}
              board={board}
              boardLocked={boardLocked}
              ink={ink}
              onEnterHall={() => setHallOpen(true)}
            />
          </div>
        )}

        <div className="mt-7 space-y-2.5 pb-2">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${muted}`}>
            Review works
          </p>
          {questions.map((q, i) => (
            <button
              key={q.id}
              type="button"
              onClick={() => onOpenArtwork(q.artworkId)}
              className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left ${box}`}
            >
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                <BlurImage
                  src={q.artwork.image}
                  alt={q.artwork.title}
                  accent={q.artwork.accent}
                  thumbWidth={120}
                  placeholder={<RuneLoader size={44} />}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${heading}`}>
                  {q.artwork.title}
                </p>
                <p className={`truncate text-[12px] ${muted}`}>{q.artwork.year}</p>
              </div>
              <span
                className={`shrink-0 text-[11px] font-semibold ${
                  correct[i]
                    ? dark
                      ? "text-[#2f6b3a]"
                      : "text-emerald-300"
                    : dark
                      ? "text-[#8b2e2e]"
                      : "text-red-300/80"
                }`}
              >
                {correct[i] ? "Correct" : "Missed"}
              </span>
            </button>
          ))}
        </div>
      </QuizScrollFrame>
      <HallScreen
        open={hallOpen}
        levelId={levelId}
        board={board}
        onClose={() => setHallOpen(false)}
      />
    </>
  );
}
