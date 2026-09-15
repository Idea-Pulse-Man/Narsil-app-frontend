/**
 * Shared building blocks for the admin dashboard panels (Overview, Artworks,
 * Orders, Users). Kept together so every panel gets the same search box, pager,
 * chips and — importantly — the same loading/error/empty treatment: a failed
 * query must never look like an empty table on a moderation screen.
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { CanvasOrderStatus } from "@/lib/orders";

/** Debounce a search box so typing doesn't fire a query per keystroke. */
export function useDebounced<T>(value: T, delay = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

// ── Section + card shells ──────────────────────────────────────────────────

export function AdminSection({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-serif text-lg text-white">{title}</h2>
        {action}
      </div>
      {hint && <p className="mt-1 text-xs text-white/40">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function AdminCard({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/[0.04] p-4 ${className}`}
    >
      {children}
    </div>
  );
}

// ── Loading / error / empty ────────────────────────────────────────────────

/**
 * The one place that decides what a panel shows when it has no rows to render.
 * Returns null once there IS data, so callers can render it above their list.
 */
export function AdminState({
  loading,
  error,
  empty,
  emptyLabel = "Nothing here yet.",
  onRetry,
}: {
  loading: boolean;
  error: string | null;
  empty: boolean;
  emptyLabel?: string;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-2xl border border-white/5 bg-white/[0.03]"
          />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/25 bg-red-500/10 p-4">
        <p className="text-sm text-red-200">{error}</p>
        <p className="mt-1 text-xs text-red-200/60">
          If this mentions a missing column or function, run
          supabase/admin-dashboard.sql, supabase/artwork-approval.sql,
          supabase/support-inbox.sql, supabase/admin-overview-charts.sql,
          supabase/admin-users-enrich.sql, supabase/admin-alerts.sql,
          supabase/quiz-questions.sql, or supabase/news-posts.sql.
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-3 rounded-full border border-red-300/30 px-3 py-1 text-xs text-red-100"
          >
            Try again
          </button>
        )}
      </div>
    );
  }
  if (empty) return <p className="py-6 text-sm text-white/40">{emptyLabel}</p>;
  return null;
}

// ── Controls ───────────────────────────────────────────────────────────────

export function AdminSearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-full border border-white/12 bg-white/[0.05] px-4 py-2 text-sm text-white placeholder:text-white/35 focus:border-white/25 focus:outline-none"
    />
  );
}

export function FilterTabs<T extends string>({
  value,
  options,
  onChange,
  wrap = false,
}: {
  value: T;
  options: { id: T; label: string; badge?: number }[];
  onChange: (next: T) => void;
  /** Wrap onto multiple rows so every tab stays visible (admin shell). */
  wrap?: boolean;
}) {
  return (
    <div
      className={
        wrap
          ? "flex flex-wrap gap-2"
          : "-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      }
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          className={`relative shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            value === opt.id
              ? "bg-white text-ink"
              : "border border-white/12 text-white/60"
          }`}
        >
          {opt.label}
          {typeof opt.badge === "number" && opt.badge > 0 && (
            <span
              className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white shadow-sm"
              aria-label={`${opt.badge} unread`}
            >
              {opt.badge > 99 ? "99+" : opt.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/** Toggle/action chip. `tone` colours destructive and active states. */
export function Chip({
  label,
  on = false,
  disabled = false,
  tone = "neutral",
  onClick,
}: {
  label: string;
  on?: boolean;
  disabled?: boolean;
  tone?: "neutral" | "danger";
  onClick: () => void;
}) {
  const active =
    tone === "danger" ? "bg-red-500/85 text-white" : "bg-white text-ink";
  const idle =
    tone === "danger"
      ? "border border-red-400/30 text-red-300"
      : "border border-white/15 text-white/70";
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-opacity disabled:opacity-40 ${
        on ? active : idle
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Shared list card for Users / Quiz / Artworks — thumbnail or initial on the
 * left, title + meta, status chips on the right, optional expand body.
 */
export function AdminListCard({
  thumbnail,
  initial,
  title,
  meta,
  badges,
  open,
  onToggle,
  children,
  actions,
}: {
  thumbnail?: ReactNode;
  /** Shown when there is no thumbnail (e.g. user initial). */
  initial?: string;
  title: string;
  meta?: string;
  badges?: ReactNode;
  open?: boolean;
  onToggle?: () => void;
  children?: ReactNode;
  /** Always-visible action row under the header. */
  actions?: ReactNode;
}) {
  const header = (
    <div className="flex w-full items-start gap-3 p-3 text-left">
      {thumbnail ? (
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/5">
          {thumbnail}
        </div>
      ) : initial ? (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-sm font-semibold text-white/70">
          {initial.slice(0, 2).toUpperCase()}
        </div>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-white">{title}</p>
        {meta && (
          <p className="mt-0.5 truncate text-xs text-white/45">{meta}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {badges}
        {onToggle && (
          <span className="text-xs text-white/25">{open ? "▲" : "▼"}</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04]">
      {onToggle ? (
        <button type="button" onClick={onToggle} className="w-full">
          {header}
        </button>
      ) : (
        header
      )}
      {actions && (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/8 px-3 py-2.5">
          {actions}
        </div>
      )}
      {open && children && (
        <div className="space-y-3 border-t border-white/8 px-3 pb-3 pt-2.5">
          {children}
        </div>
      )}
    </div>
  );
}

export function Pager({
  offset,
  limit,
  total,
  onOffset,
}: {
  offset: number;
  limit: number;
  total: number;
  onOffset: (next: number) => void;
}) {
  if (total <= limit) return null;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  return (
    <div className="mt-4 flex items-center justify-between text-xs text-white/45">
      <button
        type="button"
        disabled={offset === 0}
        onClick={() => onOffset(Math.max(0, offset - limit))}
        className="rounded-full border border-white/12 px-3 py-1 disabled:opacity-30"
      >
        ← Prev
      </button>
      <span>
        {from}–{to} of {total}
      </span>
      <button
        type="button"
        disabled={to >= total}
        onClick={() => onOffset(offset + limit)}
        className="rounded-full border border-white/12 px-3 py-1 disabled:opacity-30"
      >
        Next →
      </button>
    </div>
  );
}

// ── Formatting ─────────────────────────────────────────────────────────────

export function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Supabase can hand back `numeric` as a string — normalise before formatting. */
export function fmtMoney(
  value: number | string | null,
  currency = "usd",
): string {
  if (value === null || value === "") return "—";
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `$${n.toFixed(2)}`;
  }
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

/** Badge colours: red = needs a human, amber = in flight, green = done. */
export function statusTone(status: CanvasOrderStatus | string): string {
  switch (status) {
    case "fulfillment_failed":
      return "border-red-400/30 bg-red-500/15 text-red-200";
    case "cancelled":
      return "border-white/10 bg-white/[0.04] text-white/40";
    case "paid":
    case "pending_payment":
    case "registered":
      return "border-amber-300/25 bg-amber-400/10 text-amber-200";
    case "submitted":
      return "border-sky-300/25 bg-sky-400/10 text-sky-200";
    case "shipped":
    case "completed":
      return "border-emerald-300/25 bg-emerald-400/10 text-emerald-200";
    default:
      return "border-white/12 bg-white/[0.04] text-white/60";
  }
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize ${statusTone(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}
