import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Browser } from "@capacitor/browser";
import {
  APPLE_SUBSCRIPTIONS_URL,
  formatRenewal,
  planLabel,
  restorePurchases,
} from "@/lib/subscription";
import { WORLD } from "@/data/worldCopy";
import { useAppState } from "./AppState";
import { CloseIcon, CheckIcon } from "./Icons";
import type { ToastState } from "./Toast";

const PERKS = [
  WORLD.unchartedArchives,
  `Extract ${WORLD.masterFile}s`,
];

interface ProStatusSheetProps {
  open: boolean;
  onClose: () => void;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

/**
 * Narsil Pro status, for members.
 *
 * Exists because a subscriber never sees the paywall — they don't hit the
 * gates that raise it — so without this screen there is nowhere to find out
 * which plan you're on, when it renews, or how to cancel.
 *
 * Cancelling deliberately links out to Apple rather than offering an in-app
 * cancel: Apple owns the billing relationship, and an in-app "Cancel" button
 * that can't actually stop the charge is worse than no button at all.
 */
export default function ProStatusSheet({
  open,
  onClose,
  showToast,
}: ProStatusSheetProps) {
  const { subscription, setSubscription, refreshSubscription } = useAppState();
  const [busy, setBusy] = useState(false);

  /**
   * Re-read on open. Entitlement is loaded when the user changes, so a renewal
   * or cancellation that happened since launch would otherwise show a stale
   * date here — which is the one screen where the date is the whole point.
   */
  useEffect(() => {
    if (open) void refreshSubscription();
  }, [open, refreshSubscription]);

  const renewal = formatRenewal(subscription.expiresAt);
  const plan = planLabel(subscription.productId);
  const inGrace = subscription.status === "grace";

  /**
   * What the date actually means changes with auto-renew: the same timestamp is
   * the next charge when renewing and the last day of access when not. Showing
   * "Renews" to someone who has already cancelled is the kind of small lie that
   * produces a refund request.
   */
  const dateLabel = inGrace
    ? "Access continues until"
    : subscription.autoRenew
      ? "Renews on"
      : "Access ends on";

  const openApple = async () => {
    try {
      await Browser.open({ url: APPLE_SUBSCRIPTIONS_URL });
    } catch {
      // Web / unsupported platform — a normal link still gets there.
      window.open(APPLE_SUBSCRIPTIONS_URL, "_blank", "noopener");
    }
  };

  const handleRestore = async () => {
    setBusy(true);
    try {
      const state = await restorePurchases();
      // Only adopt a result that found something. An empty restore means
      // "Apple returned nothing" — which also happens on web and on a
      // transient failure — and writing that over a live entitlement would
      // drop a paying member to the free tier until they relaunch.
      if (state.active) {
        setSubscription(state);
        showToast("Subscription refreshed");
      } else {
        showToast("No active subscription found on this Apple ID");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.section
            className="w-full max-w-md rounded-t-3xl bg-[#1b1b1f] px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-5 text-white"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`${WORLD.explorersGuild} subscription`}
          >
            <header className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                  {WORLD.explorersGuild}
                </p>
                <h2 className="mt-1 font-serif text-2xl leading-tight">
                  {plan}
                </h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="shrink-0 rounded-full p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </header>

            {inGrace && (
              <p className="mb-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-[13px] leading-relaxed text-amber-200">
                There's a problem with your payment method. Apple will keep
                retrying — update your card in Settings to avoid losing access.
              </p>
            )}

            <dl className="mb-5 space-y-2.5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-white/50">Status</dt>
                <dd className="font-medium">
                  {inGrace ? "Payment retrying" : "Active"}
                </dd>
              </div>
              {renewal && (
                <div className="flex items-center justify-between gap-3 border-t border-white/8 pt-2.5">
                  <dt className="text-white/50">{dateLabel}</dt>
                  <dd className="font-medium">{renewal}</dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3 border-t border-white/8 pt-2.5">
                <dt className="text-white/50">Auto-renew</dt>
                <dd className="font-medium">
                  {subscription.autoRenew ? "On" : "Off"}
                </dd>
              </div>
            </dl>

            <ul className="mb-6 space-y-2">
              {PERKS.map((perk) => (
                <li key={perk} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 shrink-0 text-amber-300">
                    <CheckIcon className="h-4 w-4" />
                  </span>
                  <span className="text-white/80">{perk}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={openApple}
              className="w-full rounded-2xl border border-white/12 bg-white/[0.04] py-3.5 text-sm font-medium transition-colors hover:bg-white/[0.08]"
            >
              Manage or cancel in the App Store
            </button>

            <button
              type="button"
              onClick={handleRestore}
              disabled={busy}
              className="mt-3 w-full text-center text-xs text-white/50 underline underline-offset-2 disabled:opacity-50"
            >
              {busy ? "Checking…" : "Restore Purchases"}
            </button>

            <p className="mt-4 text-[11px] leading-relaxed text-white/50">
              Subscriptions are billed by Apple and can only be changed or
              cancelled from Settings → Apple ID → Subscriptions. Cancel at
              least 24 hours before the period ends to avoid the next charge.
            </p>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
