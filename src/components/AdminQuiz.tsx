/**
 * Admin dashboard — Quiz tab. Authored question bank: list, add, delete,
 * and Generate AI (modal → OpenAI via backend → insert rows).
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { historyEras } from "@/data";
import {
  CANONICAL_EMPIRES,
  MODE_LABEL,
  QUIZ_DIFFICULTIES,
  QUIZ_MODES,
  type QuizDifficulty,
  type QuizMode,
  type TopicKind,
} from "@/lib/quiz";
import {
  deleteQuizQuestion,
  fetchAdminQuizQuestions,
  generateQuizQuestionsAi,
  insertQuizQuestion,
  type QuizBankRow,
} from "@/lib/quizBank";
import {
  AdminListCard,
  AdminState,
  Chip,
  FilterTabs,
  fmtDate,
} from "./admin-ui";
import type { ToastState } from "./Toast";

interface AdminQuizProps {
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

type DiffFilter = "all" | QuizDifficulty;

const DIFF_FILTERS: { id: DiffFilter; label: string }[] = [
  { id: "all", label: "All" },
  ...QUIZ_DIFFICULTIES.map((d) => ({ id: d.id, label: d.label })),
];

const TOPIC_OPTIONS: { kind: TopicKind; id: string; title: string }[] = [
  ...historyEras.map((e) => ({
    kind: "age" as const,
    id: e.id,
    title: e.title,
  })),
  ...CANONICAL_EMPIRES.map((name) => ({
    kind: "empire" as const,
    id: name,
    title: name,
  })),
];

export default function AdminQuiz({ showToast }: AdminQuizProps) {
  const [rows, setRows] = useState<QuizBankRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [diffFilter, setDiffFilter] = useState<DiffFilter>("all");
  const [topicKey, setTopicKey] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);

  const topicParts = useMemo(() => {
    if (topicKey === "all") return { kind: null as TopicKind | null, id: null as string | null };
    const [kind, ...rest] = topicKey.split(":");
    return { kind: kind as TopicKind, id: rest.join(":") };
  }, [topicKey]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchAdminQuizQuestions({
        topicKind: topicParts.kind,
        topicId: topicParts.id,
        difficulty: diffFilter === "all" ? null : diffFilter,
        limit: 80,
        offset: 0,
      });
      setRows(page.rows);
      setTotal(page.total);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load quiz questions. Run supabase/quiz-questions.sql?",
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [topicParts.kind, topicParts.id, diffFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (row: QuizBankRow) => {
    setBusy(row.id);
    try {
      await deleteQuizQuestion(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setTotal((t) => Math.max(0, t - 1));
      showToast("Question deleted");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  const topicLabel = (kind: TopicKind, id: string) =>
    TOPIC_OPTIONS.find((t) => t.kind === kind && t.id === id)?.title ?? id;

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-ink"
        >
          Add problem
        </button>
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          className="rounded-full border border-sky-400/35 bg-sky-400/15 px-3.5 py-1.5 text-xs font-semibold text-sky-100"
        >
          Generate AI
        </button>
      </div>

      <div className="mt-3">
        <label className="block text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
          Topic
        </label>
        <select
          value={topicKey}
          onChange={(e) => setTopicKey(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-sm text-white focus:border-white/25 focus:outline-none"
        >
          <option value="all">All topics</option>
          <optgroup label="Ages">
            {TOPIC_OPTIONS.filter((t) => t.kind === "age").map((t) => (
              <option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>
                {t.title}
              </option>
            ))}
          </optgroup>
          <optgroup label="Empires">
            {TOPIC_OPTIONS.filter((t) => t.kind === "empire").map((t) => (
              <option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>
                {t.title}
              </option>
            ))}
          </optgroup>
        </select>
      </div>

      <div className="mt-3">
        <FilterTabs
          value={diffFilter}
          options={DIFF_FILTERS}
          onChange={setDiffFilter}
        />
      </div>

      <div className="mt-4">
        <AdminState
          loading={loading}
          error={error}
          empty={rows.length === 0}
          emptyLabel="No quiz problems yet. Add one or generate with AI."
          onRetry={() => void load()}
        />

        {rows.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-white/40">
              {total} problem{total === 1 ? "" : "s"}
            </p>
            {rows.map((row) => (
              <AdminListCard
                key={row.id}
                initial={MODE_LABEL[row.mode as QuizMode]?.slice(0, 2) ?? "Q"}
                title={row.prompt}
                meta={`${topicLabel(row.topic_kind, row.topic_id)} · ${difficultySpecLabel(row.difficulty)} · ${MODE_LABEL[row.mode as QuizMode] ?? row.mode} · ${fmtDate(row.created_at)}`}
                badges={
                  <span className="rounded-full border border-white/12 px-2 py-0.5 text-[11px] text-white/55">
                    {difficultySpecLabel(row.difficulty)}
                  </span>
                }
                actions={
                  <>
                    <span className="text-[11px] text-white/35">
                      Answer: {row.options[row.correct_index] ?? "—"}
                    </span>
                    <span className="flex-1" />
                    <Chip
                      label="Delete"
                      tone="danger"
                      disabled={busy === row.id}
                      onClick={() => void remove(row)}
                    />
                  </>
                }
              />
            ))}
          </div>
        )}
      </div>

      {addOpen && (
        <AddProblemModal
          onClose={() => setAddOpen(false)}
          onSaved={async () => {
            setAddOpen(false);
            await load();
            showToast("Problem added");
          }}
          showToast={showToast}
        />
      )}

      {aiOpen && (
        <GenerateAiModal
          onClose={() => setAiOpen(false)}
          onDone={async (n) => {
            setAiOpen(false);
            await load();
            showToast(
              n === 1 ? "1 problem generated" : `${n} problems generated`,
            );
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function difficultySpecLabel(id: QuizDifficulty): string {
  return QUIZ_DIFFICULTIES.find((d) => d.id === id)?.label ?? id;
}

function AddProblemModal({
  onClose,
  onSaved,
  showToast,
}: {
  onClose: () => void;
  onSaved: () => Promise<void>;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}) {
  const [topicKey, setTopicKey] = useState(`${TOPIC_OPTIONS[0]?.kind}:${TOPIC_OPTIONS[0]?.id}`);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("apprentice");
  const [mode, setMode] = useState<QuizMode>("what");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [correctIndex, setCorrectIndex] = useState(0);
  const [artworkId, setArtworkId] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const [kind, ...rest] = topicKey.split(":");
    const topicId = rest.join(":");
    if (!prompt.trim() || options.some((o) => !o.trim())) {
      showToast("Fill in the prompt and all four options.", "error");
      return;
    }
    setBusy(true);
    try {
      await insertQuizQuestion({
        topicKind: kind as TopicKind,
        topicId,
        difficulty,
        mode,
        prompt: prompt.trim(),
        options: options.map((o) => o.trim()),
        correctIndex,
        artworkId: artworkId.trim() || null,
      });
      await onSaved();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Add problem" onClose={onClose}>
      <Field label="Topic">
        <select
          value={topicKey}
          onChange={(e) => setTopicKey(e.target.value)}
          className={fieldClass}
        >
          {TOPIC_OPTIONS.map((t) => (
            <option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>
              {t.kind === "age" ? "Age" : "Empire"}: {t.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Difficulty">
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as QuizDifficulty)}
          className={fieldClass}
        >
          {QUIZ_DIFFICULTIES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label} ({d.questionCount} Q)
            </option>
          ))}
        </select>
      </Field>
      <Field label="Mode">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as QuizMode)}
          className={fieldClass}
        >
          {QUIZ_MODES.map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Prompt">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          className={fieldClass}
          placeholder="What is this work titled?"
        />
      </Field>
      {options.map((opt, i) => (
        <Field key={i} label={`Option ${i + 1}${correctIndex === i ? " (correct)" : ""}`}>
          <div className="flex gap-2">
            <input
              value={opt}
              onChange={(e) => {
                const next = [...options];
                next[i] = e.target.value;
                setOptions(next);
              }}
              className={fieldClass}
            />
            <button
              type="button"
              onClick={() => setCorrectIndex(i)}
              className={`shrink-0 rounded-full px-3 text-xs ${
                correctIndex === i
                  ? "bg-emerald-400/20 text-emerald-100"
                  : "border border-white/12 text-white/45"
              }`}
            >
              Correct
            </button>
          </div>
        </Field>
      ))}
      <Field label="Artwork id (optional)">
        <input
          value={artworkId}
          onChange={(e) => setArtworkId(e.target.value)}
          className={fieldClass}
          placeholder="Catalog artwork id for the image"
        />
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/70"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-ink disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}

function GenerateAiModal({
  onClose,
  onDone,
  showToast,
}: {
  onClose: () => void;
  onDone: (count: number) => Promise<void>;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}) {
  const [topicKey, setTopicKey] = useState(`${TOPIC_OPTIONS[0]?.kind}:${TOPIC_OPTIONS[0]?.id}`);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("apprentice");
  const [count, setCount] = useState(5);
  const [mode, setMode] = useState<QuizMode | "auto">("auto");
  const [busy, setBusy] = useState(false);

  const generate = async () => {
    const [kind, ...rest] = topicKey.split(":");
    const topicId = rest.join(":");
    const title =
      TOPIC_OPTIONS.find((t) => t.kind === kind && t.id === topicId)?.title ??
      topicId;
    setBusy(true);
    try {
      const generated = await generateQuizQuestionsAi({
        topicKind: kind as TopicKind,
        topicId,
        topicTitle: title,
        difficulty,
        count,
        mode,
      });
      if (!generated.length) {
        showToast("AI returned no questions.", "error");
        return;
      }
      for (const q of generated) {
        await insertQuizQuestion({
          topicKind: kind as TopicKind,
          topicId,
          difficulty,
          mode: q.mode,
          prompt: q.prompt,
          options: q.options,
          correctIndex: q.correct_index,
          artworkId: q.artwork_id,
        });
      }
      await onDone(generated.length);
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Generate failed.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell title="Generate AI" onClose={onClose}>
      <p className="mb-3 text-sm text-white/50">
        Pick a topic and options. Questions are grounded in real catalog works,
        then saved to the bank so you can delete any bad ones.
      </p>
      <Field label="Topic">
        <select
          value={topicKey}
          onChange={(e) => setTopicKey(e.target.value)}
          className={fieldClass}
        >
          {TOPIC_OPTIONS.map((t) => (
            <option key={`${t.kind}:${t.id}`} value={`${t.kind}:${t.id}`}>
              {t.kind === "age" ? "Age" : "Empire"}: {t.title}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Difficulty">
        <select
          value={difficulty}
          onChange={(e) => {
            const next = e.target.value as QuizDifficulty;
            setDifficulty(next);
            const spec = QUIZ_DIFFICULTIES.find((d) => d.id === next);
            if (spec) setCount(spec.questionCount);
          }}
          className={fieldClass}
        >
          {QUIZ_DIFFICULTIES.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Count">
        <select
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className={fieldClass}
        >
          {[5, 7, 10].map((n) => (
            <option key={n} value={n}>
              {n} questions
            </option>
          ))}
        </select>
      </Field>
      <Field label="Mode">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as QuizMode | "auto")}
          className={fieldClass}
        >
          <option value="auto">Auto (mix)</option>
          {QUIZ_MODES.map((m) => (
            <option key={m} value={m}>
              {MODE_LABEL[m]}
            </option>
          ))}
        </select>
      </Field>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/70"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void generate()}
          className="rounded-full bg-sky-400 px-4 py-2 text-sm font-medium text-ink disabled:opacity-40"
        >
          {busy ? "Generating…" : "Generate"}
        </button>
      </div>
    </ModalShell>
  );
}

const fieldClass =
  "w-full rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-white/35 focus:border-white/25 focus:outline-none";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="mt-3 block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-[81] max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-white/12 bg-ink-soft p-5 shadow-placard sm:rounded-[28px]">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/60"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
