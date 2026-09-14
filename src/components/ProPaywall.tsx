import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  canSubscribe,
  restorePurchases,
  subscribe,
  type PaywallReason,
  type SubscriptionState,
} from "@/lib/subscription";
import {
  getProducts,
  isPluginMissing,
  PRO_ANNUAL,
  type ProProductId,
  type StoreProduct,
} from "@/lib/storekit";
import { WORLD } from "@/data/worldCopy";
import { CloseIcon, CheckIcon } from "./Icons";
import type { ToastState } from "./Toast";

const REASON_COPY: Record<PaywallReason, { title: string; lead: string }> = {
  "practice-quiz": {
    title: "Keep exploring",
    lead: `You've used your five free questions. ${WORLD.explorersGuild} unlocks ${WORLD.unchartedArchives}.`,
  },
  "topic-quiz": {
    title: "Unlock every trial",
    lead: `Free members may trial Ancient Egypt. ${WORLD.explorersGuild} opens every age and empire quiz.`,
  },
  "hi-res-download": {
    title: `Extract the ${WORLD.masterFile}`,
    lead: "Get the museum's original scan instead of the 2000px version.",
  },
  settings: {
    title: WORLD.explorersGuild,
    lead: WORLD.subscribePitch,
  },
  "create-upload": {
    title: "Publish with the Guild",
    lead: `Uploading artwork is part of ${WORLD.explorersGuild}. Subscribe to submit work for review.`,
  },
};

const PERKS = [
  `${WORLD.unchartedArchives} — play as long as you can keep answering`,
  `Every age and empire trial beyond Ancient Egypt`,
  `Extract uncompressed ${WORLD.masterFile}s straight from the museum scan`,
];

interface ProPaywallProps {
  /** `null` keeps the sheet closed. */
  reason: PaywallReason | null;
  onClose: () => void;
  onSubscribed: (subscription: SubscriptionState) => void;
  onShowTerms: () => void;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

/**
 * Narsil Pro paywall.
 *
 * The layout is shaped by App Review guideline 3.1.2 as much as by design: a
 * subscription paywall MUST show the title, duration, price and an auto-renew
 * disclosure, and MUST link to Terms and Privacy and offer Restore Purchases.
 * Missing any of those is the most common reason a first submission is
 * rejected, so none of it is optional decoration.
 *
 * Prices are never formatted here — `displayPrice` comes from StoreKit already
 * localised to the user's storefront currency. Formatting it ourselves would
 * show the wrong currency abroad, which is itself a rejection.
 */
export default function ProPaywall({
  reason,
  onClose,
  onSubscribed,
  onShowTerms,
  showToast,
}: ProPaywallProps) {
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [selected, setSelected] = useState<ProProductId>(PRO_ANNUAL);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pluginMissing, setPluginMissing] = useState(false);

  const available = canSubscribe();

  useEffect(() => {
    if (!reason) return;
    let cancelled = false;

    setLoading(true);
    getProducts()
      .then((list) => {
        if (cancelled) return;
        setProducts(list);
        if (list.length > 0 && !list.some((p) => p.id === selected)) {
          setSelected(list[0].id as ProProductId);
        }
      })
      .catch((err) => {
        // Left in release builds on purpose — this is the only trace of WHY
        // the paywall is empty (plugin missing vs. App Store returning
        // nothing), and it is invisible outside Safari's Web Inspector.
        console.error("[ProPaywall] getProducts failed:", err);
        if (!cancelled) {
          setProducts([]);
          setPluginMissing(isPluginMissing(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `selected` intentionally omitted — refetching on selection would reset it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reason]);

  const handleSubscribe = async () => {
    setBusy(true);
    try {
      const outcome = await subscribe(selected);
      if (outcome.result === "cancelled") return; // silent — a normal choice
      onSubscribed(outcome.subscription);
      showToast(`${WORLD.explorersGuild} is active`);
      onClose();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Purchase failed");
    } finally {
      setBusy(false);
    }
  };

  const handleRestore = async () => {
    setBusy(true);
    try {
      const state = await restorePurchases();
      if (state.active) {
        onSubscribed(state);
        showToast(`${WORLD.explorersGuild} restored`);
        onClose();
      } else {
        showToast("No previous subscription found on this Apple ID");
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Restore failed");
    } finally {
      setBusy(false);
    }
  };

  const copy = reason ? REASON_COPY[reason] : null;
  const chosen = products.find((p) => p.id === selected);
  const trialDays = chosen?.trialDays ?? 0;

  return (
    <AnimatePresence>
      {reason && copy && (
        <motion.div
          /* `absolute`, not `fixed` — every overlay in this app positions
             against MobileShell's `relative h-[100dvh]` root, which keeps the
             desktop phone-frame preview intact. z-index sits ABOVE QuizOverlay
             (65), since the practice gate leaves the quiz open underneath, and
             BELOW TermsView (82) so the Terms link opens on top of this. */
          className="absolute inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.section
            className="w-full max-w-md rounded-t-3xl bg-[#1b1b1f] px-6 pb-8 pt-5 text-white"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={WORLD.explorersGuild}
          >
            <header className="mb-5 flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
                  {WORLD.explorersGuild}
                </p>
                <h2 className="mt-1 text-2xl font-semibold">{copy.title}</h2>
                <p className="mt-1 text-sm text-white/60">{copy.lead}</p>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-full p-2 text-white/50 transition hover:bg-white/10 hover:text-white"
              >
                <CloseIcon />
              </button>
            </header>

            <ul className="mb-6 space-y-2.5">
              {PERKS.map((perk) => (
                <li key={perk} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 shrink-0 text-amber-300">
                    <CheckIcon />
                  </span>
                  <span className="text-white/80">{perk}</span>
                </li>
              ))}
            </ul>

            {!available ? (
              <p className="rounded-2xl bg-white/5 p-4 text-center text-sm text-white/60">
                {WORLD.explorersGuild} is available on iPhone and iPad.
              </p>
            ) : loading ? (
              <p className="py-6 text-center text-sm text-white/50">
                Loading plans…
              </p>
            ) : products.length === 0 ? (
              <p className="rounded-2xl bg-white/5 p-4 text-center text-sm text-white/60">
                {pluginMissing
                  ? // A build without NarsilStoreKit.swift compiled in — see
                    // native/ios/README.md. Only reachable in broken builds,
                    // never in a correctly assembled release.
                    "Subscriptions aren't available in this build of the app."
                  : "Plans are unavailable right now. Please try again shortly."}
              </p>
            ) : (
              <>
                <div className="mb-4 space-y-2">
                  {products.map((product) => {
                    const isSelected = product.id === selected;
                    return (
                      <button
                        key={product.id}
                        type="button"
                        onClick={() => setSelected(product.id as ProProductId)}
                        aria-pressed={isSelected}
                        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3.5 text-left transition ${
                          isSelected
                            ? "border-accent bg-accent/15"
                            : "border-white/10 bg-white/5"
                        }`}
                      >
                        <span>
                          <span className="block text-sm font-medium">
                            {product.displayName}
                          </span>
                          {/* Duration is a required disclosure, not a detail. */}
                          <span className="block text-xs text-white/50">
                            Billed every {product.period}
                            {product.trialDays > 0 &&
                              ` · ${product.trialDays}-day free trial`}
                          </span>
                        </span>
                        <span className="text-base font-semibold">
                          {product.displayPrice}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  onClick={handleSubscribe}
                  disabled={busy}
                  className="w-full rounded-2xl bg-accent py-3.5 text-base font-semibold text-ink transition disabled:opacity-50"
                >
                  {busy
                    ? "Working…"
                    : trialDays > 0
                      ? `Start ${trialDays}-day free trial`
                      : "Subscribe"}
                </button>

                {/* Guideline 3.1.2 — the auto-renew terms must be on this screen,
                    not only in the App Store listing. */}
                <p className="mt-4 text-[11px] leading-relaxed text-white/45">
                  {chosen
                    ? `${chosen.displayName} renews automatically at ${chosen.displayPrice} per ${chosen.period} until cancelled. `
                    : "Your subscription renews automatically until cancelled. "}
                  Payment is charged to your Apple ID at confirmation of purchase.
                  {trialDays > 0 &&
                    ` Any unused portion of a free trial is forfeited when you purchase a subscription.`}{" "}
                  Cancel any time in Settings → Apple ID → Subscriptions, at
                  least 24 hours before the current period ends.
                </p>

                <div className="mt-4 flex items-center justify-center gap-4 text-xs text-white/50">
                  <button
                    type="button"
                    onClick={handleRestore}
                    disabled={busy}
                    className="underline underline-offset-2 disabled:opacity-50"
                  >
                    Restore Purchases
                  </button>
                  <span aria-hidden>·</span>
                  <button
                    type="button"
                    onClick={onShowTerms}
                    className="underline underline-offset-2"
                  >
                    Terms &amp; Privacy
                  </button>
                </div>
              </>
            )}
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
