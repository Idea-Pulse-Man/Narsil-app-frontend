/**
 * Admin dashboard — Overview. First board is Narsil membership (registered
 * members only), then one Sign-in + Sign-up chart (members only, two colors)
 * with range chips (7D–1Y), then subscriptions with the same range controls.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
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

type ChartRange = 7 | 14 | 30 | 60 | 90 | 180 | 365;

/** Compact labels: days → D, months → M, year → Y (one scrollable row). */
const RANGE_OPTIONS: { id: ChartRange; label: string }[] = [
  { id: 7, label: "7D" },
  { id: 14, label: "14D" },
  { id: 30, label: "1M" },
  { id: 60, label: "2M" },
  { id: 90, label: "3M" },
  { id: 180, label: "6M" },
  { id: 365, label: "1Y" },
];

export default function AdminOverview({ onJumpToOrders }: AdminOverviewProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activityRange, setActivityRange] = useState<ChartRange>(14);
  const [subRange, setSubRange] = useState<ChartRange>(14);

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
  const guestsTotal = stats.guests ?? 0;
  const guestsToday = stats.guests_today ?? 0;
  const signinsMembersToday = stats.signins_members_today ?? 0;
  const signinsDelta = stats.signins_delta ?? 0;
  const subsActive = stats.subscribers_active ?? 0;
  const subsToday = stats.subscribers_today ?? 0;
  const subsYesterday = stats.subscribers_yesterday ?? 0;

  const pipeline = Object.entries(stats.orders_by_status).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <>
      <section className="mt-6">
        <AdminCard className="bg-gradient-to-br from-white/[0.07] to-white/[0.02]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Narsil
          </p>
          <p className="mt-2 font-serif text-4xl text-white">{stats.users}</p>
          <p className="mt-1 text-sm text-white/55">Total members</p>
          <p className="mt-0.5 text-[11px] text-white/35">
            Registered accounts only · guests excluded
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
            <DeltaPill
              label="vs yesterday"
              delta={usersDelta}
              hint={`Today ${usersToday} · Yesterday ${usersYesterday}`}
            />
            <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-xs text-sky-100">
              Today new · {usersToday}
            </span>
            <span className="rounded-full border border-white/12 px-3 py-1 text-xs text-white/60">
              Guests · {guestsTotal}
              {guestsToday > 0 ? ` (+${guestsToday} today)` : ""}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-white/50">
            <span>
              Sign-ins today ·{" "}
              <span className="text-sky-200">{signinsMembersToday} members</span>
              {signinsDelta !== 0 && (
                <span className={signinsDelta > 0 ? " text-emerald-300" : " text-red-300"}>
                  {" "}
                  ({fmtDelta(signinsDelta)} vs yesterday)
                </span>
              )}
            </span>
          </div>
        </AdminCard>
      </section>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stat label="New members today" value={usersToday} />
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
        title="Sign-in & sign-up"
        hint="Members only · blue = sign-in · amber = sign-up · teal = same count both · guests excluded."
      >
        <RangeTabs value={activityRange} onChange={setActivityRange} />
        <div className="mt-3">
          <SigninSignupLineChart
            signins={stats.signins_by_day ?? []}
            signups={stats.signups_by_day ?? []}
            days={activityRange}
            empty="No member activity in this window."
          />
        </div>
      </AdminSection>

      <AdminSection
        title="Subscriptions"
        hint={`New Guild rows per day · today ${subsToday} · yesterday ${subsYesterday}.`}
      >
        <RangeTabs value={subRange} onChange={setSubRange} />
        <div className="mt-3">
          <DayChart
            series={sliceDays(stats.subscriptions_by_day ?? [], subRange)}
            days={subRange}
            empty="No new subscriptions in this window."
            tone="gold"
            title="Subscriptions"
            subtitle={`New Guild rows per day · ${rangeTitle(subRange).toLowerCase()}.`}
            totalLabel={`${rangeCaption(subRange)} total`}
          />
        </div>
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

function RangeTabs({
  value,
  onChange,
}: {
  value: ChartRange;
  onChange: (next: ChartRange) => void;
}) {
  return (
    <div className="-mx-1 flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          title={rangeTitle(opt.id)}
          onClick={() => onChange(opt.id)}
          className={`shrink-0 rounded-full px-2.5 py-1.5 text-xs font-semibold tracking-wide transition-colors ${
            value === opt.id
              ? "bg-white text-ink"
              : "border border-white/12 text-white/60"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function dayMembers(p: AdminDayCount): number {
  if (typeof p.members === "number") return p.members;
  return Number(p.count) || 0;
}

function sliceDays(series: AdminDayCount[], days: number): AdminDayCount[] {
  if (!series.length) return [];
  const sorted = [...series].sort((a, b) => a.day.localeCompare(b.day));
  return sorted.slice(Math.max(0, sorted.length - days));
}

function rangeCaption(days: ChartRange): string {
  return RANGE_OPTIONS.find((o) => o.id === days)?.label ?? `${days}D`;
}

function rangeTitle(days: ChartRange): string {
  switch (days) {
    case 7:
      return "Last 7 days";
    case 14:
      return "Last 14 days";
    case 30:
      return "Last 1 month";
    case 60:
      return "Last 2 months";
    case 90:
      return "Last 3 months";
    case 180:
      return "Last 6 months";
    case 365:
      return "Last 1 year";
    default:
      return `Last ${days} days`;
  }
}

type ActivityDay = { day: string; signins: number; signups: number };

function mergeMemberActivity(
  signins: AdminDayCount[],
  signups: AdminDayCount[],
  days: ChartRange,
): ActivityDay[] {
  const byDay = new Map<string, ActivityDay>();
  for (const p of sliceDays(signins, days)) {
    byDay.set(p.day, { day: p.day, signins: dayMembers(p), signups: 0 });
  }
  for (const p of sliceDays(signups, days)) {
    const prev = byDay.get(p.day);
    const up = dayMembers(p);
    if (prev) prev.signups = up;
    else byDay.set(p.day, { day: p.day, signins: 0, signups: up });
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Members only: blue = sign-in, amber = sign-up. Guests excluded. */
function SigninSignupLineChart({
  signins,
  signups,
  days,
  empty,
}: {
  signins: AdminDayCount[];
  signups: AdminDayCount[];
  days: ChartRange;
  empty: string;
}) {
  const series = useMemo(
    () => mergeMemberActivity(signins, signups, days),
    [signins, signups, days],
  );

  if (!series.length) {
    return <p className="text-sm text-white/40">{empty}</p>;
  }

  const inVals = series.map((p) => p.signins);
  const upVals = series.map((p) => p.signups);
  const rawMax = Math.max(1, ...inVals, ...upVals);
  const max = niceCeil(rawMax);
  const inTotal = inVals.reduce((a, b) => a + b, 0);
  const upTotal = upVals.reduce((a, b) => a + b, 0);

  const W = 360;
  const H = 200;
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 32;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = series.length;
  const step = n <= 1 ? 0 : plotW / (n - 1);
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));
  const axisLabelIndices = pickAxisLabelIndices(
    series.map((p) => p.day),
    days,
  );
  const baseline = padT + plotH;

  const pts = (values: number[]) =>
    values.map((v, i) => ({
      x: padL + i * step,
      y: padT + plotH - (v / max) * plotH,
    }));

  const inPts = pts(inVals);
  const upPts = pts(upVals);
  const inLine = smoothLinePath(inPts);
  const upLine = smoothLinePath(upPts);
  const inArea = areaPath(inPts, baseline);
  const upArea = areaPath(upPts, baseline);

  return (
    <AdminCard className="!p-0 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 pb-1 pt-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">Member activity</p>
          <p className="mt-0.5 text-[11px] text-white/45">
            Daily sign-in and sign-up · {rangeTitle(days).toLowerCase()}.
          </p>
          <p className="mt-1.5 text-[11px] text-white/55">
            <span className="tabular-nums text-sky-200">{inTotal}</span> sign-ins
            {" · "}
            <span className="tabular-nums text-amber-200">{upTotal}</span> sign-ups
          </p>
        </div>
        <span className="shrink-0 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white/70">
          {rangeTitle(days)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-2 pt-2 text-[10px] text-white/50">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-sky-400" /> Sign-in
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> Sign-up
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-teal-300" /> Equal
        </span>
      </div>

      <div className="px-1 pb-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-52 w-full"
          role="img"
          aria-label="Daily member sign-ins and signups"
        >
          <defs>
            <linearGradient id="area-signin" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="area-signup" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#fbbf24" stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map((tick) => {
            const y = padT + plotH - (tick / max) * plotH;
            return (
              <g key={`y-${tick}`}>
                <line
                  x1={padL}
                  x2={W - padR}
                  y1={y}
                  y2={y}
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={padL - 8}
                  y={y + 3}
                  textAnchor="end"
                  fill="rgba(255,255,255,0.38)"
                  fontSize="9"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {inArea && (
            <path d={inArea} fill="url(#area-signin)" stroke="none" />
          )}
          {upArea && (
            <path d={upArea} fill="url(#area-signup)" stroke="none" />
          )}
          {inLine && (
            <path
              d={inLine}
              fill="none"
              stroke="#38bdf8"
              strokeWidth="2.25"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}
          {upLine && (
            <path
              d={upLine}
              fill="none"
              stroke="#fbbf24"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {series.map((p, i) => {
            const si = inVals[i] ?? 0;
            const su = upVals[i] ?? 0;
            const same = si === su && si > 0;
            const pin = inPts[i]!;
            const showAxis = axisLabelIndices.has(i);
            return (
              <g key={p.day}>
                <title>
                  {same
                    ? `${formatChartDay(p.day, true)}: ${si} (sign-in = sign-up)`
                    : `${formatChartDay(p.day, true)}: ${si} sign-in, ${su} sign-up`}
                </title>
                {/* Invisible hit target for tooltip */}
                <circle cx={pin.x} cy={pin.y} r={10} fill="transparent" />
                {same && (
                  <circle cx={pin.x} cy={pin.y} r={3} fill="#5eead4" />
                )}
                {showAxis && (
                  <text
                    x={pin.x}
                    y={H - 8}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.4)"
                    fontSize="9"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                  >
                    {formatAxisDay(p.day)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </AdminCard>
  );
}

function DayChart({
  series,
  days = 14,
  empty,
  tone,
  title,
  subtitle,
  totalLabel = "14-day total",
}: {
  series: AdminDayCount[];
  days?: ChartRange;
  empty: string;
  tone: "sky" | "gold";
  title?: string;
  subtitle?: string;
  totalLabel?: string;
}) {
  if (!series.length) {
    return <p className="text-sm text-white/40">{empty}</p>;
  }

  const values = series.map((p) => Number(p.count) || 0);
  const rawMax = Math.max(1, ...values);
  const max = niceCeil(rawMax);
  const total = values.reduce((a, b) => a + b, 0);
  const today = values[values.length - 1] ?? 0;
  const axisLabelIndices = pickAxisLabelIndices(
    series.map((p) => p.day),
    days,
  );

  const W = 360;
  const H = 200;
  const padL = 36;
  const padR = 12;
  const padT = 16;
  const padB = 32;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = series.length;
  const step = n <= 1 ? 0 : plotW / (n - 1);
  const baseline = padT + plotH;
  const lineColor = tone === "sky" ? "#38bdf8" : "#e8c9a0";
  const gradId = `area-day-${tone}`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(max * t));

  const points = values.map((v, i) => ({
    x: padL + i * step,
    y: padT + plotH - (v / max) * plotH,
  }));
  const line = smoothLinePath(points);
  const area = areaPath(points, baseline);

  return (
    <AdminCard className="!p-0 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-4 pb-2 pt-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white">
            {title ?? "Overview"}
          </p>
          <p className="mt-0.5 text-[11px] text-white/45">
            {subtitle ??
              `Daily performance · ${rangeTitle(days).toLowerCase()}.`}
          </p>
          <p className="mt-1.5 text-[11px] text-white/55">
            <span className="tabular-nums text-white/85">{total}</span>{" "}
            {totalLabel}
            {" · today "}
            <span className="tabular-nums text-white/85">{today}</span>
          </p>
        </div>
        <span className="shrink-0 rounded-lg border border-white/12 bg-white/[0.04] px-2.5 py-1.5 text-[11px] text-white/70">
          {rangeTitle(days)}
        </span>
      </div>

      <div className="px-1 pb-3">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-52 w-full"
          role="img"
          aria-label="Daily activity chart"
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={lineColor} stopOpacity="0.38" />
              <stop offset="100%" stopColor={lineColor} stopOpacity="0" />
            </linearGradient>
          </defs>

          {yTicks.map((tick) => {
            const y = padT + plotH - (tick / max) * plotH;
            return (
              <g key={`y-${tick}`}>
                <line
                  x1={padL}
                  x2={W - padR}
                  y1={y}
                  y2={y}
                  stroke="rgba(255,255,255,0.12)"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={padL - 8}
                  y={y + 3}
                  textAnchor="end"
                  fill="rgba(255,255,255,0.38)"
                  fontSize="9"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {tick}
                </text>
              </g>
            );
          })}

          {area && <path d={area} fill={`url(#${gradId})`} stroke="none" />}
          {line && (
            <path
              d={line}
              fill="none"
              stroke={lineColor}
              strokeWidth="2.25"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {series.map((p, i) => {
            const pt = points[i]!;
            const nVal = values[i] ?? 0;
            const showAxis = axisLabelIndices.has(i);
            return (
              <g key={p.day}>
                <title>{`${formatChartDay(p.day, true)}: ${nVal}`}</title>
                <circle cx={pt.x} cy={pt.y} r={10} fill="transparent" />
                {showAxis && (
                  <text
                    x={pt.x}
                    y={H - 8}
                    textAnchor="middle"
                    fill="rgba(255,255,255,0.4)"
                    fontSize="9"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                  >
                    {formatAxisDay(p.day)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </AdminCard>
  );
}

type Pt = { x: number; y: number };

/** Catmull-Rom → cubic Bézier smooth line (Revenue Overview style). */
function smoothLinePath(points: Pt[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) {
    return `M ${points[0]!.x.toFixed(1)} ${points[0]!.y.toFixed(1)}`;
  }
  let d = `M ${points[0]!.x.toFixed(1)} ${points[0]!.y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2] ?? p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function areaPath(points: Pt[], baselineY: number): string {
  if (points.length === 0) return "";
  const line = smoothLinePath(points);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  return `${line} L ${last.x.toFixed(1)} ${baselineY.toFixed(1)} L ${first.x.toFixed(1)} ${baselineY.toFixed(1)} Z`;
}

/** Round max up to a clean tick ceiling. */
function niceCeil(max: number): number {
  if (max <= 4) return Math.max(4, max);
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  const n = Math.ceil(max / exp);
  const nice = n <= 2 ? 2 : n <= 4 ? 4 : n <= 5 ? 5 : 10;
  return nice * exp;
}

function formatChartDay(iso: string, long: boolean): string {
  const raw = iso.slice(0, 10);
  const d = new Date(`${raw}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) {
    const parts = raw.split("-");
    return parts.length === 3 ? `${Number(parts[1])}/${Number(parts[2])}` : raw;
  }
  return d.toLocaleDateString(undefined, {
    month: long ? "short" : "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** ~1 label per 7 days (n/7), evenly spaced, always include first + last. */
function pickAxisLabelIndices(days: string[], _range: ChartRange): Set<number> {
  const n = days.length;
  const out = new Set<number>();
  if (n <= 0) return out;
  if (n === 1) {
    out.add(0);
    return out;
  }

  if (n <= 7) {
    for (let i = 0; i < n; i++) out.add(i);
    return out;
  }

  const target = Math.min(8, Math.max(4, Math.round(n / 7)));
  out.add(0);
  out.add(n - 1);
  if (target <= 2) return out;

  const step = (n - 1) / (target - 1);
  for (let t = 1; t < target - 1; t++) {
    out.add(Math.round(t * step));
  }
  return out;
}

/** Axis labels like "Dec 24". */
function formatAxisDay(iso: string): string {
  return formatChartDay(iso, false);
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <AdminCard>
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-1 font-serif text-2xl text-white">{value}</p>
    </AdminCard>
  );
}
