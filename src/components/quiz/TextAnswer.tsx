import { useMemo, useState } from "react";
import type { TextAnswer as Text } from "@/lib/quiz/engine/types";
import { normalizeText } from "@/lib/quiz/engine/scoring";
import { tapHaptic } from "@/lib/haptics";
import { SubmitButton, type AnswerProps } from "./shared";

/**
 * Letter tiles (unscramble) when the item has `letters`, otherwise a text box
 * with autocomplete from `suggestions` (Artle style).
 */
export default function TextAnswer({ item, result, onSubmit }: AnswerProps) {
  const letters = item.media.letters;
  const answered = result !== null;
  const answer = item.answer as Text;
  return (
    <div>
      {letters?.length ? (
        <LetterTiles letters={letters} locked={answered} onSubmit={onSubmit} />
      ) : (
        <TypeAhead
          suggestions={item.media.suggestions ?? []}
          locked={answered}
          onSubmit={onSubmit}
        />
      )}
      {answered && (
        <p className="mt-3 text-center text-sm text-white/70">
          Answer: <span className="font-semibold text-white">{answer.display}</span>
        </p>
      )}
    </div>
  );
}

function LetterTiles({
  letters,
  locked,
  onSubmit,
}: {
  letters: string[];
  locked: boolean;
  onSubmit: AnswerProps["onSubmit"];
}) {
  const [used, setUsed] = useState<number[]>([]);
  const word = used.map((i) => letters[i]).join("");
  return (
    <div>
      <div className="flex min-h-[52px] items-center justify-center gap-1 rounded-2xl border border-white/12 bg-white/[0.04] px-3 py-2">
        {letters.map((_, i) => (
          <span
            key={i}
            className="flex h-9 w-7 items-center justify-center border-b-2 border-white/30 font-serif text-xl text-white"
          >
            {word[i] ?? ""}
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {letters.map((ch, i) => (
          <button
            key={i}
            type="button"
            disabled={locked || used.includes(i)}
            onClick={() => {
              tapHaptic();
              setUsed((u) => [...u, i]);
            }}
            className="h-11 w-11 rounded-xl border border-amber-200/40 bg-amber-200/10 font-serif text-lg font-semibold text-amber-50 disabled:opacity-25"
          >
            {ch}
          </button>
        ))}
      </div>
      {!locked && (
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={used.length === 0}
            onClick={() => setUsed((u) => u.slice(0, -1))}
            className="flex-1 rounded-2xl border border-white/15 py-3 text-sm font-medium text-white/80 disabled:opacity-35"
          >
            ⌫ Undo
          </button>
          <button
            type="button"
            disabled={used.length !== letters.length}
            onClick={() => onSubmit({ kind: "text", value: word })}
            className="flex-[2] rounded-2xl bg-[#f6ead0] py-3 text-sm font-semibold text-[#2a1c0c] disabled:opacity-35"
          >
            Check
          </button>
        </div>
      )}
    </div>
  );
}

function TypeAhead({
  suggestions,
  locked,
  onSubmit,
}: {
  suggestions: string[];
  locked: boolean;
  onSubmit: AnswerProps["onSubmit"];
}) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const matches = useMemo(() => {
    const q = normalizeText(value);
    if (!q) return [];
    return suggestions.filter((s) => normalizeText(s).includes(q)).slice(0, 6);
  }, [value, suggestions]);

  return (
    <div className="relative">
      <input
        value={value}
        disabled={locked}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        placeholder="Start typing a name…"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className="w-full rounded-2xl border border-white/15 bg-white/[0.05] px-4 py-3.5 text-[15px] text-white outline-none placeholder:text-white/40 focus:border-amber-200/50"
      />
      {open && !locked && matches.length > 0 && (
        <ul className="mt-1.5 overflow-hidden rounded-2xl border border-white/12 bg-[#241a12]">
          {matches.map((m) => (
            <li key={m}>
              <button
                type="button"
                onClick={() => {
                  setValue(m);
                  setOpen(false);
                }}
                className="block w-full px-4 py-2.5 text-left text-sm text-white/85 hover:bg-white/[0.06]"
              >
                {m}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!locked && (
        <SubmitButton
          label="Check"
          disabled={!value.trim()}
          onClick={() => onSubmit({ kind: "text", value })}
        />
      )}
    </div>
  );
}
