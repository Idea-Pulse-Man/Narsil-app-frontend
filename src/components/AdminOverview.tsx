/**
 * Admin dashboard — Overview. First board is Narsil membership (registered
 * members only), then separate Sign-in and Sign-up charts with their own
 * range filters (7 / 15 / 30 days), then subscriptions and catalog.
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

type ChartRange = 7 | 15 | 30;

const RANGE_OPTIONS: { id: ChartRange; label: string }[] = [
  { id: 7, label: "7 days" },
  { id: 15, label: "15 days" },
  { id: 30, label: "1 month" },
];

export default function AdminOverview({ onJumpToOrders }: AdminOverviewProps) {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [signinRange, setSigninRange] = useState<ChartRange>(15);
  const [signupRange, setSignupRange] = useState<ChartRange>(15);

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
  const signinsGuestsToday = stats.signins_guests_today ?? 0;
  const signinsToday =
    stats.signins_today ?? signinsMembersToday + signinsGuestsToday;
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
              {" · "}
              <span className="text-amber-200/90">{signinsGuestsToday} guests</span>
              {signinsDelta !== 0 && (
                <span className={signinsDelta > 0 ? " text-emerald-300" : " text-red-300"}>
                  {" "}
                  ({fmtDelta(signinsDelta)} total)
                </span>
              )}
            </span>
            {signinsToday > 0 &&
              signinsMembersToday === 0 &&
              signinsGuestsToday === 0 && (
                <span className="text-white/40">
                  · {signinsToday} (run guest SQL for split)
                </span>
              )}
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
        title="Sign-in"
        hint="Last sign-in per day (UTC) · members (blue) vs guests (amber)."
      >
        <RangeTabs value={signinRange} onChange={setSigninRange} />
        <div className="mt-3">
          <MemberGuestLineChart
            series={stats.signins_by_day ?? []}
            days={signinRange}
            empty="No sign-ins in this window."
            totalLabel="sign-ins"
            guestNoteLabel="guest sign-ins"
            ariaLabel="Daily sign-ins"
          />
        </div>
      </AdminSection>

      <AdminSection
        title="Sign-up"
        hint="New registered members created each day (UTC) · guests excluded."
      >
        <RangeTabs value={signupRange} onChange={setSignupRange} />
        <div className="mt-3">
          <MemberGuestLineChart
            series={stats.signups_by_day ?? []}
            days={signupRange}
            empty="No member signups in this window."
            totalLabel="member signups"
            guestNoteLabel="guest signups"
            ariaLabel="Daily member signups"
            showGuests={false}
          />
        </div>
      </AdminSection>

      <AdminSection
        title="Subscriptions"
        hint={`New Guild rows per day · today ${subsToday} · yesterday ${subsYesterday}.`}
      >
        <DayChart
          series={sliceDays(stats.subscriptions_by_day ?? [], 15)}
          empty="No new subscriptions in this window."
          tone="gold"
          totalLabel="15-day total"
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

function RangeTabs({
  value,
  onChange,
}: {
  value: ChartRange;
  onChange: (next: ChartRange) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
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

function dayGuests(p: AdminDayCount): number {
  return typeof p.guests === "number" ? p.guests : 0;
}

function sliceDays(series: AdminDayCount[], days: number): AdminDayCount[] {
  if (!series.length) return [];
  const sorted = [...series].sort((a, b) => a.day.localeCompare(b.day));
  return sorted.slice(Math.max(0, sorted.length - days));
}

function rangeCaption(days: ChartRange): string {
  if (days === 30) return "1-month";
  return `${days}-day`;
}

/** Dual-line chart for one metric: members (sky) + optional guests (amber). */
function MemberGuestLineChart({
  series,
  days,
  empty,
  totalLabel,
  guestNoteLabel,
  ariaLabel,
  showGuests = true,
}: {
  series: AdminDayCount[];
  days: ChartRange;
  empty: string;
  totalLabel: string;
  guestNoteLabel: string;
  ariaLabel: string;
  /** Sign-up charts pass false — only live registered members. */
  showGuests?: boolean;
}) {
  const windowed = useMemo(() => sliceDays(series, days), [series, days]);

  if (!windowed.length) {
    return <p className="text-sm text-white/40">{empty}</p>;
  }

  const members = windowed.map(dayMembers);
  const guests = showGuests ? windowed.map(dayGuests) : windowed.map(() => 0);
  const max = Math.max(1, ...members, ...(showGuests ? guests : []));
  const membersTotal = members.reduce((a, b) => a + b, 0);
  const guestsTotal = guests.reduce((a, b) => a + b, 0);
  const headline = showGuests ? membersTotal + guestsTotal : membersTotal;
  const peak = Math.max(
    0,
    ...(showGuests
      ? members.map((m, i) => m + (guests[i] ?? 0))
      : members),
  );
  const todayM = members[members.length - 1] ?? 0;
  const todayG = guests[guests.length - 1] ?? 0;

  const W = 320;
  const H = 176;
  const padL = 28;
  const padR = 10;
  const padT = 20;
  const padB = 30;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = windowed.length;
  const step = n <= 1 ? 0 : plotW / (n - 1);
  const yTicks = [0, 0.5, 1].map((t) => Math.round(max * t));

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
          <p className="font-serif text-2xl text-white tabular-nums">{headline}</p>
          <p className="text-[11px] text-white/40">
            {rangeCaption(days)} {totalLabel}
          </p>
          {showGuests && guestsTotal > 0 && (
            <p className="mt-0.5 text-[11px] text-amber-200/70">
              {guestsTotal} {guestNoteLabel} · {membersTotal} members
            </p>
          )}
        </div>
        <div className="text-right text-[11px] text-white/45">
          <p>
            Peak <span className="tabular-nums text-white/80">{peak}</span>
          </p>
          <p className="mt-0.5">
            Today{" "}
            <span className="tabular-nums text-sky-200">{todayM}</span>
            {showGuests && (
              <>
                {" · "}
                <span className="tabular-nums text-amber-200/90">{todayG}g</span>
              </>
            )}
          </p>
        </div>
      </div>

      {showGuests && (
        <div className="flex items-center gap-3 border-b border-white/6 px-4 py-2 text-[10px] uppercase tracking-wide text-white/45">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full bg-sky-400" /> Members
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full bg-amber-400/90" /> Guests
          </span>
        </div>
      )}

      <div className="px-2 pb-2 pt-1">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-48 w-full"
          role="img"
          aria-label={ariaLabel}
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

          {showGuests && (
            <path
              d={pathFor(guests)}
              fill="none"
              stroke="#fbbf24"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity="0.9"
            />
          )}
          <path
            d={pathFor(members)}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="2.25"
            strokeLinejoin="round"
            strokeLinecap="round"
          />

          {windowed.map((p, i) => {
            const m = members[i] ?? 0;
            const g = guests[i] ?? 0;
            const pm = pointAt(i, m);
            const pg = pointAt(i, g);
            const isToday = i === windowed.length - 1;
            const labelEvery =
              windowed.length > 12 ? 3 : windowed.length > 8 ? 2 : 1;
            const showLabel = i % labelEvery === 0 || isToday;
            const labelsClose =
              showGuests && Math.abs(m - g) <= max * 0.12 && m > 0 && g > 0;
            return (
              <g key={p.day}>
                <title>
                  {showGuests
                    ? `${formatChartDay(p.day, true)}: ${m} members, ${g} guests`
                    : `${formatChartDay(p.day, true)}: ${m} members`}
                </title>
                {showGuests && (
                  <circle
                    cx={pg.x}
                    cy={pg.y}
                    r={isToday ? 3.5 : 2.75}
                    fill="#fbbf24"
                  />
                )}
                <circle
                  cx={pm.x}
                  cy={pm.y}
                  r={isToday ? 3.75 : 3}
                  fill="#38bdf8"
                />
                {(m > 0 || isToday) && (
                  <text
                    x={pm.x}
                    y={Math.max(padT + 8, pm.y - 7)}
                    textAnchor="middle"
                    fill="rgba(125,211,252,0.95)"
                    fontSize="8"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                  >
                    {m}
                  </text>
                )}
                {showGuests && (g > 0 || isToday) && (
                  <text
                    x={pg.x}
                    y={Math.min(
                      padT + plotH - 4,
                      labelsClose ? pg.y + 12 : Math.max(padT + 8, pg.y - 7),
                    )}
                    textAnchor="middle"
                    fill="rgba(251,191,36,0.95)"
                    fontSize="8"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                  >
                    {g}
                  </text>
                )}
                {showLabel && (
                  <text
                    x={pm.x}
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
        </svg>
      </div>
    </AdminCard>
  );
}

function DayChart({
  series,
  empty,
  tone,
  totalLabel = "14-day total",
}: {
  series: AdminDayCount[];
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

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <AdminCard>
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-1 font-serif text-2xl text-white">{value}</p>
    </AdminCard>
  );
}
