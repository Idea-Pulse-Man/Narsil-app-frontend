/**
 * Admin — today's shared Royal Assessment. Special problems are pinned with
 * source = admin so the daily cron will not replace them.
 */

import { useCallback, useEffect, useState } from "react";
import { MODE_LABEL, QUIZ_MODES, type QuizMode } from "@/lib/quiz";
import {
  addDailySpecial,
  deleteDailyQuestion,
  fetchAdminDailyEdition,
  setDailyLock,
  utcQuizDate,
  type DailyEdition,
} from "@/lib/dailyQuiz";
import type { ToastState } from "./Toast";

interface DailyQuizAdminProps {
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

const inputClass =
  "w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/45";

export default function DailyQuizAdmin({ showToast }: DailyQuizAdminProps) {
  const [date, setDate] = useState(utcQuizDate);
  const [edition, setEdition] = useState<DailyEdition | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<QuizMode>("what");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correct, setCorrect] = useState(0);
  const [imageUrl, setImageUrl] = useState("");
  const [title, setTitle] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEdition(await fetchAdminDailyEdition(date));
    } catch (err) {
      setEdition(null);
      setError(
        err instanceof Error
          ? err.message
          : "Could not load the daily quiz. Run supabase/daily-quiz.sql?",
      );
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
  }, [load]);

  const add = async () => {
    if (!imageUrl.trim()) {
      showToast("An image URL is required.", "error");
      return;
    }
    if (options.some((o) => !o.trim()) || !prompt.trim()) {
      showToast("Prompt and all four options are required.", "error");
      return;
    }
    setBusy(true);
    try {
      await addDailySpecial({
        quizDate: date,
        mode,
        prompt,
        options,
        correctIndex: correct,
        imageUrl,
        title,
      });
      setPrompt("");
      setOptions(["", "", "", ""]);
      setImageUrl("");
      setTitle("");
      setOpen(false);
      showToast("Special problem pinned");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not pin the problem.", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await deleteDailyQuestion(id);
      showToast("Problem removed");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const toggleLock = async () => {
    if (!edition) return;
    setBusy(true);
    try {
      await setDailyLock(date, !edition.locked);
      showToast(edition.locked ? "Day unlocked for the cron" : "Day locked");
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not update the lock.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mb-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
            Royal Assessment
          </p>
          <p className="mt-1 font-serif text-lg text-white">Shared daily set</p>
        </div>
        <label className="text-xs text-white/50">
          UTC date
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={`${inputClass} mt-1`}
          />
        </label>
      </div>

      {loading && <p className="mt-3 text-sm text-white/50">Loading…</p>}
      {error && <p className="mt-3 text-sm text-red-300">{error}</p>}

      {edition && !loading && (
        <>
          <p className="mt-3 text-xs text-white/45">
            {edition.questions.length} problem{edition.questions.length === 1 ? "" : "s"}
            {edition.locked
              ? " · locked — the cron will not add more"
              : " · open — the cron fills this day up to 10 and keeps specials"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-ink"
            >
              {open ? "Close" : "Add special problem"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggleLock()}
              className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-white/80"
            >
              {edition.locked ? "Unlock day" : "Lock day"}
            </button>
          </div>

          {open && (
            <div className="mt-4 space-y-2">
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as QuizMode)}
                className={inputClass}
              >
                {QUIZ_MODES.map((m) => (
                  <option key={m} value={m}>
                    {MODE_LABEL[m]}
                  </option>
                ))}
              </select>
              <input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Prompt"
                className={inputClass}
              />
              {options.map((option, i) => (
                <label key={i} className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="daily-correct"
                    checked={correct === i}
                    onChange={() => setCorrect(i)}
                    aria-label={`Correct option ${i + 1}`}
                  />
                  <input
                    value={option}
                    onChange={(e) =>
                      setOptions((prev) => prev.map((o, idx) => (idx === i ? e.target.value : o)))
                    }
                    placeholder={`Option ${i + 1}`}
                    className={inputClass}
                  />
                </label>
              ))}
              <input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Image URL"
                className={inputClass}
              />
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title shown on the results card"
                className={inputClass}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void add()}
                className="rounded-full bg-emerald-400/90 px-4 py-2 text-xs font-semibold text-ink disabled:opacity-50"
              >
                Pin special
              </button>
            </div>
          )}

          <ul className="mt-4 space-y-2">
            {edition.questions.map((q) => (
              <li
                key={q.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-white/10 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-white">{q.prompt}</p>
                  <p className="text-[11px] text-white/50">
                    {q.position}. {q.source === "admin" ? "Special" : "Generated"} ·{" "}
                    {MODE_LABEL[q.mode as QuizMode] ?? q.mode}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void remove(q.id)}
                  className="shrink-0 text-[11px] text-red-300"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
