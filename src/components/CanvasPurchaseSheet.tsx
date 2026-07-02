import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  CANVAS_SIZES,
  priceForSize,
  priceFromId,
  type CanvasSize,
  type Artwork,
} from "@/data";
import { useCatalog } from "@/data/catalog";
import BlurImage from "./BlurImage";
import { CloseIcon, CheckIcon } from "./Icons";
import type { ToastState } from "./Toast";

interface CanvasPurchaseSheetProps {
  /** The artwork to order a canvas of. `null` keeps the sheet closed. */
  artwork: Artwork | null;
  onClose: () => void;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

/**
 * Bottom-sheet for ordering a canvas print of an artwork — size selection plus a
 * "register interest" capture (checkout is not wired in v1). Shared by the Buy
 * grid and the Saved collection so both flows stay identical.
 */
export default function CanvasPurchaseSheet({
  artwork,
  onClose,
  showToast,
}: CanvasPurchaseSheetProps) {
  const { getArtist } = useCatalog();
  const [size, setSize] = useState<CanvasSize>("Medium");
  const [interested, setInterested] = useState(false);

  // Reset the selection each time a new artwork opens the sheet.
  useEffect(() => {
    if (artwork) {
      setSize("Medium");
      setInterested(false);
    }
  }, [artwork]);

  const artist = artwork ? getArtist(artwork.artistId) : undefined;
  const priceFrom = artwork ? priceFromId(artwork.id) : 0;

  return (
    <AnimatePresence>
      {artwork && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
            className="absolute inset-0 z-40 bg-black/55"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            className="absolute inset-x-0 bottom-0 z-50 max-h-[88%] overflow-y-auto rounded-t-[28px] border-t border-white/10 bg-ink-soft/95 text-white shadow-placard backdrop-blur-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="flex flex-col items-center pb-1 pt-3">
              <div className="h-1.5 w-11 rounded-full bg-white/15" />
            </div>

            <div className="flex items-start justify-between gap-3 px-6 pt-2">
              <div className="min-w-0">
                <h2 className="truncate font-serif text-xl text-white">
                  {artwork.title}
                </h2>
                <p className="mt-1 truncate text-sm text-white/55">
                  {artist?.name} · Canvas print
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="mx-6 mt-4 overflow-hidden rounded-2xl">
              <div className="aspect-[4/3] w-full">
                <BlurImage
                  src={artwork.image}
                  alt={artwork.title}
                  accent={artwork.accent}
                  fit="contain"
                />
              </div>
            </div>

            {/* Size selection */}
            <div className="px-6 pt-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                Choose a size
              </p>
              <div className="mt-3 space-y-2">
                {CANVAS_SIZES.map((opt) => {
                  const selected = size === opt.size;
                  const price = priceForSize(priceFrom, opt.size);
                  return (
                    <button
                      key={opt.size}
                      onClick={() => setSize(opt.size)}
                      className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                        selected
                          ? "border-white/50 bg-white/10"
                          : "border-white/12 bg-white/[0.03] hover:bg-white/[0.06]"
                      }`}
                    >
                      <div>
                        <p className="text-sm font-medium text-white">
                          {opt.size}
                        </p>
                        <p className="text-xs text-white/45">{opt.dimensions}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-semibold text-white">
                          ${price}
                        </span>
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                            selected
                              ? "border-white bg-white text-ink"
                              : "border-white/30"
                          }`}
                        >
                          {selected && <CheckIcon className="h-3 w-3" />}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Buy / interest */}
            <div className="px-6 pb-8 pt-5">
              {interested ? (
                <div className="rounded-2xl border border-emerald-400/25 bg-emerald-400/10 p-4 text-center">
                  <p className="font-medium text-emerald-200">
                    Canvas checkout coming soon
                  </p>
                  <p className="mt-1 text-sm text-white/60">
                    We&apos;ve noted your interest in the {size.toLowerCase()}{" "}
                    print. You&apos;ll be first to know when ordering opens.
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setInterested(true);
                    showToast("Interest registered — checkout coming soon");
                  }}
                  className="flex w-full items-center justify-center rounded-full bg-white py-3.5 text-sm font-semibold text-ink transition-transform active:scale-[0.98]"
                >
                  Buy Canvas · ${priceForSize(priceFrom, size)}
                </button>
              )}
              <p className="mt-3 text-center text-[11px] text-white/35">
                Demo only — no payment is taken and nothing ships in v1.0.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
