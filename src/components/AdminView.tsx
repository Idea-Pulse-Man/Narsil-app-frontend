/**
 * Admin-only app shell — Overview / Artworks / Orders / Users / Inbox.
 *
 * Mounted instead of the member museum (Narsil / Discover / …) when
 * `profile.role === 'admin'`. RLS still gates every write; this UI is only a
 * convenience. Members never see this screen.
 */

import { useState } from "react";
import { useAppState } from "./AppState";
import AdminArtworks from "./AdminArtworks";
import AdminInbox from "./AdminInbox";
import AdminOrders from "./AdminOrders";
import AdminOverview from "./AdminOverview";
import AdminUsers from "./AdminUsers";
import { screenScrollClass, screenContentClass } from "./artwork-layout";
import { FilterTabs } from "./admin-ui";
import type { CanvasOrderStatus } from "@/lib/orders";
import type { ToastState } from "./Toast";

type AdminTab = "overview" | "artworks" | "orders" | "users" | "inbox";

const TABS: { id: AdminTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "artworks", label: "Artworks" },
  { id: "orders", label: "Orders" },
  { id: "users", label: "Users" },
  { id: "inbox", label: "Inbox" },
];

const HINTS: Record<AdminTab, string> = {
  overview: "Narsil users, daily sign-ins and subscriptions.",
  artworks: "Approve member uploads, feature, hide, or take a work down.",
  orders: "Track the canvas pipeline and unstick failed fulfilments.",
  users: "Status, role, Guild subscription, and password reset.",
  inbox: "Reply to member live chat. Email stays in your mail app.",
};

interface AdminViewProps {
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

export default function AdminView({ showToast }: AdminViewProps) {
  const { isAdmin, signOut } = useAppState();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [orderStatus, setOrderStatus] = useState<CanvasOrderStatus | "all">("all");
  const [orderKey, setOrderKey] = useState(0);
  const [signingOut, setSigningOut] = useState(false);

  const jumpToOrders = (status: CanvasOrderStatus | "all") => {
    setOrderStatus(status);
    setOrderKey((k) => k + 1);
    setTab("orders");
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      showToast("Signed out");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Sign out failed", "error");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className={screenScrollClass}>
      <div className={`${screenContentClass} !pb-[calc(env(safe-area-inset-bottom)+2rem)]`}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
              Narsil
            </p>
            <h1 className="mt-2 font-serif text-2xl text-white">Admin</h1>
            <p className="mt-1 text-sm text-white/50">{HINTS[tab]}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70 disabled:opacity-40"
          >
            {signingOut ? "…" : "Sign out"}
          </button>
        </div>

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
            {tab === "inbox" && <AdminInbox showToast={showToast} />}
          </>
        )}
      </div>
    </div>
  );
}
