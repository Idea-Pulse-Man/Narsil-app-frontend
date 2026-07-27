/**
 * Admin dashboard — Canvas orders tab. Read every order (RLS normally scopes
 * them to the buyer), filter by pipeline stage, and act on the ones that are
 * stuck:
 *
 *  • Retry fulfilment — re-verifies the PaymentIntent with Stripe and creates
 *    the Printful order. Goes through the backend because it needs server
 *    secrets; use it on `fulfillment_failed` and on orders stranded in `paid`.
 *  • Status / tracking — manual overrides for when Printful's webhook can't
 *    deliver (refund issued, tracking relayed by support).
 */

import { useCallback, useEffect, useState } from "react";
import {
  ADMIN_PAGE_SIZE,
  ORDER_STATUSES,
  fetchAdminOrders,
  retryFulfillment,
  updateOrder,
  type AdminOrderRow,
} from "@/lib/admin";
import type { CanvasOrderStatus } from "@/lib/orders";
import {
  AdminState,
  FilterTabs,
  Pager,
  StatusBadge,
  fmtDate,
  fmtMoney,
  statusLabel,
} from "./admin-ui";
import type { ToastState } from "./Toast";

type StatusFilter = CanvasOrderStatus | "all";

const FILTERS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  ...ORDER_STATUSES.map((s) => ({ id: s as StatusFilter, label: statusLabel(s) })),
];

/** Fulfilment can be re-driven only once money is captured. */
const RETRYABLE: CanvasOrderStatus[] = ["paid", "fulfillment_failed"];

interface AdminOrdersProps {
  initialStatus?: StatusFilter;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

export default function AdminOrders({
  initialStatus = "all",
  showToast,
}: AdminOrdersProps) {
  const [rows, setRows] = useState<AdminOrderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusFilter>(initialStatus);
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchAdminOrders({
        status,
        offset,
        limit: ADMIN_PAGE_SIZE,
      });
      setRows(page.rows);
      setTotal(page.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load orders.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [status, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchRow = (id: string, patch: Partial<AdminOrderRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const changeStatus = async (row: AdminOrderRow, next: CanvasOrderStatus) => {
    if (next === row.status) return;
    setBusy(row.id);
    try {
      await updateOrder(row.id, { status: next });
      patchRow(row.id, {
        status: next,
        ...(next === "shipped" ? { shipped_at: new Date().toISOString() } : {}),
      });
      showToast(`Marked ${statusLabel(next)}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  const saveTracking = async (
    row: AdminOrderRow,
    number: string,
    url: string,
  ) => {
    setBusy(row.id);
    try {
      await updateOrder(row.id, {
        tracking_number: number.trim() || null,
        tracking_url: url.trim() || null,
      });
      patchRow(row.id, {
        tracking_number: number.trim() || null,
        tracking_url: url.trim() || null,
      });
      showToast("Tracking saved");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  const retry = async (row: AdminOrderRow) => {
    setBusy(row.id);
    try {
      const next = await retryFulfillment(row.id);
      patchRow(row.id, { status: next });
      showToast(`Fulfilment ${statusLabel(next)}`);
      // The backend also writes printful_order_id / fulfillment_error.
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Retry failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-5">
      <FilterTabs
        value={status}
        options={FILTERS}
        onChange={(next) => {
          setStatus(next);
          setOffset(0);
        }}
      />

      <div className="mt-4">
        <AdminState
          loading={loading}
          error={error}
          empty={rows.length === 0}
          emptyLabel={
            status === "all"
              ? "No canvas orders yet."
              : `No orders are ${statusLabel(status)}.`
          }
          onRetry={() => void load()}
        />

        {rows.length > 0 && (
          <div className="space-y-2">
            {rows.map((row) => (
              <OrderCard
                key={row.id}
                row={row}
                open={openId === row.id}
                busy={busy === row.id}
                onToggle={() => setOpenId(openId === row.id ? null : row.id)}
                onStatus={(next) => void changeStatus(row, next)}
                onTracking={(n, u) => void saveTracking(row, n, u)}
                onRetry={() => void retry(row)}
              />
            ))}
          </div>
        )}

        <Pager
          offset={offset}
          limit={ADMIN_PAGE_SIZE}
          total={total}
          onOffset={setOffset}
        />
      </div>
    </div>
  );
}

function OrderCard({
  row,
  open,
  busy,
  onToggle,
  onStatus,
  onTracking,
  onRetry,
}: {
  row: AdminOrderRow;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onStatus: (next: CanvasOrderStatus) => void;
  onTracking: (number: string, url: string) => void;
  onRetry: () => void;
}) {
  const [number, setNumber] = useState(row.tracking_number ?? "");
  const [url, setUrl] = useState(row.tracking_url ?? "");

  // Re-sync when a reload (e.g. after a retry) brings fresh tracking values.
  useEffect(() => {
    setNumber(row.tracking_number ?? "");
    setUrl(row.tracking_url ?? "");
  }, [row.tracking_number, row.tracking_url]);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-start justify-between gap-3 p-3.5 text-left"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm text-white">
            {row.artwork_title ?? row.artwork_id}
          </p>
          <p className="mt-0.5 truncate text-xs text-white/45">
            {row.buyer_email ?? row.buyer_name ?? "unknown buyer"} · {row.size} ·{" "}
            {fmtMoney(row.price, row.currency)}
          </p>
          <p className="mt-1 text-[11px] text-white/30">
            {fmtDate(row.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={row.status} />
          <span className="text-xs text-white/25">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-white/8 p-3.5">
          {row.fulfillment_error && (
            <p className="mb-3 rounded-xl border border-red-400/25 bg-red-500/10 p-2.5 text-[11px] text-red-200">
              {row.fulfillment_error}
            </p>
          )}

          <dl className="space-y-1 text-[11px] text-white/45">
            <Detail label="Order" value={row.id} />
            <Detail label="Artwork" value={row.artwork_id} />
            <Detail label="Buyer" value={row.user_id} />
            <Detail label="PaymentIntent" value={row.stripe_payment_intent_id} />
            <Detail label="Printful" value={row.printful_order_id} />
            <Detail label="Artist cut" value={fmtMoney(row.artist_cut, row.currency)} />
            <Detail
              label="Platform cut"
              value={fmtMoney(row.platform_cut, row.currency)}
            />
            <Detail label="Paid" value={fmtDate(row.paid_at)} />
            <Detail label="Shipped" value={fmtDate(row.shipped_at)} />
          </dl>

          <label className="mt-4 block text-[11px] uppercase tracking-wide text-white/40">
            Status
            <select
              value={row.status}
              disabled={busy}
              onChange={(e) => onStatus(e.target.value as CanvasOrderStatus)}
              className="mt-1 w-full rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-sm capitalize text-white disabled:opacity-40"
            >
              {ORDER_STATUSES.map((s) => (
                <option key={s} value={s} className="bg-ink text-white">
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-3 space-y-2">
            <input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="Tracking number"
              className="w-full rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/30"
            />
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Tracking URL"
              className="w-full rounded-xl border border-white/12 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-white/30"
            />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => onTracking(number, url)}
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/75 disabled:opacity-40"
            >
              Save tracking
            </button>
            {RETRYABLE.includes(row.status) && (
              <button
                type="button"
                disabled={busy}
                onClick={onRetry}
                className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-40"
              >
                {busy ? "Working…" : "Retry fulfilment"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 text-white/30">{label}</dt>
      <dd className="min-w-0 flex-1 break-all text-white/55">{value ?? "—"}</dd>
    </div>
  );
}
