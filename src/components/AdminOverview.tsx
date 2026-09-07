/**
 * Admin dashboard — Overview. First board is Narsil membership (total users +
 * today vs yesterday), then daily sign-in and subscription charts. Catalog /
 * order alerts stay below. The Users management tab is not linked from here.
 */

import { useCallback, useEffect, useState } from "react";
import {
  fetchAdminStats,
  type AdminDayCount,
  type AdminStats,
} from "@/lib/admin";
import type { CanvasOrderStatus } from "@/lib/orders";
import {
  AdminCard,
  AdminSection,
  AdminState,
  StatusBadge,
  fmtMoney,
} from "./admin-ui";

interface AdminOverviewProps {
  onJumpToOrders: (status: CanvasOrderStatus | "all") => void;
}

export default function AdminOverview({ onJumpToOrders }: AdminOverviewProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStats(await fetchAdminStats());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load stats.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading || error || !stats) {
    return (
      <div className="mt-6">
        <AdminState
          loading={loading}
          error={error}
          empty={!stats}
          emptyLabel="No stats available."
          onRetry={() => void load()}
        />
      </div>
    );
  }

  const usersToday = stats.users_today ?? 0;
  const usersYesterday = stats.users_yesterday ?? 0;
  const usersDelta = stats.users_delta ?? usersToday - usersYesterday;
  const signinsToday = stats.signins_today ?? 0;
  const signinsDelta = stats.signins_delta ?? 0;
  const subsActive = stats.subscribers_active ?? 0;
  const subsToday = stats.subscribers_today ?? 0;
  const subsYesterday = stats.subscribers_yesterday ?? 0;

  const pipeline = Object.entries(stats.orders_by_status).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <>
      {/* ── First board: Narsil users ─────────────────────────────────────── */}
      <section className="mt-6">
        <AdminCard className="bg-gradient-to-br from-white/[0.07] to-white/[0.02]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Narsil
          </p>
          <p className="mt-2 font-serif text-4xl text-white">{stats.users}</p>
          <p className="mt-1 text-sm text-white/55">Total users</p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <DeltaPill
              label="vs yesterday"
              delta={usersDelta}
              hint={`Today ${usersToday} · Yesterday ${usersYesterday}`}
            />
            <span className="rounded-full border border-white/12 px-3 py-1 text-xs text-white/60">
              Today new · {usersToday}
            </span>
            <span className="rounded-full border border-white/12 px-3 py-1 text-xs text-white/60">
              Sign-ins today · {signinsToday}
              {signinsDelta !== 0 && (
                <span className={signinsDelta > 0 ? " text-emerald-300" : " text-red-300"}>
                  {" "}
                  ({fmtDelta(signinsDelta)})
                </span>
              )}
            </span>
          </div>
        </AdminCard>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="New today" value={usersToday} />
        <Stat label="New yesterday" value={usersYesterday} />
        <Stat label="Guild (Pro)" value={subsActive} />
        <Stat label="New Pro today" value={subsToday} />
      </div>

      {(stats.needs_attention > 0 || (stats.pending_approvals ?? 0) > 0) && (
        <div className="mt-4 space-y-2">
          {stats.needs_attention > 0 && (
            <button
              type="button"
              onClick={() => onJumpToOrders("fulfillment_failed")}
              className="flex w-full items-center justify-between rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3.5 text-left"
            >
              <span className="text-sm text-red-100">
                {stats.needs_attention} order
                {stats.needs_attention === 1 ? "" : "s"} need fulfilment
              </span>
              <span className="text-red-200/60">›</span>
            </button>
          )}
          {(stats.pending_approvals ?? 0) > 0 && (
            <div className="rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3.5 text-sm text-amber-100">
              {stats.pending_approvals} upload
              {stats.pending_approvals === 1 ? "" : "s"} waiting for approval —
              open Artworks → Pending.
            </div>
          )}
        </div>
      )}

      <AdminSection
        title="Sign-ins"
        hint="Users whose last sign-in fell on each day (UTC) · last 14 days."
      >
        <DayChart
          series={stats.signins_by_day ?? []}
          empty="No sign-in activity in this window."
          tone="sky"
        />
      </AdminSection>

      <AdminSection
        title="Subscriptions"
        hint={`New Guild rows per day · today ${subsToday} · yesterday ${subsYesterday}.`}
      >
        <DayChart
          series={stats.subscriptions_by_day ?? []}
          empty="No new subscriptions in this window."
          tone="gold"
        />
      </AdminSection>

      <AdminSection title="Catalog">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Artworks" value={stats.artworks} />
          <Stat label="Pending" value={stats.pending_approvals ?? 0} />
          <Stat label="Featured" value={stats.featured} />
          <Stat label="Hidden" value={stats.hidden} />
        </div>
      </AdminSection>

      <AdminSection
        title="Canvas revenue"
        hint="Paid, submitted, shipped and completed orders."
      >
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Gross" value={fmtMoney(stats.revenue)} />
          <Stat label="Orders" value={stats.orders} />
          <Stat label="Artist payouts" value={fmtMoney(stats.artist_payout)} />
          <Stat label="Platform cut" value={fmtMoney(stats.platform_cut)} />
        </div>
      </AdminSection>

      <AdminSection title="Order pipeline">
        {pipeline.length === 0 ? (
          <p className="text-sm text-white/40">No orders yet.</p>
        ) : (
          <div className="space-y-2">
            {pipeline.map(([status, count]) => (
              <button
                key={status}
                type="button"
                onClick={() => onJumpToOrders(status as CanvasOrderStatus)}
                className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-left"
              >
                <StatusBadge status={status} />
                <span className="text-sm text-white/70">{count}</span>
              </button>
            ))}
          </div>
        )}
      </AdminSection>
    </>
  );
}

function fmtDelta(n: number): string {
  if (n > 0) return `+${n}`;
  return String(n);
}

function DeltaPill({
  label,
  delta,
  hint,
}: {
  label: string;
  delta: number;
  hint: string;
}) {
  const tone =
    delta > 0
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : delta < 0
        ? "border-red-400/30 bg-red-400/10 text-red-200"
        : "border-white/12 bg-white/[0.04] text-white/60";
  return (
    <span
      title={hint}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${tone}`}
    >
      {label} {fmtDelta(delta)}
    </span>
  );
}

function DayChart({
  series,
  empty,
  tone,
}: {
  series: AdminDayCount[];
  empty: string;
  tone: "sky" | "gold";
}) {
  if (!series.length) {
    return <p className="text-sm text-white/40">{empty}</p>;
  }

  const values = series.map((p) => Number(p.count) || 0);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const peak = Math.max(...values);
  const today = values[values.length - 1] ?? 0;

  // SVG layout (viewBox units)
  const W = 320;
  const H = 168;
  const padL = 28;
  const padR = 8;
  const padT = 16;
  const padB = 28;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const gap = 3;
  const barW = Math.max(6, (plotW - gap * (series.length - 1)) / series.length);
  const gradId = `admin-bar-${tone}`;
  const fillTop = tone === "sky" ? "#7dd3fc" : "#e8c9a0";
  const fillBot = tone === "sky" ? "#0ea5e9" : "#c4a574";

  const yTicks = [0, 0.5, 1].map((t) => Math.round(max * t));

  return (
    <AdminCard className="!p-0 overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-white/8 px-4 py-3">
        <div>
          <p className="font-serif text-2xl text-white tabular-nums">{total}</p>
          <p className="text-[11px] text-white/40">14-day total</p>
        </div>
        <div className="text-right text-[11px] text-white/45">
          <p>
            Peak <span className="tabular-nums text-white/80">{peak}</span>
          </p>
          <p className="mt-0.5">
            Today <span className="tabular-nums text-white/80">{today}</span>
          </p>
        </div>
      </div>

      <div className="px-2 pb-2 pt-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-44 w-full"
          role="img"
          aria-label="Daily activity chart"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={fillTop} stopOpacity="0.95" />
              <stop offset="100%" stopColor={fillBot} stopOpacity="0.55" />
            </linearGradient>
          </defs>

          {/* Horizontal grid */}
          {yTicks.map((tick) => {
            const y = padT + plotH - (tick / max) * plotH;
            return (
              <g key={`y-${tick}`}>
                <line
                  x1={padL}
                  x2={W - padR}
                  y1={y}
                  y2={y}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth="1"
                />
                <text
                  x={padL - 6}
                  y={y + 3}
                  textAnchor="end"
                  fill="rgba(255,255,255,0.35)"
                  fontSize="9"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {/* Bars */}
          {series.map((p, i) => {
            const n = values[i] ?? 0;
            const h = n === 0 ? 0 : Math.max(3, (n / max) * plotH);
            const x = padL + i * (barW + gap);
            const y = padT + plotH - h;
            const isToday = i === series.length - 1;
            const labelEvery = series.length > 10 ? 2 : 1;
            const showLabel = i % labelEvery === 0 || isToday;
            return (
              <g key={p.day}>
                <title>{`${formatChartDay(p.day, true)}: ${n}`}</title>
                {n > 0 && (
                  <rect
                    x={x}
                    y={y}
                    width={barW}
                    height={h}
                    rx={Math.min(4, barW / 2)}
                    fill={`url(#${gradId})`}
                    opacity={isToday ? 1 : 0.85}
                  />
                )}
                {n === 0 && (
                  <rect
                    x={x}
                    y={padT + plotH - 2}
                    width={barW}
                    height={2}
                    rx={1}
                    fill="rgba(255,255,255,0.12)"
                  />
                )}
                {n > 0 && (
                  <text
                    x={x + barW / 2}
                    y={Math.max(padT + 8, y - 4)}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.7)"
                    fontSize="8"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                  >
                    {n}
                  </text>
                )}
                {showLabel && (
                  <text
                    x={x + barW / 2}
                    y={H - 8}
                    textAnchor="middle"
                    fill={
                      isToday
                        ? "rgba(255,255,255,0.75)"
                        : "rgba(255,255,255,0.35)"
                    }
                    fontSize="8"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                  >
                    {formatChartDay(p.day, false)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Baseline */}
          <line
            x1={padL}
            x2={W - padR}
            y1={padT + plotH}
            y2={padT + plotH}
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1"
          />
        </svg>
      </div>
    </AdminCard>
  );
}

/** Short axis label (e.g. 9/7) or long tooltip (Sep 7). */
function formatChartDay(iso: string, long: boolean): string {
  const raw = iso.slice(0, 10);
  const d = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    const parts = raw.split("-");
    return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : raw;
  }
  if (long) {
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <AdminCard>
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-1 font-serif text-2xl text-white">{value}</p>
    </AdminCard>
  );
}
