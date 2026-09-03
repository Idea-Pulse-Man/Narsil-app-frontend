/**
 * Admin dashboard — Overview tab. One `admin_stats()` round trip: catalog +
 * user counts, order pipeline and revenue split. The "needs attention" tile is
 * the actionable one; it deep-links into the Orders tab.
 */

import { useCallback, useEffect, useState } from "react";
import { fetchAdminStats, type AdminStats } from "@/lib/admin";
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

  const gate = (
    <AdminState
      loading={loading}
      error={error}
      empty={!stats}
      emptyLabel="No stats available."
      onRetry={() => void load()}
    />
  );
  if (gate || !stats) return <div className="mt-6">{gate}</div>;

  const pipeline = Object.entries(stats.orders_by_status).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <>
      {stats.needs_attention > 0 && (
        <button
          type="button"
          onClick={() => onJumpToOrders("fulfillment_failed")}
          className="mt-6 flex w-full items-center justify-between rounded-2xl border border-red-400/25 bg-red-500/10 px-4 py-3.5 text-left"
        >
          <span className="text-sm text-red-100">
            {stats.needs_attention} order
            {stats.needs_attention === 1 ? "" : "s"} need fulfilment
          </span>
          <span className="text-red-200/60">›</span>
        </button>
      )}

      {(stats.pending_approvals ?? 0) > 0 && (
        <div className="mt-3 rounded-2xl border border-amber-300/25 bg-amber-400/10 px-4 py-3.5 text-sm text-amber-100">
          {stats.pending_approvals} upload
          {stats.pending_approvals === 1 ? "" : "s"} waiting for approval — open
          Artworks → Pending.
        </div>
      )}

      <AdminSection title="Catalog">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Artworks" value={stats.artworks} />
          <Stat label="Pending" value={stats.pending_approvals ?? 0} />
          <Stat label="Featured" value={stats.featured} />
          <Stat label="Hidden" value={stats.hidden} />
          <Stat label="For sale" value={stats.for_sale} />
        </div>
      </AdminSection>

      <AdminSection title="Users">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Total" value={stats.users} />
          <Stat label="New this week" value={stats.new_users_7d} />
          <Stat label="Admins" value={stats.admins} />
          <Stat label="Suspended" value={stats.suspended} />
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

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <AdminCard>
      <p className="text-xs uppercase tracking-wide text-white/40">{label}</p>
      <p className="mt-1 font-serif text-2xl text-white">{value}</p>
    </AdminCard>
  );
}
