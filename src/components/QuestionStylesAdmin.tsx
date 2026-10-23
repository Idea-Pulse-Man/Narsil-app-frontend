/**
 * Admin — Question Styles. Turn each question style on or off, tune its
 * settings, preview samples, and generate questions now. The backend cron
 * (`npm run quiz:generate:prod`) reads the same switches every night.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  FLAG_MIN_PLAYS,
  correctRate,
  fetchEngineConfig,
  fetchItems,
  fetchRuns,
  fetchStyleDefs,
  fetchStyleRows,
  fetchStyleStats,
  previewStyle,
  rebuildTodayDaily,
  runGenerationNow,
  setFocusStyle,
  setStylesEnabled,
  waitForRun,
  setItemStatus,
  updateEngineConfig,
  updateStyle,
  type AdminItem,
  type EngineConfig,
  type GenerationRun,
  type ItemStatus,
  type SettingField,
  type StyleDef,
  type StyleRow,
  type StyleSettings,
  type StyleStats,
} from "@/lib/quizEngineAdmin";
import type {
  ChoiceAnswer,
  MatchAnswer,
  NumericAnswer,
  OrderAnswer,
  QuizItem,
  TextAnswer,
} from "@/lib/quiz/engine/types";
import { sizedImageUrl } from "@/lib/imageUrl";
import { AdminState, Chip, FilterTabs, fmtDate } from "./admin-ui";
import type { ToastState } from "./Toast";

interface Props {
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

const SURFACES = [
  { id: "daily", label: "Daily" },
  { id: "practice", label: "Practice" },
];

/** A style switched on with fewer live questions than this gets some generated at once. */
const MIN_LIVE = 5;

const inputClass =
  "w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2 text-sm text-white outline-none placeholder:text-white/45";

const errorText = (err: unknown, fallback: string) =>
  err instanceof Error ? err.message : fallback;

export default function QuestionStylesAdmin({ showToast }: Props) {
  const [defs, setDefs] = useState<StyleDef[]>([]);
  const [rows, setRows] = useState<Record<string, StyleRow>>({});
  const [stats, setStats] = useState<Record<string, StyleStats>>({});
  const [config, setConfig] = useState<EngineConfig | null>(null);
  const [runs, setRuns] = useState<GenerationRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [itemsFor, setItemsFor] = useState<string | null | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [d, r, s, c, history] = await Promise.all([
        fetchStyleDefs(),
        fetchStyleRows(),
        fetchStyleStats(),
        fetchEngineConfig(),
        fetchRuns(8),
      ]);
      setDefs(d);
      setRows(Object.fromEntries(r.map((row) => [row.id, row])));
      setStats(s);
      setConfig(c);
      setRuns(history);
    } catch (err) {
      setError(errorText(err, "Could not load question styles."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const patchRow = async (id: string, patch: Partial<StyleRow>, done?: string) => {
    setBusy(id);
    try {
      await updateStyle(id, patch);
      setRows((prev) => ({ ...prev, [id]: { ...prev[id]!, ...patch } }));
      if (done) showToast(done);
    } catch (err) {
      showToast(errorText(err, "Save failed."), "error");
    } finally {
      setBusy(null);
    }
  };

  /**
   * Generate now. The backend runs it in the background; we wait on the run
   * history, then report what it made.
   */
  const generate = async (style?: string, count?: number) => {
    setBusy(style ?? "__all");
    try {
      const { runId } = await runGenerationNow({ style, count });
      showToast(style ? "Generating…" : "Generating every style — this can take a minute…");
      const run = await waitForRun(runId);
      const made = Object.values(run.created ?? {}).reduce((a, b) => a + b, 0);
      if (run.status === "failed") {
        showToast(run.problems?.[0] ?? "Generate failed.", "error");
      } else {
        const daily = run.daily_added ? ` · daily +${run.daily_added}` : "";
        showToast(`Generated ${made} question${made === 1 ? "" : "s"}${daily}`);
        if (run.problems?.length) showToast(run.problems.slice(0, 2).join(" · "), "error");
      }
    } catch (err) {
      showToast(errorText(err, "Generate failed."), "error");
    } finally {
      setBusy(null);
      const [s, history] = await Promise.all([
        fetchStyleStats().catch(() => stats),
        fetchRuns(8).catch(() => runs),
      ]);
      setStats(s);
      setRuns(history);
    }
  };

  /** Switch one style on/off; a style switched on with too few questions gets some at once. */
  const toggleStyle = async (id: string) => {
    const row = rows[id];
    if (!row) return;
    const on = !row.enabled;
    const label = defs.find((d) => d.id === id)?.label ?? id;
    await patchRow(id, { enabled: on }, `${label} ${on ? "on" : "off"}`);
    if (on && (stats[id]?.live ?? 0) < MIN_LIVE) await generate(id, row.per_run || 8);
  };

  /** All on / all off. Turning on generates for every style that is short of questions. */
  const setAll = async (on: boolean) => {
    const ids = defs.map((d) => d.id).filter((id) => rows[id]);
    setBusy("__bulk");
    try {
      await setStylesEnabled(ids, on);
      setRows((prev) =>
        Object.fromEntries(Object.entries(prev).map(([id, r]) => [id, { ...r, enabled: on }])),
      );
      showToast(on ? "Every style is on" : "Every style is off — players get classic questions");
    } catch (err) {
      showToast(errorText(err, "Could not update the styles."), "error");
      return;
    } finally {
      setBusy(null);
    }
    if (on && ids.some((id) => (stats[id]?.live ?? 0) < MIN_LIVE)) await generate();
  };

  /** Make today's daily use the styles switched on right now. */
  const rebuildDaily = async () => {
    setBusy("__daily");
    try {
      const res = await rebuildTodayDaily();
      showToast(
        res.total > 0
          ? `Today's daily rebuilt: ${res.total} questions. Players who already started keep their set.`
          : "No questions to build today's daily from — switch styles on (with the Daily chip) and generate first.",
        res.total > 0 ? undefined : "error",
      );
      setRuns(await fetchRuns(8).catch(() => runs));
    } catch (err) {
      showToast(errorText(err, "Rebuild failed."), "error");
    } finally {
      setBusy(null);
    }
  };

  const enabledCount = Object.values(rows).filter((r) => r.enabled).length;
  const focus = config?.focus_style ?? null;
  const focusLabel = focus ? (defs.find((d) => d.id === focus)?.label ?? focus) : null;

  /**
   * Focus mode: every daily + practice question becomes this style (null =
   * back to the normal mix). Tops the style up when it has too few questions.
   */
  const changeFocus = async (style: string | null) => {
    setBusy(style ?? "__focus");
    try {
      await setFocusStyle(style);
      setConfig((c) => (c ? { ...c, focus_style: style } : c));
      const label = style ? (defs.find((d) => d.id === style)?.label ?? style) : null;
      showToast(label ? `Every question is now: ${label}` : "Back to the normal mix");
    } catch (err) {
      showToast(errorText(err, "Could not change focus."), "error");
      setBusy(null);
      return;
    }
    setBusy(null);
    const live = style ? (stats[style]?.live ?? 0) : Infinity;
    const wanted = Math.max(20, (config?.daily_count ?? 10) * 2);
    if (style && live < (config?.daily_count ?? 10)) {
      showToast(`Only ${live} ${live === 1 ? "question" : "questions"} — generating more…`);
      await generate(style, wanted);
    }
  };

  return (
    <section className="mb-8">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg text-white">Question styles</h2>
        <span className="text-xs text-white/50">{enabledCount} on</span>
      </div>
      <p className="mt-1 text-xs text-white/50">
        Switch styles on and the nightly cron (00:10 UTC) generates new questions for them.
        Daily = the Royal Assessment; Practice = the endless Uncharted Archives. Changes reach
        Practice at once; tap <b>Rebuild today's daily</b> to apply them to today's daily too.
      </p>

      <div className="mt-3">
        <AdminState loading={loading} error={error} empty={false} onRetry={() => void load()} />
      </div>

      {!loading && !error && config && (
        <>
          {focus && (
            <div className="mt-3 rounded-2xl border border-amber-300/50 bg-amber-300/10 p-3">
              <p className="text-sm font-semibold text-amber-50">
                Focus: every question is “{focusLabel}”
              </p>
              <p className="mt-1 text-xs leading-snug text-amber-100/75">
                All Daily and Practice questions use only this style, even if it is switched
                off. {stats[focus]?.live ?? 0} live questions.
                {(stats[focus]?.live ?? 0) === 0 &&
                  " None yet — open the style and tap Generate now, or players get classic questions."}
                {" "}Players who already started today's daily keep their set.
              </p>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void changeFocus(null)}
                className="mt-2 rounded-full bg-amber-200 px-3.5 py-1.5 text-xs font-semibold text-ink disabled:opacity-40"
              >
                Clear focus — back to the mix
              </button>
            </div>
          )}

          <EngineSettings
            focused={focus !== null}
            config={config}
            onSave={async (next) => {
              try {
                await updateEngineConfig(next);
                setConfig((c) => (c ? { ...c, ...next } : c));
                showToast("Engine settings saved");
              } catch (err) {
                showToast(errorText(err, "Save failed."), "error");
              }
            }}
          />

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void generate()}
              className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-ink disabled:opacity-40"
            >
              {busy === "__all" ? "Generating…" : "Generate all now"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void rebuildDaily()}
              className="rounded-full border border-amber-200/40 bg-amber-200/10 px-3.5 py-1.5 text-xs font-semibold text-amber-50 disabled:opacity-40"
            >
              {busy === "__daily" ? "Rebuilding…" : "Rebuild today's daily"}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void setAll(true)}
              className="rounded-full border border-emerald-300/40 px-3.5 py-1.5 text-xs font-semibold text-emerald-100 disabled:opacity-40"
            >
              All on
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void setAll(false)}
              className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-white/70 disabled:opacity-40"
            >
              All off
            </button>
            <button
              type="button"
              onClick={() => setItemsFor(null)}
              className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-semibold text-white/75"
            >
              Review questions
            </button>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs text-white/60"
            >
              Refresh
            </button>
          </div>

          <RunHistory runs={runs} />

          <div className="mt-4 space-y-2.5">
            {defs.map((def) => {
              const row = rows[def.id];
              if (!row) {
                return (
                  <p key={def.id} className="rounded-xl border border-amber-300/30 px-3 py-2 text-xs text-amber-100/80">
                    {def.label}: no row in quiz_styles — re-run supabase/quiz-engine.sql.
                  </p>
                );
              }
              return (
                <StyleCard
                  key={def.id}
                  def={def}
                  row={row}
                  stats={stats[def.id]}
                  open={openId === def.id}
                  busy={busy === def.id}
                  focused={focus === def.id}
                  onFocus={() => void changeFocus(focus === def.id ? null : def.id)}
                  onToggleOpen={() => setOpenId(openId === def.id ? null : def.id)}
                  onPatch={(patch, done) => void patchRow(def.id, patch, done)}
                  onToggle={() => void toggleStyle(def.id)}
                  onGenerate={() => void generate(def.id, row.per_run || 5)}
                  onShowItems={() => setItemsFor(def.id)}
                  showToast={showToast}
                />
              );
            })}
          </div>
        </>
      )}

      {itemsFor !== undefined && (
        <ItemsModal
          style={itemsFor}
          label={itemsFor ? (defs.find((d) => d.id === itemsFor)?.label ?? itemsFor) : "All styles"}
          onClose={() => setItemsFor(undefined)}
          onChanged={() => void fetchStyleStats().then(setStats).catch(() => {})}
          showToast={showToast}
        />
      )}
    </section>
  );
}

function EngineSettings({
  config,
  focused,
  onSave,
}: {
  config: EngineConfig;
  focused: boolean;
  onSave: (next: Pick<EngineConfig, "daily_count" | "practice_mix">) => Promise<void>;
}) {
  const [daily, setDaily] = useState(config.daily_count);
  const [mix, setMix] = useState(config.practice_mix);
  const dirty = daily !== config.daily_count || mix !== config.practice_mix;
  return (
    <div className="mt-3 grid grid-cols-2 gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
          Daily questions
        </span>
        <input
          type="number"
          min={1}
          max={30}
          value={daily}
          onChange={(e) => setDaily(clamp(Number(e.target.value), 1, 30))}
          className={`${inputClass} mt-1.5`}
        />
      </label>
      <label className="block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
          Practice from styles %
        </span>
        <input
          type="number"
          min={0}
          max={100}
          value={mix}
          onChange={(e) => setMix(clamp(Number(e.target.value), 0, 100))}
          className={`${inputClass} mt-1.5`}
        />
      </label>
      <p className="col-span-2 text-[11px] leading-snug text-white/45">
        Practice mix: share of practice questions taken from generated styles; the rest are classic
        questions built on the phone. 100 = only generated styles.
        {focused && " Ignored while a focus style is set (always 100)."}
      </p>
      {dirty && (
        <button
          type="button"
          onClick={() => void onSave({ daily_count: daily, practice_mix: mix })}
          className="col-span-2 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-ink"
        >
          Save engine settings
        </button>
      )}
    </div>
  );
}

function RunHistory({ runs }: { runs: GenerationRun[] }) {
  const [open, setOpen] = useState(false);
  const last = runs[0];
  if (!last) {
    return <p className="mt-3 text-xs text-white/45">No generator runs yet.</p>;
  }
  const total = (r: GenerationRun) => Object.values(r.created ?? {}).reduce((a, b) => a + b, 0);
  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <span className="text-xs text-white/70">
          Last run: {fmtDate(last.started_at)} · {last.trigger} · {last.status} · {total(last)} new
          {last.daily_added ? ` · daily +${last.daily_added}` : ""}
        </span>
        <span className="text-xs text-white/30">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <ul className="mt-2 space-y-2 border-t border-white/8 pt-2">
          {runs.map((r) => (
            <li key={r.id} className="text-[11px] text-white/60">
              <span className={r.status === "failed" ? "text-red-300" : r.status === "running" ? "text-amber-200" : "text-white/75"}>
                {fmtDate(r.started_at)} · {r.trigger} · {r.status}
              </span>
              {" · "}
              {Object.entries(r.created ?? {})
                .filter(([, n]) => n > 0)
                .map(([s, n]) => `${s} ${n}`)
                .join(", ") || "nothing new"}
              {r.problems?.length ? (
                <span className="block text-red-200/70">{r.problems.slice(0, 3).join(" · ")}</span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StyleCard({
  def,
  row,
  stats,
  open,
  busy,
  focused,
  onFocus,
  onToggleOpen,
  onPatch,
  onToggle,
  onGenerate,
  onShowItems,
  showToast,
}: {
  def: StyleDef;
  row: StyleRow;
  stats: StyleStats | undefined;
  open: boolean;
  busy: boolean;
  focused: boolean;
  onFocus: () => void;
  onToggleOpen: () => void;
  onPatch: (patch: Partial<StyleRow>, done?: string) => void;
  onToggle: () => void;
  onGenerate: () => void;
  onShowItems: () => void;
  showToast: Props["showToast"];
}) {
  const merged = useMemo(() => ({ ...def.defaults, ...(row.settings ?? {}) }), [def, row.settings]);
  const [draft, setDraft] = useState<StyleSettings>(merged);
  const [perRun, setPerRun] = useState(row.per_run);
  const [preview, setPreview] = useState<QuizItem[] | null>(null);
  const [previewing, setPreviewing] = useState(false);

  useEffect(() => setDraft(merged), [merged]);
  useEffect(() => setPerRun(row.per_run), [row.per_run]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(merged) || perRun !== row.per_run;
  const rate = stats && stats.shown > 0 ? Math.round((stats.correct / stats.shown) * 100) : null;

  const runPreview = async () => {
    setPreviewing(true);
    try {
      const res = await previewStyle(def.id, draft, 3);
      setPreview(res.items);
      if (!res.items.length) {
        showToast(res.problems[0] ?? "No sample could be built — the catalog may be too small for these settings.", "error");
      }
    } catch (err) {
      showToast(errorText(err, "Preview failed."), "error");
    } finally {
      setPreviewing(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border ${
        focused ? "border-amber-300/70" : row.enabled ? "border-emerald-400/30" : "border-white/10"
      } bg-white/[0.04]`}
    >
      <div className="flex items-start gap-3 p-3">
        <button type="button" onClick={onToggleOpen} className="min-w-0 flex-1 text-left">
          <p className="font-medium text-white">
            {def.label}
            {focused && (
              <span className="ml-2 rounded-full bg-amber-300/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                Focus
              </span>
            )}
          </p>
          <p className="mt-0.5 truncate text-xs text-white/45">
            {def.answer_type} · {stats?.live ?? 0} live
            {stats?.review ? ` · ${stats.review} to review` : ""}
            {rate !== null ? ` · ${rate}% right` : ""}
            {` · ${row.surfaces.join(" + ") || "no surface"}`}
          </p>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onFocus}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-40 ${
            focused ? "bg-amber-300 text-ink" : "border border-amber-200/30 text-amber-100/80"
          }`}
        >
          {focused ? "Only this ✓" : "Only this"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={onToggle}
          aria-pressed={row.enabled}
          className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold disabled:opacity-40 ${
            row.enabled ? "bg-emerald-400/90 text-ink" : "border border-white/15 text-white/60"
          }`}
        >
          {row.enabled ? "On" : "Off"}
        </button>
      </div>

      {open && (
        <div className="space-y-3 border-t border-white/8 px-3 pb-3 pt-2.5">
          <p className="text-xs text-white/60">{def.description}</p>
          {row.min_app_version && (
            <p className="text-[11px] text-amber-100/70">Needs app {row.min_app_version}+ (older apps skip it automatically).</p>
          )}

          <Field label="Where it appears">
            <div className="flex flex-wrap gap-2">
              {SURFACES.map((s) => {
                const on = row.surfaces.includes(s.id);
                return (
                  <Chip
                    key={s.id}
                    label={s.label}
                    on={on}
                    disabled={busy}
                    onClick={() =>
                      onPatch({
                        surfaces: on ? row.surfaces.filter((x) => x !== s.id) : [...row.surfaces, s.id],
                      })
                    }
                  />
                );
              })}
              <Chip
                label={row.require_review ? "Review before live: on" : "Review before live: off"}
                on={row.require_review}
                disabled={busy}
                onClick={() => onPatch({ require_review: !row.require_review })}
              />
            </div>
          </Field>

          <Field label="New questions per run">
            <input
              type="number"
              min={0}
              max={200}
              value={perRun}
              onChange={(e) => setPerRun(clamp(Number(e.target.value), 0, 200))}
              className={inputClass}
            />
          </Field>

          {def.settings.map((field) => (
            <SettingInput
              key={field.key}
              field={field}
              value={draft[field.key]}
              onChange={(v) => setDraft((d) => ({ ...d, [field.key]: v }))}
            />
          ))}

          <div className="flex flex-wrap gap-2 pt-1">
            {dirty && (
              <Chip
                label="Save settings"
                on
                disabled={busy}
                onClick={() => onPatch({ settings: draft, per_run: perRun }, "Settings saved")}
              />
            )}
            <Chip label={previewing ? "Building…" : "Preview 3"} disabled={previewing} onClick={() => void runPreview()} />
            <Chip label={busy ? "Working…" : "Generate now"} disabled={busy} onClick={onGenerate} />
            <Chip label="Questions" onClick={onShowItems} />
          </div>

          {preview && (
            <div className="space-y-2">
              {preview.map((item) => (
                <ItemSummary key={item.id} item={item} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SettingInput({
  field,
  value,
  onChange,
}: {
  field: SettingField;
  value: StyleSettings[string] | undefined;
  onChange: (v: StyleSettings[string]) => void;
}) {
  switch (field.type) {
    case "number":
      return (
        <Field label={field.label}>
          <input
            type="number"
            min={field.min}
            max={field.max}
            step={field.step ?? 1}
            value={Number(value ?? field.min)}
            onChange={(e) => onChange(clamp(Number(e.target.value), field.min, field.max))}
            className={inputClass}
          />
        </Field>
      );
    case "boolean":
      return (
        <Field label={field.label}>
          <Chip label={value ? "Yes" : "No"} on={Boolean(value)} onClick={() => onChange(!value)} />
        </Field>
      );
    case "select":
      return (
        <Field label={field.label}>
          <select
            value={String(value ?? field.options[0]?.value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            className={`${inputClass} bg-[#241a12]`}
          >
            {field.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </Field>
      );
    case "multiselect": {
      const current = Array.isArray(value) ? value : [];
      return (
        <Field label={field.label}>
          <div className="flex flex-wrap gap-2">
            {field.options.map((o) => {
              const on = current.includes(o.value);
              return (
                <Chip
                  key={o.value}
                  label={o.label}
                  on={on}
                  onClick={() => {
                    const next = on ? current.filter((x) => x !== o.value) : [...current, o.value];
                    if (next.length) onChange(next);
                  }}
                />
              );
            })}
          </div>
        </Field>
      );
    }
  }
}

/** Compact read-out of a question: prompt, options (✓ = right), answer. */
function ItemSummary({ item, footer }: { item: QuizItem; footer?: ReactNode }) {
  const right = new Set("correct" in item.answer ? (item.answer as ChoiceAnswer).correct : []);
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-2.5">
      <div className="flex gap-2.5">
        {item.media.image_url && (
          <img
            src={sizedImageUrl(item.media.image_url, 120)}
            alt=""
            className="h-14 w-14 shrink-0 rounded-lg object-cover"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.14em] text-white/40">
            {item.media.label} · {item.answer_type}
          </p>
          <p className="mt-0.5 text-sm text-white/90">{item.prompt}</p>
          {item.media.caption && <p className="mt-1 line-clamp-3 text-xs italic text-white/55">“{item.media.caption}”</p>}
          {item.media.clues && <p className="mt-1 text-xs text-white/55">{item.media.clues.join(" → ")}</p>}
        </div>
      </div>
      {item.options.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.options.map((o) =>
            o.image_url ? (
              <img
                key={o.id}
                src={sizedImageUrl(o.image_url, 96)}
                alt=""
                title={o.note}
                className={`h-11 w-11 rounded-md object-cover ${right.has(o.id) ? "ring-2 ring-emerald-400" : "opacity-70"}`}
                style={o.flip ? { transform: "scaleX(-1)" } : undefined}
              />
            ) : (
              <span
                key={o.id}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  right.has(o.id) ? "border-emerald-400/60 text-emerald-100" : "border-white/12 text-white/60"
                }`}
              >
                {o.label}
              </span>
            ),
          )}
        </div>
      )}
      <p className="mt-1.5 text-[11px] text-white/55">Answer: {answerText(item)}</p>
      {footer}
    </div>
  );
}

function answerText(item: QuizItem): string {
  const name = (id: string) => {
    const i = item.options.findIndex((o) => o.id === id);
    const o = item.options[i];
    return o?.label ?? o?.note ?? `#${i + 1}`;
  };
  switch (item.answer_type) {
    case "single":
    case "binary":
    case "multi":
      return (item.answer as ChoiceAnswer).correct.map(name).join(", ");
    case "order":
      return (item.answer as OrderAnswer).order.map(name).join(" → ");
    case "match": {
      const targets = item.media.targets ?? [];
      return Object.entries((item.answer as MatchAnswer).pairs)
        .map(([k, v]) => `${name(k)} = ${targets.find((t) => t.id === v)?.label ?? v}`)
        .join(" · ");
    }
    case "numeric":
      return (item.answer as NumericAnswer).display;
    case "text":
      return (item.answer as TextAnswer).display;
    default:
      return "—";
  }
}

type ItemFilter = ItemStatus | "flagged";

function ItemsModal({
  style,
  label,
  onClose,
  onChanged,
  showToast,
}: {
  style: string | null;
  label: string;
  onClose: () => void;
  onChanged: () => void;
  showToast: Props["showToast"];
}) {
  const [filter, setFilter] = useState<ItemFilter>("live");
  const [items, setItems] = useState<AdminItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await fetchItems({ style, status: filter }));
    } catch (err) {
      setError(errorText(err, "Could not load questions."));
    } finally {
      setLoading(false);
    }
  }, [style, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const move = async (item: AdminItem, status: ItemStatus) => {
    setBusy(item.id);
    try {
      await setItemStatus(item.id, status);
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      onChanged();
      showToast(status === "retired" ? "Question retired" : status === "live" ? "Question is live" : "Moved to review");
    } catch (err) {
      showToast(errorText(err, "Update failed."), "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-[81] max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-white/12 bg-ink-soft p-5 shadow-placard sm:rounded-[28px]">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl text-white">Questions · {label}</h2>
          <button type="button" onClick={onClose} className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/60">
            Close
          </button>
        </div>
        <div className="mt-3">
          <FilterTabs
            wrap
            value={filter}
            onChange={setFilter}
            options={[
              { id: "live", label: "Live" },
              { id: "review", label: "To review" },
              { id: "flagged", label: "Flagged" },
              { id: "retired", label: "Retired" },
            ]}
          />
          {filter === "flagged" && (
            <p className="mt-2 text-[11px] text-white/45">
              Live questions with {FLAG_MIN_PLAYS}+ plays that almost nobody gets right, or almost everybody does.
            </p>
          )}
        </div>
        <div className="mt-3 space-y-2">
          <AdminState
            loading={loading}
            error={error}
            empty={items.length === 0}
            emptyLabel="No questions here."
            onRetry={() => void load()}
          />
          {!loading &&
            items.map((item) => {
              const rate = correctRate(item);
              return (
                <ItemSummary
                  key={item.id}
                  item={item}
                  footer={
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-[11px] text-white/45">
                        {fmtDate(item.created_at)} · {item.shown_count} plays
                        {rate !== null ? ` · ${Math.round(rate * 100)}% right` : ""}
                      </span>
                      <span className="flex-1" />
                      {item.status !== "live" && (
                        <Chip label="Make live" disabled={busy === item.id} onClick={() => void move(item, "live")} />
                      )}
                      {item.status !== "retired" && (
                        <Chip label="Retire" tone="danger" disabled={busy === item.id} onClick={() => void move(item, "retired")} />
                      )}
                    </div>
                  }
                />
              );
            })}
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">{label}</p>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function clamp(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
