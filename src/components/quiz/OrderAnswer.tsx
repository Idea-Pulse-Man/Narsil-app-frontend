import { useState } from "react";
import type { OrderAnswer as Order } from "@/lib/quiz/engine/types";
import { tapHaptic } from "@/lib/haptics";
import {
  ImageTile,
  SubmitButton,
  TextOption,
  type AnswerProps,
} from "./shared";
import { gridCols } from "./layout";

/**
 * Tap the options in order (1, 2, 3…). Tapping a numbered one takes it back
 * out. After answering each tile shows its right position.
 */
export default function OrderAnswer({ item, result, onSubmit }: AnswerProps) {
  const [seq, setSeq] = useState<string[]>([]);
  const answered = result !== null;
  const played = result?.response.kind === "order" ? result.response.ids : seq;
  const order = (item.answer as Order).order;
  const images = item.options.some((o) => o.image_url);

  const tap = (id: string) => {
    if (answered) return;
    tapHaptic();
    setSeq((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const info = (id: string) => {
    const mine = played.indexOf(id);
    const right = order.indexOf(id);
    if (!answered) {
      return { tone: mine >= 0 ? ("active" as const) : ("idle" as const), badge: mine >= 0 ? String(mine + 1) : undefined };
    }
    const ok = mine === right;
    return {
      tone: ok ? ("right" as const) : ("wrong" as const),
      badge: ok ? `${right + 1}` : `${mine + 1}→${right + 1}`,
    };
  };

  return (
    <div>
      {images ? (
        <div className={`grid ${gridCols(item.media.columns)} gap-2.5`}>
          {item.options.map((o, i) => {
            const { tone, badge } = info(o.id);
            return (
              <ImageTile
                key={o.id}
                option={o}
                seed={item.id}
                tone={tone}
                badge={badge}
                disabled={answered}
                label={`Work ${i + 1}`}
                note={answered ? o.note : undefined}
                onClick={() => tap(o.id)}
              />
            );
          })}
        </div>
      ) : (
        <div className="space-y-2.5">
          {item.options.map((o) => {
            const { tone, badge } = info(o.id);
            return (
              <TextOption
                key={o.id}
                label={o.label ?? ""}
                tone={tone}
                disabled={answered}
                onClick={() => tap(o.id)}
                trailing={badge ? <span className="font-semibold tabular-nums">{badge}</span> : null}
              />
            );
          })}
        </div>
      )}
      {!answered && (
        <SubmitButton
          label={seq.length === item.options.length ? "Lock in order" : `Tap in order (${seq.length}/${item.options.length})`}
          disabled={seq.length !== item.options.length}
          onClick={() => onSubmit({ kind: "order", ids: seq })}
        />
      )}
    </div>
  );
}
