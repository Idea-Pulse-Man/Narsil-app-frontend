import { useState } from "react";
import type { MatchAnswer as Match } from "@/lib/quiz/engine/types";
import { tapHaptic } from "@/lib/haptics";
import {
  ImageTile,
  SubmitButton,
  TextOption,
  type AnswerProps,
} from "./shared";
import { gridCols } from "./layout";

/**
 * Pick an option (it glows), then tap the label it belongs to. The next
 * unmatched option is picked automatically, so sorting six works is six taps.
 */
export default function MatchAnswer({ item, result, onSubmit }: AnswerProps) {
  const targets = item.media.targets ?? [];
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [active, setActive] = useState<string | null>(item.options[0]?.id ?? null);
  const answered = result !== null;
  const played = result?.response.kind === "match" ? result.response.pairs : assign;
  const pairs = (item.answer as Match).pairs;
  const labelOf = (id?: string) => targets.find((t) => t.id === id)?.label ?? "";
  const images = item.options.some((o) => o.image_url);
  const done = item.options.every((o) => assign[o.id]);

  const assignTo = (targetId: string) => {
    if (answered || !active) return;
    tapHaptic();
    const next = { ...assign, [active]: targetId };
    setAssign(next);
    setActive(item.options.find((o) => !next[o.id])?.id ?? null);
  };

  const toneOf = (id: string) => {
    if (answered) return played[id] === pairs[id] ? ("right" as const) : ("wrong" as const);
    return id === active ? ("active" as const) : ("idle" as const);
  };

  const noteOf = (id: string) => {
    if (!answered) return played[id] ? labelOf(played[id]) : "—";
    return played[id] === pairs[id] ? labelOf(pairs[id]) : `→ ${labelOf(pairs[id])}`;
  };

  return (
    <div>
      {!answered && (
        <div className="sticky top-0 z-10 -mx-1 mb-3 flex flex-wrap gap-2 bg-[#1a120c]/95 px-1 py-1.5 backdrop-blur">
          {targets.map((t) => (
            <button
              key={t.id}
              type="button"
              disabled={!active}
              onClick={() => assignTo(t.id)}
              className="rounded-full border border-amber-200/40 bg-amber-200/10 px-3.5 py-2 text-[13px] font-semibold text-amber-50 disabled:opacity-40"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
      {images ? (
        <div className={`grid ${gridCols(item.media.columns ?? (item.options.length > 4 ? 3 : 2))} gap-2.5`}>
          {item.options.map((o, i) => (
            <ImageTile
              key={o.id}
              option={o}
              seed={item.id}
              tone={toneOf(o.id)}
              thumbWidth={item.options.length > 4 ? 130 : 190}
              disabled={answered}
              label={`Work ${i + 1}`}
              note={noteOf(o.id)}
              onClick={() => !answered && setActive(o.id)}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2.5">
          {item.options.map((o) => (
            <TextOption
              key={o.id}
              label={`${o.label ?? ""} · ${noteOf(o.id)}`}
              tone={toneOf(o.id)}
              disabled={answered}
              onClick={() => setActive(o.id)}
            />
          ))}
        </div>
      )}
      {!answered && (
        <SubmitButton
          label={done ? "Check matches" : "Pick a work, then its label"}
          disabled={!done}
          onClick={() => onSubmit({ kind: "match", pairs: assign })}
        />
      )}
    </div>
  );
}
