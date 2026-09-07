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
  const max = Math.max(1, ...inVals, ...upVals);
  const inTotal = inVals.reduce((a, b) => a + b, 0);
  const upTotal = upVals.reduce((a, b) => a + b, 0);
  const todayIn = inVals[inVals.length - 1] ?? 0;
  const todayUp = upVals[upVals.length - 1] ?? 0;

  const W = 320;
  const H = 176;
  const padL = 28;
  const padR = 10;
  const padT = 20;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = series.length;
  const step = n <= 1 ? 0 : plotW / (n - 1);
  const yTicks = [0, 0.5, 1].map((t) => Math.round(max * t));
  const axisLabelIndices = pickAxisLabelIndices(
    series.map((p) => p.day),
    days,
  );

  const pointAt = (i: number, value: number) => {
    const x = padL + i * step;
    const y = padT + plotH - (value / max) * plotH;
    return { x, y };
  };

  const pathFor = (values: number[]) =>
    values
      .map((v, i) => {
        const { x, y } = pointAt(i, v);
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <AdminCard className="!p-0 overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 border-b border-white/8 px-4 py-3">
        <div>
          <p className="font-serif text-2xl text-white tabular-nums">{upTotal}</p>
          <p className="text-[11px] text-white/40">
            {rangeCaption(days)} signups
          </p>
          <p className="mt-0.5 text-[11px] text-sky-200/80">
            {inTotal} sign-ins · members only
          </p>
        </div>
        <div className="text-right text-[11px] text-white/45">
          <p>
            Today{" "}
            <span className="tabular-nums text-sky-200">{todayIn} in</span>
            {" · "}
            <span className="tabular-nums text-amber-200">{todayUp} up</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-white/6 px-4 py-2 text-[10px] uppercase tracking-wide text-white/45">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-sky-400" /> Sign-in
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-amber-400/90" /> Sign-up
        </span>
        <span className="inline-flex items-center gap-1.5 normal-case tracking-normal text-white/50">
          <span className="h-2 w-2 rounded-full bg-teal-300" /> Same = in &amp; up match
        </span>
      </div>

      <div className="px-2 pb-2 pt-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-48 w-full"
          role="img"
          aria-label="Daily member sign-ins and signups"
        >
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

          <line
            x1={padL}
            x2={W - padR}
            y1={padT + plotH}
            y2={padT + plotH}
            stroke="rgba(255,255,255,0.18)"
            strokeWidth="1"
          />

          <path
            d={pathFor(inVals)}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.25"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <path
            d={pathFor(upVals)}
            fill="none"
            stroke="#fbbf24"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.95"
          />

          {series.map((p, i) => {
            const si = inVals[i] ?? 0;
            const su = upVals[i] ?? 0;
            const same = si === su && si > 0;
            const pin = pointAt(i, si);
            const pup = pointAt(i, su);
            const isToday = i === series.length - 1;
            const showAxis = axisLabelIndices.has(i);
            const r = isToday ? 3.75 : series.length > 60 ? 1.75 : 3;
            const showValueLabels =
              series.length <= 45 && (si > 0 || su > 0 || isToday);
            return (
              <g key={p.day}>
                <title>
                  {same
                    ? `${formatChartDay(p.day, true)}: ${si} (sign-in = sign-up)`
                    : `${formatChartDay(p.day, true)}: ${si} sign-in, ${su} sign-up`}
                </title>
                {same ? (
                  <>
                    <circle cx={pin.x} cy={pin.y} r={r + 0.5} fill="#5eead4" />
                    {showValueLabels && (
                      <text
                        x={pin.x}
                        y={Math.max(padT + 8, pin.y - 7)}
                        textAnchor="middle"
                        fill="rgba(94,234,212,0.95)"
                        fontSize="8"
                        fontFamily="ui-sans-serif, system-ui, sans-serif"
                      >
                        {si}
                      </text>
                    )}
                  </>
                ) : (
                  <>
                    {(si > 0 || isToday) && (
                      <circle cx={pin.x} cy={pin.y} r={r} fill="#38bdf8" />
                    )}
                    {(su > 0 || isToday) && (
                      <circle
                        cx={pup.x}
                        cy={pup.y}
                        r={isToday ? 3.5 : series.length > 60 ? 1.5 : 2.75}
                        fill="#fbbf24"
                      />
                    )}
                    {showValueLabels && si > 0 && (
                      <text
                        x={pin.x}
                        y={Math.max(padT + 8, pin.y - 7)}
                        textAnchor="middle"
                        fill="rgba(125,211,252,0.95)"
                        fontSize="8"
                        fontFamily="ui-sans-serif, system-ui, sans-serif"
                      >
                        {si}
                      </text>
                    )}
                    {showValueLabels && su > 0 && (
                      <text
                        x={pup.x}
                        y={Math.max(padT + 8, pup.y - 7)}
                        textAnchor="middle"
                        fill="rgba(251,191,36,0.95)"
                        fontSize="8"
                        fontFamily="ui-sans-serif, system-ui, sans-serif"
                      >
                        {su}
                      </text>
                    )}
                  </>
                )}
                {showAxis && (
                  <text
                    x={pin.x}
                    y={H - 8}
                    textAnchor="middle"
                    fill={
                      isToday
                        ? "rgba(255,255,255,0.75)"
                        : "rgba(255,255,255,0.4)"
                    }
                    fontSize="8"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                  >
                    {formatAxisDay(p.day, days)}
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
  totalLabel = "14-day total",
}: {
  series: AdminDayCount[];
  days?: ChartRange;
  empty: string;
  tone: "sky" | "gold";
  totalLabel?: string;
}) {
  if (!series.length) {
    return <p className="text-sm text-white/40">{empty}</p>;
  }

  const values = series.map((p) => Number(p.count) || 0);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const peak = Math.max(...values);
  const today = values[values.length - 1] ?? 0;
  const axisLabelIndices = pickAxisLabelIndices(
    series.map((p) => p.day),
    days,
  );

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
          <p className="text-[11px] text-white/40">{totalLabel}</p>
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

          {series.map((p, i) => {
            const n = values[i] ?? 0;
            const h = n === 0 ? 0 : Math.max(3, (n / max) * plotH);
            const x = padL + i * (barW + gap);
            const y = padT + plotH - h;
            const isToday = i === series.length - 1;
            const showAxis = axisLabelIndices.has(i);
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
                {n > 0 && series.length <= 45 && (
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
                {showAxis && (
                  <text
                    x={x + barW / 2}
                    y={H - 8}
                    textAnchor="middle"
                    fill={
                      isToday
                        ? "rgba(255,255,255,0.75)"
                        : "rgba(255,255,255,0.4)"
                    }
                    fontSize="8"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                  >
                    {formatAxisDay(p.day, days)}
                  </text>
                )}
              </g>
            );
          })}

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

/** ~1 label per 7 days (n/7), evenly spaced, always include first + last. */
function pickAxisLabelIndices(days: string[], _range: ChartRange): Set<number> {
  const n = days.length;
  const out = new Set<number>();
  if (n <= 0) return out;
  if (n === 1) {
    out.add(0);
    return out;
  }

  // Short windows: label every day (or every other if slightly long).
  if (n <= 7) {
    for (let i = 0; i < n; i++) out.add(i);
    return out;
  }

  // Show about 1/7 of the days (e.g. 30→~4–5, 90→~13), capped for width.
  const target = Math.min(12, Math.max(3, Math.round(n / 7)));
  out.add(0);
  out.add(n - 1);
  if (target <= 2) return out;

  const step = (n - 1) / (target - 1);
  for (let t = 1; t < target - 1; t++) {
    out.add(Math.round(t * step));
  }
  return out;
}

/** Always M/D — never mix month names with dates (avoids "Aug"/"8/3" collisions). */
function formatAxisDay(iso: string, _range?: ChartRange): string {
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
