import { useEffect, useState } from "react";
import {
  effectiveStreak,
  hasPlayedToday,
  loadProgress,
  loadDailySession,
  EMPTY_PROGRESS,
  type QuizProgress,
} from "@/lib/quiz";
import { WORLD } from "@/data/worldCopy";
import { FlameIcon } from "./Icons";

interface DailyQuizCardProps {
  onStart: () => void;
  /** Bumped when the quiz overlay closes so the card re-reads progress. */
  refreshKey: number;
}

/**
 * Daily quiz entry on Discover. Hidden after today's assessment is complete;
 * review lives on the Study tab. Re-reads localStorage when `refreshKey`
 * changes so a fresh completion (or resume) updates immediately.
 */
export default function DailyQuizCard({
  onStart,
  refreshKey,
}: DailyQuizCardProps) {
  const [progress, setProgress] = useState<QuizProgress>(EMPTY_PROGRESS);
  const [inProgress, setInProgress] = useState(false);

  useEffect(() => {
    setProgress(loadProgress());
    const session = loadDailySession();
    setInProgress(!!session && !session.completed);
  }, [refreshKey]);

  const streak = effectiveStreak(progress);
  const done = hasPlayedToday(progress);
  const cta = inProgress ? "Resume" : "Play";

  // Once today's assessment is finished, Discover doesn't need the card —
  // review lives on the Study tab.
  if (done && !inProgress) return null;

  return (
    <button
      type="button"
      onClick={onStart}
      className="mt-6 flex w-full items-center gap-4 rounded-3xl border border-emerald-300/25 bg-gradient-to-br from-emerald-400/15 to-emerald-400/[0.04] px-5 py-4 text-left transition-colors hover:border-emerald-300/40"
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-emerald-300/25 bg-emerald-400/10">
        <FlameIcon
          filled={streak > 0}
          className={`h-6 w-6 ${streak > 0 ? "text-amber-300" : "text-emerald-200/80"}`}
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-serif text-lg leading-tight text-white">
          {inProgress
            ? `${WORLD.royalAssessment} — in progress`
            : WORLD.royalAssessment}
        </p>
        <p className="mt-0.5 text-[12px] text-white/55">
          {inProgress
            ? "Pick up where you left off"
            : streak > 0
              ? `${streak} day streak · play to keep it`
              : "Test your eye on today's works"}
        </p>
      </div>
      <span className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-ink">
        {cta}
      </span>
    </button>
  );
}
