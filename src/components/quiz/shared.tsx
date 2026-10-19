import type { ReactNode } from "react";
import type {
  ItemOption,
  PlayerResponse,
  QuizItem,
  ScoreResult,
} from "@/lib/quiz/engine/types";
import EngineImage from "./EngineImage";

export interface AnswerResult {
  response: PlayerResponse;
  score: ScoreResult;
}

/** Props every answer renderer takes. */
export interface AnswerProps {
  item: QuizItem;
  /** Set once answered: input locks and feedback shows. */
  result: AnswerResult | null;
  onSubmit: (response: PlayerResponse) => void;
}

export type TileTone = "idle" | "active" | "right" | "wrong" | "missed" | "dim";

const TONE_CLASS: Record<TileTone, string> = {
  idle: "border-white/12",
  active: "border-amber-300 shadow-[0_0_0_2px_rgba(252,211,77,0.35)]",
  right: "border-emerald-400",
  wrong: "border-red-400",
  missed: "border-amber-300 border-dashed",
  dim: "border-white/8 opacity-55",
};

/** An artwork option tile: image (crop / flip aware) + optional badge + note. */
export function ImageTile({
  option,
  seed,
  tone,
  badge,
  note,
  thumbWidth = 180,
  flush = false,
  onClick,
  disabled,
  label,
}: {
  option: ItemOption;
  seed: string;
  tone: TileTone;
  badge?: ReactNode;
  note?: string;
  thumbWidth?: number;
  /** Tile-grid cells: no rounding or gap, so the picture reads as one. */
  flush?: boolean;
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`relative block w-full text-left ${flush ? "" : "rounded-2xl"} transition-opacity`}
    >
      <span
        className={`relative block aspect-square w-full overflow-hidden border-2 bg-[#120c08] ${
          flush ? "" : "rounded-2xl"
        } ${TONE_CLASS[tone]}`}
      >
        <EngineImage
          src={option.image_url ?? ""}
          accent={option.accent}
          alt=""
          crop={option.crop}
          flip={option.flip}
          seed={`${seed}:${option.id}`}
          thumbWidth={thumbWidth}
          contain={!option.crop}
        />
        {badge && (
          <span className="absolute right-1.5 top-1.5 flex h-7 min-w-7 items-center justify-center rounded-full bg-black/70 px-2 text-sm font-semibold text-white">
            {badge}
          </span>
        )}
      </span>
      {note && (
        <span className="mt-1 block truncate text-center text-[11px] text-white/65">
          {note}
        </span>
      )}
    </button>
  );
}

/** A text option button in the classic quiz style. */
export function TextOption({
  label,
  tone,
  onClick,
  disabled,
  trailing,
  compact = false,
}: {
  label: string;
  tone: TileTone;
  onClick: () => void;
  disabled?: boolean;
  trailing?: ReactNode;
  compact?: boolean;
}) {
  const state =
    tone === "right"
      ? "border-emerald-400/70 bg-emerald-400/15 text-white"
      : tone === "wrong"
        ? "border-red-400/70 bg-red-400/15 text-white"
        : tone === "missed"
          ? "border-amber-300/70 border-dashed bg-amber-300/10 text-white"
          : tone === "active"
            ? "border-amber-300/80 bg-amber-300/15 text-white"
            : tone === "dim"
              ? "border-white/10 bg-white/[0.03] text-white/45"
              : "border-white/12 bg-white/[0.05] text-white/90 hover:border-white/25 hover:bg-white/[0.08]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-4 ${
        compact ? "justify-center py-4 text-center" : "py-3.5 text-left"
      } text-[15px] font-medium transition-colors ${state}`}
    >
      <span className="min-w-0">{label}</span>
      {trailing}
    </button>
  );
}

/** Full-width primary action under an answer (Check / Lock in). */
export function SubmitButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="mt-4 w-full rounded-2xl bg-[#f6ead0] py-3.5 text-center text-sm font-semibold text-[#2a1c0c] transition-opacity disabled:opacity-35"
    >
      {label}
    </button>
  );
}
