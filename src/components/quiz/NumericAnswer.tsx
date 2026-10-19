import { useState } from "react";
import type { NumericAnswer as Numeric } from "@/lib/quiz/engine/types";
import { formatYear } from "@/lib/quiz/engine/scoring";
import { SubmitButton, type AnswerProps } from "./shared";

/** Slider guess. Without a unit the value is a year (negative = BC). */
export default function NumericAnswer({ item, result, onSubmit }: AnswerProps) {
  const slider = item.media.slider ?? { min: 0, max: 100, step: 1 };
  const step = slider.step || 1;
  const [value, setValue] = useState(
    Math.round((slider.min + slider.max) / 2 / step) * step,
  );
  const answered = result !== null;
  const shown =
    result?.response.kind === "numeric" ? result.response.value : value;
  const fmt = (v: number) =>
    slider.unit ? `${v.toLocaleString()} ${slider.unit}` : formatYear(v);
  const answer = item.answer as Numeric;
  const off = Math.abs(shown - answer.value);

  return (
    <div>
      <p className="text-center font-serif text-[40px] leading-none text-white tabular-nums">
        {fmt(shown)}
      </p>
      <input
        type="range"
        min={slider.min}
        max={slider.max}
        step={step}
        value={shown}
        disabled={answered}
        onChange={(e) => setValue(Number(e.target.value))}
        aria-label="Your guess"
        className="mt-5 w-full accent-amber-300"
      />
      <div className="mt-1 flex justify-between text-[12px] text-white/45 tabular-nums">
        <span>{fmt(slider.min)}</span>
        <span>{fmt(slider.max)}</span>
      </div>
      {answered ? (
        <p className="mt-3 text-center text-sm text-white/70">
          Answer: <span className="font-semibold text-white">{answer.display}</span>
          {" · "}
          {off === 0 ? "spot on" : `${off.toLocaleString()} ${slider.unit ?? "years"} off`}
        </p>
      ) : (
        <SubmitButton label="Lock in" onClick={() => onSubmit({ kind: "numeric", value })} />
      )}
    </div>
  );
}
