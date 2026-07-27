import { motion } from "framer-motion";
import type { QuizQuestion } from "@/lib/quiz";
import BlurImage from "./BlurImage";
import { FlameIcon } from "./Icons";
import StreakCelebration from "./StreakCelebration";

interface QuizResultsProps {
  score: number;
  total: number;
  /** Current streak after this session (daily only). */
  streak: number;
  isDaily: boolean;
  /** Milestone streak reached this session (triggers the celebration), else null. */
  milestone: number | null;
  /** The questions just played, so results can link back to each artwork. */
  questions: QuizQuestion[];
  /** Per-question correctness, index-aligned with `questions`. */
  correct: boolean[];
  onOpenArtwork: (artworkId: string) => void;
  onDone: () => void;
}

/** A short line that scales praise to the score. */
function verdict(score: number, total: number): string {
  const ratio = total === 0 ? 0 : score / total;
  if (ratio === 1) return "Flawless. A true connoisseur.";
  if (ratio >= 0.7) return "Sharp eye — well played.";
  if (ratio >= 0.4) return "Not bad. The gallery grows on you.";
  return "Every master started somewhere.";
}

export default function QuizResults({
  score,
  total,
  streak,
  isDaily,
  milestone,
  questions,
  correct,
  onOpenArtwork,
  onDone,
}: QuizResultsProps) {
  return (
    <div className="relative flex h-full flex-col">
      {milestone !== null && <StreakCelebration streak={milestone} />}
      <div
        className={`flex-1 overflow-y-auto overscroll-contain px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          milestone !== null ? "pt-28" : "pt-10"
        }`}
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="text-center"
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
            {isDaily ? "Daily quiz complete" : "Practice complete"}
          </p>
          <p className="mt-3 font-serif text-[56px] leading-none text-white">
            {score}
            <span className="text-white/40">/{total}</span>
          </p>
          <p className="mt-3 text-sm text-white/55">{verdict(score, total)}</p>

          {isDaily && (
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.25, type: "spring", stiffness: 300, damping: 18 }}
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-300/10 px-4 py-2"
            >
              <FlameIcon filled className="h-5 w-5 text-amber-300" />
              <span className="text-sm font-semibold text-white">
                {streak} day{streak === 1 ? "" : "s"} streak
              </span>
            </motion.div>
          )}
        </motion.div>

        {/* Review the works */}
        <div className="mt-8 space-y-2.5 pb-4">
          {questions.map((q, i) => (
            <button
              key={q.id}
              type="button"
              onClick={() => onOpenArtwork(q.artworkId)}
              className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 text-left transition-colors hover:bg-white/[0.06]"
            >
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl">
                <BlurImage
                  src={q.artwork.image}
                  alt={q.artwork.title}
                  accent={q.artwork.accent}
                  thumbWidth={120}
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">
                  {q.artwork.title}
                </p>
                <p className="truncate text-[12px] text-white/45">
                  {q.artwork.year}
                </p>
              </div>
              <span
                className={`shrink-0 text-[11px] font-semibold ${
                  correct[i] ? "text-emerald-300" : "text-red-300/80"
                }`}
              >
                {correct[i] ? "Correct" : "Missed"}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="border-t border-white/10 bg-ink/90 px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] pt-4 backdrop-blur-xl">
        <button
          type="button"
          onClick={onDone}
          className="w-full rounded-2xl bg-white py-3.5 text-center text-sm font-semibold text-ink transition-transform active:scale-[0.99]"
        >
          Done
        </button>
      </div>
    </div>
  );
}
