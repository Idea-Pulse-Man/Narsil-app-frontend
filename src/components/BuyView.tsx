import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CANVAS_SIZES, priceForSize, type CanvasSize } from "@/data";
import { useCatalog } from "@/data/catalog";
import type { Artwork } from "@/data";
import BlurImage from "./BlurImage";
import { screenScrollClass, screenContentClass } from "./artwork-layout";
import { CloseIcon, CheckIcon } from "./Icons";
import type { ToastState } from "./Toast";

interface BuyViewProps {
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

type BuySource = "museum" | "freelance";

/** Deterministic per-artwork "from" price so the grid feels real but stable. */
function priceFromId(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CANVAS_SIZES[0].price + (h % 3) * 5;
}

/** Cap the museum grid so we don't render 100+ images at once. */
const MUSEUM_LIMIT = 48;

export default function BuyView({ showToast }: BuyViewProps) {
  // Drive the shop from the live catalog (real museum art via the backend image
  // proxy) so canvases show actual artwork — the same source the feed uses.
  const { artworks, getArtist } = useCatalog();
  // Museum Art (public-domain) vs Freelance (artist-original) — matches the
  // client's Buy-page sketch.
  const [source, setSource] = useState<BuySource>("museum");
  // The artwork id whose purchase sheet is open (null = closed).
  const [activeId, setActiveId] = useState<string | null>(null);
  const [size, setSize] = useState<CanvasSize>("Medium");
  const [interested, setInterested] = useState(false);

  const products = useMemo(
    () =>
      artworks.map((artwork) => ({
        id: `canvas-${artwork.id}`,
        artwork,
        priceFrom: priceFromId(artwork.id),
      })),
    [artworks],
  );

  const visibleProducts = useMemo(() => {
    const isFreelance = source === "freelance";
    const filtered = products.filter(({ artwork }) =>
      isFreelance
        ? artwork.origin === "artist-original"
        : artwork.origin !== "artist-original",
    );
    return isFreelance ? filtered : filtered.slice(0, MUSEUM_LIMIT);
  }, [products, source]);

  const activeProduct = products.find((p) => p.artwork.id === activeId);
  const activeArtwork: Artwork | undefined = activeProduct?.artwork;
  const activeArtist = activeArtwork
    ? getArtist(activeArtwork.artistId)
    : undefined;

  const openSheet = (artworkId: string) => {
    setActiveId(artworkId);
    setSize("Medium");
    setInterested(false);
  };

  return (
    <div className={screenScrollClass}>
      <div className={screenContentClass}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Canvas Shop
        </p>
        <h1 className="mt-2 font-serif text-[28px] leading-tight text-white">
          Own the art
        </h1>
        <p className="mt-2 max-w-[92%] text-[15px] leading-relaxed text-white/60">
          Gallery-grade canvas prints of every piece in Narsil. Choose a size and
          register your interest — full checkout is on the way.
        </p>

        {/* Museum Art / Freelance toggle */}
        <div className="mt-6 flex gap-2">
          {(
            [
              { id: "museum", label: "Museum Art" },
              { id: "freelance", label: "Freelance" },
            ] as { id: BuySource; label: string }[]
          ).map((opt) => (
            <button
              key={opt.id}
              onClick={() => {
                setSource(opt.id);
                setActiveId(null);
              }}
              className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
                source === opt.id
                  ? "bg-white text-ink"
                  : "border border-white/15 bg-white/5 text-white/70 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {visibleProducts.length === 0 && (
            <p className="col-span-2 mt-6 text-center text-sm text-white/45">
              No {source === "freelance" ? "freelance" : "museum"} canvases yet.
            </p>
          )}
          {visibleProducts.map((product, index) => {
            const artwork = product.artwork;
            const artist = getArtist(artwork.artistId);

            return (
              <motion.button
                key={product.id}
                onClick={() => openSheet(artwork.id)}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.3 }}
                whileTap={{ scale: 0.98 }}
                className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-left"
              >
                <div className="aspect-[3/4] w-full">
                  <BlurImage
                    src={artwork.image}
                    alt={artwork.title}
                    accent={artwork.accent}
                  />
                </div>
                <div className="p-3">
                  <p className="truncate font-serif text-sm text-white">
                    {artwork.title}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-white/45">
                    {artist?.name}
                  </p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm font-semibold text-white">
                      from ${product.priceFrom}
                    </span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 text-[10px] font-medium text-white/70">
                      Canvas
                    </span>
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      {/* Purchase-interest sheet */}
      <AnimatePresence>
        {activeProduct && activeArtwork && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              onClick={() => setActiveId(null)}
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
                    {activeArtwork.title}
                  </h2>
                  <p className="mt-1 truncate text-sm text-white/55">
                    {activeArtist?.name} · Canvas print
                  </p>
                </div>
                <button
                  onClick={() => setActiveId(null)}
                  aria-label="Close"
                  className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="mx-6 mt-4 overflow-hidden rounded-2xl">
                <div className="aspect-[4/3] w-full">
                  <BlurImage
                    src={activeArtwork.image}
                    alt={activeArtwork.title}
                    accent={activeArtwork.accent}
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
                    const price = priceForSize(activeProduct.priceFrom, opt.size);
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
                    Buy Canvas · $
                    {priceForSize(activeProduct.priceFrom, size)}
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
    </div>
  );
}
