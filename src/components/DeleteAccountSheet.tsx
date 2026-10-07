import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Browser } from "@capacitor/browser";
import { deleteAccount } from "@/lib/account";
import { APPLE_SUBSCRIPTIONS_URL } from "@/lib/subscription";
import { useAppState } from "./AppState";
import { CloseIcon } from "./Icons";
import type { ToastState } from "./Toast";

interface DeleteAccountSheetProps {
  open: boolean;
  onClose: () => void;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

const CONFIRM_WORD = "DELETE";

/**
 * In-app account deletion (App Store Review Guideline 5.1.1(v)). Typing a
 * word to confirm keeps a stray tap from destroying an account. Narsil Pro is
 * billed by Apple, so deleting the account can't stop the charge — the sheet
 * says so and links to Apple's subscription page instead of pretending.
 */
export default function DeleteAccountSheet({
  open,
  onClose,
  showToast,
}: DeleteAccountSheetProps) {
  const { signOut, isPro } = useAppState();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (busy) return;
    setTyped("");
    setError(null);
    onClose();
  };

  const openApple = async () => {
    try {
      await Browser.open({ url: APPLE_SUBSCRIPTIONS_URL });
    } catch {
      window.open(APPLE_SUBSCRIPTIONS_URL, "_blank", "noopener");
    }
  };

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      await signOut();
      setTyped("");
      onClose();
      showToast("Your account has been deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the account");
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
          onClick={close}
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
            aria-label="Delete account"
          >
            <header className="mb-4 flex items-start justify-between gap-4">
              <h2 className="font-serif text-2xl leading-tight">Delete account</h2>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="shrink-0 rounded-full p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </header>

            <p className="text-sm leading-relaxed text-white/75">
              This permanently deletes your profile, saved and liked works,
              comments, quiz progress, delivery addresses and any artwork you
              uploaded. It can't be undone.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/55">
              Records of canvas orders you've paid for are kept for our
              accounts, without your name or address.
            </p>

            {isPro && (
              <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 px-4 py-3 text-[13px] leading-relaxed text-amber-200">
                Your subscription is billed by Apple and keeps renewing until you
                cancel it there.{" "}
                <button
                  type="button"
                  onClick={openApple}
                  className="font-medium underline underline-offset-2"
                >
                  Cancel in the App Store
                </button>
              </div>
            )}

            <label className="mt-5 block text-xs text-white/50">
              Type {CONFIRM_WORD} to confirm
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                className="mt-2 w-full rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none focus:border-red-400/60"
              />
            </label>

            {error && (
              <p className="mt-3 text-[13px] leading-relaxed text-red-300">{error}</p>
            )}

            <button
              type="button"
              onClick={confirm}
              disabled={busy || typed.trim().toUpperCase() !== CONFIRM_WORD}
              className="mt-5 w-full rounded-2xl bg-red-500/90 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-red-500 disabled:opacity-40"
            >
              {busy ? "Deleting…" : "Delete my account"}
            </button>
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="mt-3 w-full text-center text-xs text-white/50"
            >
              Cancel
            </button>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
