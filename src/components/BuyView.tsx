import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { priceFromId } from "@/data";
import { useCatalog } from "@/data/catalog";
import BlurImage from "./BlurImage";
import CanvasPurchaseSheet from "./CanvasPurchaseSheet";
import { screenScrollClass, screenContentClass } from "./artwork-layout";
import type { ToastState } from "./Toast";

interface BuyViewProps {
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

type BuySource = "museum" | "freelance";

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

  const activeArtwork =
    products.find((p) => p.artwork.id === activeId)?.artwork ?? null;

  return (
    <div className={screenScrollClass}>
      <div className={screenContentClass}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Canvas Shop
        </p>
        <h1 className="mt-2 font-serif text-[28px] leading-tight text-white">
          Own the art
        </h1>

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
                onClick={() => setActiveId(artwork.id)}
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

      <CanvasPurchaseSheet
        artwork={activeArtwork}
        onClose={() => setActiveId(null)}
        showToast={showToast}
      />
    </div>
  );
}
