import { useEffect, useState, type ComponentType } from "react";
import type { QuizQuestion } from "@/lib/quiz";
import type { AnswerType, PlayerResponse, QuizItem } from "@/lib/quiz/engine/types";
import { scoreResponse } from "@/lib/quiz/engine/scoring";
import { errorHaptic, successHaptic } from "@/lib/haptics";
import EngineImage from "./EngineImage";
import ChoiceAnswer from "./ChoiceAnswer";
import OrderAnswer from "./OrderAnswer";
import MatchAnswer from "./MatchAnswer";
import NumericAnswer from "./NumericAnswer";
import TextAnswer from "./TextAnswer";
import type { AnswerProps, AnswerResult } from "./shared";

/** One renderer per answer type — styles never need their own screen. */
const RENDERERS: Record<AnswerType, ComponentType<AnswerProps>> = {
  single: ChoiceAnswer,
  binary: ChoiceAnswer,
  multi: ChoiceAnswer,
  order: OrderAnswer,
  match: MatchAnswer,
  numeric: NumericAnswer,
  text: TextAnswer,
};

interface EngineQuestionProps {
  question: QuizQuestion;
  index: number;
  total: number;
  /** The recorded answer (0 right / -1 wrong), or null before answering. */
  selected: number | null;
  onSelect: (choice: number) => void;
  /** Skip the wait after answering. */
  onContinue?: () => void;
}

/**
 * A question-engine question: media on top (artwork, placard, clues), the
 * prompt, then the renderer for its answer type. Scores locally and reports
 * right (0) / wrong (-1) through `onSelect`, like the classic card.
 */
export default function EngineQuestion({
  question,
  index,
  total,
  selected,
  onSelect,
  onContinue,
}: EngineQuestionProps) {
  const item = question.item!;
  const [result, setResult] = useState<AnswerResult | null>(null);
  const answered = result !== null || selected !== null;
  const Renderer = RENDERERS[item.answer_type];

  const submit = (response: PlayerResponse) => {
    if (answered) return;
    const score = scoreResponse(item.answer_type, item.answer, response);
    setResult({ response, score });
    if (score.correct) successHaptic();
    else errorHaptic();
    onSelect(score.correct ? 0 : -1);
  };

  return (
    <div className="h-full overflow-y-auto overscroll-contain pb-[calc(env(safe-area-inset-bottom)+1.5rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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

      <div className="mt-4 px-5">
        <Media item={item} answered={answered} />
      </div>

      <div className="mt-5 px-5">
        <p className="text-center font-serif text-[18px] leading-snug text-white">
          {item.prompt}
        </p>
        <div className="mt-4">
          {Renderer ? (
            <Renderer item={item} result={result} onSubmit={submit} />
          ) : null}
        </div>

        {result && (
          <div
            className={`mt-4 rounded-2xl border px-4 py-3 ${
              result.score.correct
                ? "border-emerald-400/40 bg-emerald-400/10"
                : "border-red-400/35 bg-red-400/10"
            }`}
          >
            <p className="text-sm font-semibold text-white">
              {result.score.correct
                ? "Correct"
                : result.score.fraction > 0
                  ? `Partly right · ${Math.round(result.score.fraction * 100)}%`
                  : "Not quite"}
            </p>
            {item.explain && (
              <p className="mt-1 text-[13px] leading-snug text-white/70">{item.explain}</p>
            )}
            {onContinue && (
              <button
                type="button"
                onClick={onContinue}
                className="mt-3 w-full rounded-xl bg-white/10 py-2.5 text-sm font-semibold text-white"
              >
                Next ›
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Badge({ label }: { label: string }) {
  return (
    <span className="absolute left-3 top-3 z-10 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80 backdrop-blur-md">
      {label}
    </span>
  );
}

/** The top of the card: artwork (with effects), placard text, or clues. */
function Media({ item, answered }: { item: QuizItem; answered: boolean }) {
  const m = item.media;
  const showImage = Boolean(m.image_url) && !(m.image_after_answer && !answered);

  if (m.caption) {
    return (
      <div className="relative rounded-3xl border border-[#5c3d12]/50 bg-[#f5ead2] px-5 pb-5 pt-11 text-[#2a1c0c]">
        <Badge label={m.label} />
        <p className="font-serif text-[16px] leading-relaxed">“{m.caption}”</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {m.clues?.length ? <Clues clues={m.clues} seconds={m.reveal_seconds ?? 3} answered={answered} label={m.label} /> : null}
      {showImage ? (
        <div className="relative aspect-square max-h-[min(36vh,330px)] w-full overflow-hidden rounded-3xl border border-white/10 bg-[#120c08]">
          {!m.clues?.length && <Badge label={m.label} />}
          <EngineImage
            src={m.image_url!}
            accent={m.accent}
            alt="Artwork in the question"
            crop={m.crop}
            flip={m.flip}
            hole={m.hole}
            reveal={m.reveal}
            revealSeconds={m.reveal_seconds}
            revealed={answered}
            seed={item.id}
            maxWidth={340}
            contain={!m.crop && !m.hole}
          />
          {m.compare && (
            <div className="absolute bottom-2 right-2 w-[34%]">
              <div className="relative aspect-square overflow-hidden rounded-xl border-2 border-amber-200/70 bg-[#120c08]">
                <EngineImage
                  src={m.compare.image_url}
                  accent={m.compare.accent}
                  alt={m.compare.label}
                  seed={`${item.id}:compare`}
                  thumbWidth={140}
                  contain
                />
              </div>
              <p className="mt-1 truncate rounded bg-black/60 px-1.5 py-0.5 text-center text-[10px] text-white/85">
                vs {m.compare.label}
              </p>
            </div>
          )}
        </div>
      ) : !m.clues?.length ? (
        <div className="relative h-8">
          <Badge label={m.label} />
        </div>
      ) : null}
    </div>
  );
}

/** Clues appear one at a time; all show once answered. */
function Clues({
  clues,
  seconds,
  answered,
  label,
}: {
  clues: string[];
  seconds: number;
  answered: boolean;
  label: string;
}) {
  const [shown, setShown] = useState(1);
  useEffect(() => {
    if (answered) return;
    const timer = setInterval(
      () => setShown((n) => Math.min(clues.length, n + 1)),
      Math.max(1, seconds) * 1000,
    );
    return () => clearInterval(timer);
  }, [answered, seconds, clues.length]);
  const visible = answered ? clues.length : shown;
  return (
    <div className="relative rounded-3xl border border-white/10 bg-white/[0.04] px-4 pb-4 pt-11">
      <Badge label={label} />
      <ol className="space-y-2">
        {clues.map((clue, i) => (
          <li
            key={clue}
            className={`flex items-center gap-3 text-[15px] transition-opacity duration-500 ${
              i < visible ? "text-white opacity-100" : "opacity-0"
            }`}
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-200/15 text-[12px] font-semibold text-amber-100">
              {i + 1}
            </span>
            {clue}
          </li>
        ))}
      </ol>
    </div>
  );
}
