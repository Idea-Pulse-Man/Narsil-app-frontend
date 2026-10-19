import { useState } from "react";
import type { ChoiceAnswer as Choice } from "@/lib/quiz/engine/types";
import { tapHaptic } from "@/lib/haptics";
import { CheckIcon, CloseIcon } from "../Icons";
import {
  ImageTile,
  SubmitButton,
  TextOption,
  type AnswerProps,
  type TileTone,
} from "./shared";
import { gridCols } from "./layout";

/**
 * single / binary: one tap answers. multi: tap to toggle, then Check.
 * Options are text buttons, an image grid, or a seamless tile grid.
 */
export default function ChoiceAnswer({ item, result, onSubmit }: AnswerProps) {
  const multi = item.answer_type === "multi";
  const need = item.media.select_count;
  const [picked, setPicked] = useState<string[]>([]);
  const answered = result !== null;
  const correct = new Set((item.answer as Choice).correct);
  const chosen = new Set(
    result?.response.kind === "choice" ? result.response.ids : picked,
  );
  const layout =
    item.media.options_as ??
    (item.options.some((o) => o.image_url) ? "image" : "text");

  const toneOf = (id: string): TileTone => {
    if (!answered) return chosen.has(id) ? "active" : "idle";
    const isRight = correct.has(id);
    if (chosen.has(id)) return isRight ? "right" : "wrong";
    if (isRight) return multi ? "missed" : "right";
    return "dim";
  };

  const tap = (id: string) => {
    if (answered) return;
    if (!multi) {
      onSubmit({ kind: "choice", ids: [id] });
      return;
    }
    tapHaptic();
    setPicked((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (need && prev.length >= need) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const canCheck = need ? picked.length === need : picked.length > 0;
  const checkLabel = need
    ? picked.length === need
      ? "Check"
      : `Pick ${need}`
    : picked.length
      ? `Check (${picked.length} picked)`
      : "Tap every match";

  let body;
  if (layout === "text") {
    const twoUp = item.options.length === 2;
    body = (
      <div className={twoUp ? "grid grid-cols-2 gap-2.5" : "space-y-2.5"}>
        {item.options.map((o) => {
          const tone = toneOf(o.id);
          return (
            <TextOption
              key={o.id}
              label={o.label ?? ""}
              tone={tone}
              compact={twoUp}
              disabled={answered}
              onClick={() => tap(o.id)}
              trailing={
                tone === "right" ? (
                  <CheckIcon className="h-5 w-5 shrink-0 text-emerald-300" />
                ) : tone === "wrong" ? (
                  <CloseIcon className="h-5 w-5 shrink-0 text-red-300" />
                ) : null
              }
            />
          );
        })}
      </div>
    );
  } else {
    const flush = layout === "tiles";
    const cols = item.media.columns ?? (flush ? 3 : 2);
    body = (
      <div
        className={`grid ${gridCols(cols)} ${
          flush ? "gap-0.5 overflow-hidden rounded-2xl" : "gap-2.5"
        }`}
      >
        {item.options.map((o, i) => {
          const tone = toneOf(o.id);
          return (
            <ImageTile
              key={o.id}
              option={o}
              seed={item.id}
              tone={tone}
              flush={flush}
              thumbWidth={cols >= 3 ? 130 : 190}
              disabled={answered}
              label={o.label ?? `Option ${i + 1}`}
              note={answered && !flush ? o.note : undefined}
              badge={
                tone === "right" ? "✓" : tone === "wrong" ? "✕" : tone === "active" ? "●" : undefined
              }
              onClick={() => tap(o.id)}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div>
      {body}
      {multi && !answered && (
        <SubmitButton
          label={checkLabel}
          disabled={!canCheck}
          onClick={() => onSubmit({ kind: "choice", ids: picked })}
        />
      )}
    </div>
  );
}
