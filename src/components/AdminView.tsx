/**
 * Admin dashboard shell — Overview / Artworks / Orders / Users.
 *
 * The tabs are a convenience only. Every action behind them is authorised
 * server-side by RLS policies and security-definer RPCs (see
 * `supabase/admin-dashboard.sql`), so a user who forces this screen open gets
 * errors rather than access.
 */

import { useState } from "react";
import { useAppState } from "./AppState";
import AdminArtworks from "./AdminArtworks";
import AdminOrders from "./AdminOrders";
import AdminOverview from "./AdminOverview";
import AdminUsers from "./AdminUsers";
import { screenScrollClass, screenContentClass } from "./artwork-layout";
import { FilterTabs } from "./admin-ui";
import type { CanvasOrderStatus } from "@/lib/orders";
import type { ToastState } from "./Toast";

type AdminTab = "overview" | "artworks" | "orders" | "users";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "artworks", label: "Artworks" },
  { id: "orders", label: "Orders" },
  { id: "users", label: "Users" },
];

const HINTS: Record<AdminTab, string> = {
  overview: "Catalog, accounts and canvas revenue at a glance.",
  artworks: "Feature, hide, approve for sale, or take a work down.",
  orders: "Track the canvas pipeline and unstick failed fulfilments.",
  users: "Promote admins and suspend accounts that break the rules.",
};

interface AdminViewProps {
  onBack: () => void;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

export default function AdminView({ onBack, showToast }: AdminViewProps) {
  const { isAdmin } = useAppState();
  const [tab, setTab] = useState<AdminTab>("overview");
  // Set when the Overview deep-links into a specific pipeline stage.
  const [orderStatus, setOrderStatus] = useState<CanvasOrderStatus | "all">("all");
  // Remounts AdminOrders so a deep link re-applies its initial filter.
  const [orderKey, setOrderKey] = useState(0);

  const jumpToOrders = (status: CanvasOrderStatus | "all") => {
    setOrderStatus(status);
    setOrderKey((k) => k + 1);
    setTab("orders");
  };

  return (
    <div className={screenScrollClass}>
      <div className={screenContentClass}>
        <button
          type="button"
          onClick={onBack}
          className="text-sm text-white/55 hover:text-white"
        >
          ← Back
        </button>
        <h1 className="mt-3 font-serif text-2xl text-white">Admin</h1>
        <p className="mt-1 text-sm text-white/50">{HINTS[tab]}</p>

        {!isAdmin ? (
          <p className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/55">
            This account doesn't have admin access.
          </p>
        ) : (
          <>
            <div className="mt-5">
              <FilterTabs value={tab} options={TABS} onChange={setTab} />
            </div>

            {tab === "overview" && <AdminOverview onJumpToOrders={jumpToOrders} />}
            {tab === "artworks" && <AdminArtworks showToast={showToast} />}
            {tab === "orders" && (
              <AdminOrders
                key={orderKey}
                initialStatus={orderStatus}
                showToast={showToast}
              />
            )}
            {tab === "users" && <AdminUsers showToast={showToast} />}
          </>
        )}
      </div>
    </div>
  );
}
