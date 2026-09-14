import { motion } from "framer-motion";
import type { QuizQuestion as Question } from "@/lib/quiz";
import { MODE_LABEL } from "@/lib/quiz";
import BlurImage from "./BlurImage";
import { CheckIcon, CloseIcon } from "./Icons";

interface QuizQuestionProps {
  question: Question;
  index: number;
  total: number;
  /** Chosen option, or null before the user has answered. */
  selected: number | null;
  onSelect: (index: number) => void;
  /**
   * When false (Discover trials), never highlight the correct option — only
   * mark the member's own pick as right or wrong.
   */
  revealAnswer?: boolean;
}

/**
 * A single quiz question — big artwork up top, four answer buttons below.
 * Once answered, feedback locks the buttons until the parent advances.
 */
export default function QuizQuestion({
  question,
  index,
  total,
  selected,
  onSelect,
  revealAnswer = true,
}: QuizQuestionProps) {
  const answered = selected !== null;

  return (
    // Scrolls: on short screens the image + four options exceed the viewport,
    // and without this the last answers are unreachable.
    <div className="h-full overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+1.5rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-1.5 px-5 pt-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${
              i === index
                ? "w-5 bg-emerald-300"
                : i < index
                  ? "w-1.5 bg-emerald-300/60"
                  : "w-1.5 bg-white/20"
            }`}
          />
        ))}
      </div>

      {/* Artwork */}
      <div className="mt-4 px-5">
        {/* Height-capped so the answers stay in view on short screens; the
            artwork is `contain`-fitted, so a non-square box letterboxes fine. */}
        <div className="relative aspect-square max-h-[min(38vh,340px)] w-full overflow-hidden rounded-3xl border border-white/10">
          <BlurImage
            key={question.artworkId}
            src={question.artwork.image}
            alt="Artwork to identify"
            accent={question.artwork.accent}
            fit="contain"
            priority
          />
          <span className="absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/80 backdrop-blur-md">
            {MODE_LABEL[question.mode]}
          </span>
        </div>
      </div>

      {/* Prompt + options */}
      <div className="mt-5 px-5">
        <p className="text-center font-serif text-[18px] leading-snug text-white">
          {question.prompt}
        </p>

        <div className="mt-4 space-y-2.5">
          {question.options.map((option, i) => {
            const isCorrect = i === question.correctIndex;
            const isChosen = i === selected;
            const showCorrect = answered && isCorrect && revealAnswer;
            const showChosenRight =
              answered && isChosen && isCorrect && !revealAnswer;
            const showWrong = answered && isChosen && !isCorrect;

            const state = showCorrect || showChosenRight
              ? "border-emerald-400/70 bg-emerald-400/15 text-white"
              : showWrong
                ? "border-red-400/70 bg-red-400/15 text-white"
                : answered
                  ? "border-white/10 bg-white/[0.03] text-white/45"
                  : "border-white/12 bg-white/[0.05] text-white/90 hover:border-white/25 hover:bg-white/[0.08]";

            return (
              <motion.button
                key={`${question.id}:${i}`}
                type="button"
                disabled={answered}
                onClick={() => onSelect(i)}
                whileTap={answered ? undefined : { scale: 0.985 }}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 py-3.5 text-left text-[15px] font-medium transition-colors ${state}`}
              >
                <span className="min-w-0">{option}</span>
                {(showCorrect || showChosenRight) && (
                  <CheckIcon className="h-5 w-5 shrink-0 text-emerald-300" />
                )}
                {showWrong && (
                  <CloseIcon className="h-5 w-5 shrink-0 text-red-300" />
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
