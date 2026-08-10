import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Artwork } from "@/data";
import {
  describeTier,
  downloadArtwork,
  ProRequiredError,
  type DownloadTier,
} from "@/lib/download";
import { WORLD } from "@/data/worldCopy";
import { useAppState } from "./AppState";
import { CloseIcon, DownloadIcon } from "./Icons";
import type { ToastState } from "./Toast";

interface DownloadSheetProps {
  /** `null` keeps the sheet closed. */
  artwork: Artwork | null;
  onClose: () => void;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

/**
 * Resolution picker shown when saving an artwork.
 *
 * The two options are genuinely different files — the museum's IIIF server
 * resizes on request, so Standard is a real 2000px downscale and High
 * Resolution is the master scan. Nothing here relabels the same bytes: an App
 * Review reviewer who downloads both gets two different files, and a
 * subscriber who compares them sees why they paid.
 *
 * The Pro check here only decides what to OFFER. The backend re-checks
 * entitlement and answers 402, which arrives as `ProRequiredError` — so a
 * tampered client gets the paywall, not the file.
 */
export default function DownloadSheet({
  artwork,
  onClose,
  showToast,
}: DownloadSheetProps) {
  const { isPro, requestPro } = useAppState();
  const [busy, setBusy] = useState<DownloadTier | null>(null);

  const run = async (tier: DownloadTier) => {
    if (!artwork) return;
    setBusy(tier);
    try {
      await downloadArtwork(artwork, showToast, tier);
      onClose();
    } catch (err) {
      if (err instanceof ProRequiredError) {
        onClose();
        requestPro("hi-res-download");
        return;
      }
      showToast(err instanceof Error ? err.message : "Extract failed");
    } finally {
      setBusy(null);
    }
  };

  const handleHigh = () => {
    // Skip the round trip when we already know they aren't subscribed — going
    // to the server first would just be a slower way to show the same paywall.
    if (!isPro) {
      onClose();
      requestPro("hi-res-download");
      return;
    }
    void run("high");
  };

  return (
    <AnimatePresence>
      {artwork && (
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
            aria-label={WORLD.extractFromArchive}
          >
            <header className="mb-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-serif text-xl leading-tight">
                  {WORLD.extractFromArchive}
                </h2>
                <p className="mt-0.5 truncate text-sm text-white/50">
                  {artwork.title}
                </p>
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

            <div className="space-y-2.5">
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void run("standard")}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left transition-colors enabled:hover:bg-white/[0.06] disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Standard</span>
                  <span className="mt-0.5 block text-[12px] text-white/45">
                    {describeTier(artwork, "standard")} · Free
                  </span>
                </span>
                <span className="shrink-0 text-white/40">
                  {busy === "standard" ? "…" : <DownloadIcon className="h-5 w-5" />}
                </span>
              </button>

              <button
                type="button"
                disabled={busy !== null}
                onClick={handleHigh}
                className="flex w-full items-center justify-between gap-3 rounded-2xl border border-amber-300/25 bg-gradient-to-br from-amber-300/12 to-amber-300/[0.04] px-4 py-3.5 text-left transition-colors enabled:hover:border-amber-300/45 disabled:opacity-50"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">
                    {WORLD.masterFile}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-white/45">
                    {describeTier(artwork, "high")}
                    {isPro ? "" : ` · ${WORLD.explorersGuild}`}
                  </span>
                </span>
                <span className="shrink-0 text-amber-300">
                  {busy === "high" ? (
                    "…"
                  ) : isPro ? (
                    <DownloadIcon className="h-5 w-5" />
                  ) : (
                    <span className="rounded-full bg-amber-300 px-3 py-1 text-[11px] font-semibold text-ink">
                      Guild
                    </span>
                  )}
                </span>
              </button>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
