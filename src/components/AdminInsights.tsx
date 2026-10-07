/**
 * Admin dashboard — Insights tab. Anonymous usage (screens, checkout and Pro
 * funnels, shares) and the app/server error log, from admin_insights()
 * (supabase/telemetry.sql). Nothing here identifies a person: counts are by
 * random install id.
 */

import { useCallback, useEffect, useState } from "react";
import { fetchInsights, type AdminInsights } from "@/lib/admin";
import { AdminCard, AdminSection, AdminState, FilterTabs, fmtDate } from "./admin-ui";

type Range = "7" | "30";

const RANGES: { id: Range; label: string }[] = [
  { id: "7", label: "7 days" },
  { id: "30", label: "30 days" },
];

const SCREEN_LABELS: Record<string, string> = {
  "for-you": "For You",
  discover: "Discover",
  buy: "Buy",
  search: "Search",
  create: "Create",
  saved: "Saved",
  you: "You",
};

const pct = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—";

export default function AdminInsights() {
  const [range, setRange] = useState<Range>("7");
  const [data, setData] = useState<AdminInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchInsights(Number(range)));
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} — run supabase/telemetry.sql if this mentions admin_insights.`
          : "Could not load insights.",
      );
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxViews = Math.max(1, ...(data?.screens.map((s) => s.views) ?? [1]));

  return (
    <div className="mt-5">
      <FilterTabs value={range} options={RANGES} onChange={setRange} />

      <div className="mt-4">
        <AdminState
          loading={loading}
          error={error}
          empty={!data}
          onRetry={() => void load()}
        />
      </div>

      {data && !loading && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Active installs" value={data.installs} />
            <Stat label="Sessions" value={data.sessions} />
            <Stat label="Shares" value={data.shares} />
          </div>

          <AdminSection
            title="Canvas checkout"
            hint="Sessions reaching each step. A big drop shows where buyers give up."
          >
            <Funnel
              steps={[
                { label: "Opened canvas sheet", value: data.checkout.opened },
                { label: "Reached payment", value: data.checkout.payment },
                { label: "Paid", value: data.checkout.paid },
              ]}
            />
          </AdminSection>

          <AdminSection title="Narsil Pro" hint="Sessions that saw the paywall, and that subscribed.">
            <Funnel
              steps={[
                { label: "Saw the paywall", value: data.pro.paywall },
                { label: "Subscribed", value: data.pro.subscribed },
              ]}
            />
          </AdminSection>

          <AdminSection title="Screens" hint="How often each tab is opened.">
            <AdminCard>
              {data.screens.length === 0 ? (
                <p className="text-sm text-white/40">No screen views yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {data.screens.map((s) => (
                    <li key={s.screen ?? "unknown"}>
                      <div className="flex justify-between text-xs text-white/70">
                        <span>{SCREEN_LABELS[s.screen ?? ""] ?? s.screen ?? "Unknown"}</span>
                        <span>{s.views.toLocaleString()}</span>
                      </div>
                      <div className="mt-1 h-1.5 rounded-full bg-white/5">
                        <div
                          className="h-1.5 rounded-full bg-accent"
                          style={{ width: `${(s.views / maxViews) * 100}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </AdminCard>
          </AdminSection>

          <AdminSection
            title="Errors"
            hint="Crashes and failures in the app and on the server, most frequent first."
          >
            {data.errors.length === 0 ? (
              <AdminCard>
                <p className="text-sm text-white/50">No errors in this period.</p>
              </AdminCard>
            ) : (
              <ul className="space-y-2">
                {data.errors.map((e, i) => (
                  <li key={`${e.source}-${e.message}`}>
                    <button
                      type="button"
                      onClick={() => setOpenError(openError === i ? null : i)}
                      className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-white/85 [overflow-wrap:anywhere]">{e.message}</p>
                        <span className="shrink-0 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] text-red-200">
                          {e.count}×
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-white/40">
                        {e.source === "server" ? "Server" : "App"} · {e.installs} installs ·
                        last {fmtDate(e.last_seen)}
                        {e.context ? ` · ${e.context}` : ""}
                      </p>
                      {openError === i && e.stack && (
                        <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-black/40 p-2 text-[10px] leading-snug text-white/60">
                          {e.stack}
                        </pre>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </AdminSection>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <AdminCard className="!p-3">
      <p className="text-[11px] text-white/45">{label}</p>
      <p className="mt-1 font-serif text-xl text-white">{value.toLocaleString()}</p>
    </AdminCard>
  );
}

function Funnel({ steps }: { steps: { label: string; value: number }[] }) {
  const top = steps[0]?.value ?? 0;
  return (
    <AdminCard>
      <ol className="space-y-2.5">
        {steps.map((step, i) => (
          <li key={step.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="text-white/70">{step.label}</span>
            <span className="text-white">
              {step.value.toLocaleString()}
              {i > 0 && (
                <span className="ml-2 text-xs text-white/40">{pct(step.value, top)}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </AdminCard>
  );
}
