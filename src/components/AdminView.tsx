/**
 * Admin-only app shell — Overview / Users / Quiz / News / Canvas / Artworks / Chatting.
 *
 * Mounted instead of the member museum (Narsil / Discover / …) when
 * `profile.role === 'admin'`. RLS still gates every write; this UI is only a
 * convenience. Members never see this screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppState } from "./AppState";
import AdminArtworks from "./AdminArtworks";
import AdminInbox from "./AdminInbox";
import AdminNews from "./AdminNews";
import AdminInsights from "./AdminInsights";
import AdminOrders from "./AdminOrders";
import AdminOverview from "./AdminOverview";
import AdminQuiz from "./AdminQuiz";
import AdminUsers from "./AdminUsers";
import { screenScrollClass, screenContentClass } from "./artwork-layout";
import { FilterTabs } from "./admin-ui";
import {
  fetchAlertsEnabled,
  fetchPrintfulDrafts,
  setAlertsEnabled,
} from "@/lib/admin";
import { fetchUnreadSupportCount } from "@/lib/support";
import type { CanvasOrderStatus } from "@/lib/orders";
import type { ToastState } from "./Toast";

type AdminTab =
  | "overview"
  | "users"
  | "quiz"
  | "news"
  | "orders"
  | "artworks"
  | "inbox"
  | "insights";

const HINTS: Record<AdminTab, string> = {
  overview: "Narsil users, daily sign-ins and subscriptions.",
  users: "Status, role, Guild subscription, and password reset.",
  quiz: "Manage quiz problems — add, delete, or generate with AI.",
  news: "Write, edit, save, and publish news for members.",
  orders: "Track the canvas pipeline and unstick failed fulfilments.",
  artworks: "Approve member uploads, feature, hide, or take a work down.",
  inbox: "Reply to member live chat. Email stays in your mail app.",
  insights: "Anonymous usage, checkout drop-off and crash reports.",
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
  const [inboxUnread, setInboxUnread] = useState(0);
  const [draftCount, setDraftCount] = useState(0);
  const prevDrafts = useRef<number | null>(null);
  const [alertsOn, setAlertsOn] = useState(true);
  const [alertsBusy, setAlertsBusy] = useState(false);
  const prevUnread = useRef<number | null>(null);

  const jumpToOrders = (status: CanvasOrderStatus | "all") => {
    setOrderStatus(status);
    setOrderKey((k) => k + 1);
    setTab("orders");
  };

  const refreshUnread = useCallback(async () => {
    try {
      const n = await fetchUnreadSupportCount();
      setInboxUnread(n);
      return n;
    } catch {
      // SQL not applied yet — keep badge at 0.
      return 0;
    }
  }, []);

  const refreshAlerts = useCallback(async () => {
    try {
      setAlertsOn(await fetchAlertsEnabled());
    } catch {
      setAlertsOn(true);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    void refreshAlerts();
    void refreshUnread();
    const id = window.setInterval(() => {
      void refreshUnread().then((n) => {
        // Toast only when alerts are on and unread grows while not on Chatting.
        if (
          alertsOn &&
          prevUnread.current !== null &&
          n > prevUnread.current &&
          tab !== "inbox"
        ) {
          showToast(
            n === 1
              ? "New chat message waiting"
              : `${n} chat threads need a reply`,
          );
        }
        prevUnread.current = n;
      });
    }, 20_000);
    return () => window.clearInterval(id);
  }, [isAdmin, refreshUnread, refreshAlerts, alertsOn, tab, showToast]);

  useEffect(() => {
    if (tab === "inbox") void refreshUnread();
  }, [tab, refreshUnread]);

  // Paid canvas orders wait in Printful as drafts until confirmed there —
  // nothing prints until then, so a new one raises a badge and a toast.
  useEffect(() => {
    if (!isAdmin) return;
    const check = () =>
      void fetchPrintfulDrafts()
        .then((drafts) => {
          const n = drafts.length;
          if (prevDrafts.current !== null && n > prevDrafts.current) {
            showToast(
              n === 1
                ? "New canvas order — confirm it in Printful"
                : `${n} canvas orders waiting in Printful`,
            );
          }
          prevDrafts.current = n;
          setDraftCount(n);
        })
        .catch(() => {
          // Printful unreachable or not configured — keep the last count.
        });
    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [isAdmin, showToast]);

  const tabs = useMemo(
    () =>
      [
        { id: "overview" as const, label: "Overview" },
        { id: "users" as const, label: "Users" },
        { id: "quiz" as const, label: "Quiz" },
        { id: "news" as const, label: "News" },
        {
          id: "orders" as const,
          label: "Canvas",
          badge: draftCount > 0 ? draftCount : undefined,
        },
        { id: "artworks" as const, label: "Artworks" },
        {
          id: "inbox" as const,
          label: "Chatting",
          badge: inboxUnread > 0 ? inboxUnread : undefined,
        },
        { id: "insights" as const, label: "Insights" },
      ] satisfies { id: AdminTab; label: string; badge?: number }[],
    [inboxUnread, draftCount],
  );

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

  const toggleAlerts = async () => {
    if (alertsBusy) return;
    setAlertsBusy(true);
    const next = !alertsOn;
    try {
      await setAlertsEnabled(next);
      setAlertsOn(next);
      showToast(next ? "Alerts enabled" : "Alerts disabled");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not update alerts.",
        "error",
      );
    } finally {
      setAlertsBusy(false);
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
          <div className="flex shrink-0 flex-col items-end gap-2">
            <button
              type="button"
              onClick={() => void handleSignOut()}
              disabled={signingOut}
              className="rounded-full border border-white/15 px-3 py-1.5 text-xs text-white/70 disabled:opacity-40"
            >
              {signingOut ? "…" : "Sign out"}
            </button>
            <button
              type="button"
              onClick={() => void toggleAlerts()}
              disabled={alertsBusy}
              title={
                alertsOn
                  ? "Alerts on — toast when new chat messages arrive"
                  : "Alerts off — no toast notifications"
              }
              className={`rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${
                alertsOn
                  ? "border border-emerald-400/35 bg-emerald-400/15 text-emerald-100"
                  : "border border-white/12 text-white/45"
              }`}
            >
              {alertsOn ? "Alerts on" : "Alerts off"}
            </button>
          </div>
        </div>

        {!isAdmin ? (
          <p className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-white/55">
            This account doesn't have admin access.
          </p>
        ) : (
          <>
            <div className="mt-5">
              <FilterTabs
                value={tab}
                options={tabs}
                onChange={setTab}
                wrap
              />
            </div>

            {tab === "overview" && <AdminOverview onJumpToOrders={jumpToOrders} />}
            {tab === "users" && <AdminUsers showToast={showToast} />}
            {tab === "quiz" && <AdminQuiz showToast={showToast} />}
            {tab === "news" && <AdminNews showToast={showToast} />}
            {tab === "orders" && (
              <AdminOrders
                key={orderKey}
                initialStatus={orderStatus}
                showToast={showToast}
              />
            )}
            {tab === "artworks" && <AdminArtworks showToast={showToast} />}
            {tab === "insights" && <AdminInsights />}
            {tab === "inbox" && (
              <AdminInbox
                showToast={showToast}
                onThreadsChanged={() => void refreshUnread()}
                onUnreadCleared={() =>
                  setInboxUnread((n) => {
                    const next = Math.max(0, n - 1);
                    prevUnread.current = next;
                    return next;
                  })
                }
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
