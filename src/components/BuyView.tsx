import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { originLabel, priceFromId, type Artwork } from "@/data";
import { useCatalog } from "@/data/catalog";
import { useAppState } from "./AppState";
import BlurImage from "./BlurImage";
import CanvasPurchaseSheet from "./CanvasPurchaseSheet";
import { screenScrollClass, screenContentClass } from "./artwork-layout";
import { useInfiniteScroll } from "./useInfiniteScroll";
import { BookmarkIcon, SparkleIcon } from "./Icons";
import { formatCount } from "@/lib/format";
import type { ToastState } from "./Toast";

interface BuyViewProps {
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

// Museum Art (public-domain) vs Freelance (artist-original) — matches the
// client's Buy-page sketch.
type BuySource = "museum" | "freelance";

const SOURCES: BuySource[] = ["museum", "freelance"];

const SOURCE_LABEL: Record<BuySource, string> = {
  museum: "Museum Art",
  freelance: "Freelance",
};

/**
 * The single source of truth for the tab split, so the grid filter and the
 * per-tab counts can never drift apart.
 */
const matchesSource = (artwork: Artwork, source: BuySource) =>
  source === "freelance"
    ? artwork.origin === "artist-original" && artwork.forSale === true
    : artwork.origin !== "artist-original";

export default function BuyView({ showToast }: BuyViewProps) {
  // Drive the shop from the full interleaved feed pool; the grid reveals more
  // canvases as the user scrolls (infinite scroll), so every artwork is shoppable.
  const { feedPool, loading } = useCatalog();
  const [source, setSource] = useState<BuySource>("museum");
  // The artwork id whose purchase sheet is open (null = closed).
  const [activeId, setActiveId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const products = useMemo(
    () =>
      feedPool.map((artwork) => ({
        id: `canvas-${artwork.id}`,
        artwork,
        priceFrom: priceFromId(artwork.id),
      })),
    [feedPool],
  );

  const counts = useMemo(
    () => ({
      museum: products.filter((p) => matchesSource(p.artwork, "museum")).length,
      freelance: products.filter((p) => matchesSource(p.artwork, "freelance"))
        .length,
    }),
    [products],
  );

  const filteredProducts = useMemo(
    () => products.filter((p) => matchesSource(p.artwork, source)),
    [products, source],
  );

  const {
    visible: visibleProducts,
    sentinelRef,
    hasMore,
  } = useInfiniteScroll(filteredProducts, {
    resetKey: source,
    rootRef: scrollRef,
  });

  const activeArtwork =
    products.find((p) => p.artwork.id === activeId)?.artwork ?? null;

  const otherSource: BuySource = source === "museum" ? "freelance" : "museum";
  const otherCount = counts[otherSource];

  // Never claim a tab is empty while the catalogue is still arriving — the
  // grid shows skeletons until there's something real to say (see ArtFeed).
  const showSkeletonGrid = loading && products.length === 0;

  const emptyCopy =
    products.length === 0
      ? "We couldn't reach the gallery. Check your connection and try again."
      : otherCount > 0
        ? "Nothing here for now — the other collection has plenty to browse."
        : "Nothing here for now. Check back soon.";

  return (
    <div ref={scrollRef} className={screenScrollClass}>
      <div className={screenContentClass}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Canvas Shop
        </p>
        <h1 className="mt-2 font-serif text-[28px] leading-tight text-white">
          Own the art
        </h1>
        <p className="mt-3 max-w-[22rem] text-[13px] leading-relaxed text-white/55">
          Narsil is free to browse. If a piece moves you, buying a canvas print
          helps support the museum and the living artists who share their work
          here.
        </p>

        {/* Museum Art / Freelance segmented control. The indicator is a single
            pill translated between two equal-width cells, so it slides instead
            of popping between tabs. */}
        <div className="relative mt-6 grid grid-cols-2 rounded-full border border-white/10 bg-white/5 p-1">
          <motion.span
            aria-hidden
            initial={false}
            animate={{ x: source === "museum" ? "0%" : "100%" }}
            transition={{ type: "spring", stiffness: 400, damping: 34 }}
            className="absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] rounded-full bg-white"
          />
          {SOURCES.map((id) => {
            const active = source === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setSource(id);
                  setActiveId(null);
                }}
                aria-pressed={active}
                className={`relative z-10 rounded-full py-1.5 text-xs font-medium transition-colors duration-200 ${
                  active ? "text-ink" : "text-white/60 hover:text-white"
                }`}
              >
                {SOURCE_LABEL[id]}
                {/* A count of 0 is only meaningful once the catalogue has
                    actually arrived. */}
                {!showSkeletonGrid && (
                  <span
                    className={`ml-1.5 tabular-nums ${
                      active ? "text-ink/40" : "text-white/30"
                    }`}
                  >
                    {formatCount(counts[id])}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {showSkeletonGrid ? (
          <div
            role="status"
            aria-label="Loading canvases"
            className="mt-6 grid grid-cols-2 gap-3"
          >
            {[0, 1, 2, 3].map((i) => (
              <CanvasSkeleton key={i} />
            ))}
          </div>
        ) : visibleProducts.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/12 bg-white/5 text-white/40">
              <SparkleIcon className="h-7 w-7" />
            </span>
            <h2 className="mt-5 font-serif text-xl text-white">
              No {source === "freelance" ? "freelance" : "museum"} canvases yet
            </h2>
            <p className="mt-2 max-w-[17rem] text-[13px] leading-relaxed text-white/45">
              {emptyCopy}
            </p>
            {otherCount > 0 && (
              <button
                onClick={() => setSource(otherSource)}
                className="mt-6 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-transform active:scale-95"
              >
                Browse {SOURCE_LABEL[otherSource]}
              </button>
            )}
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3">
            {visibleProducts.map((product, index) => (
              <CanvasTile
                key={product.id}
                artwork={product.artwork}
                priceFrom={product.priceFrom}
                index={index}
                onOpen={setActiveId}
              />
            ))}
          </div>
        )}

        {/* Skeletons stand in for the next page so the grid keeps its shape
            while more canvases stream in. */}
        {hasMore && (
          <div
            ref={sentinelRef}
            role="status"
            aria-label="Loading more canvases"
            className="mt-3 grid grid-cols-2 gap-3"
          >
            {[0, 1].map((i) => (
              <CanvasSkeleton key={i} />
            ))}
          </div>
        )}
      </div>

      <CanvasPurchaseSheet
        artwork={activeArtwork}
        onClose={() => setActiveId(null)}
        showToast={showToast}
      />
    </div>
  );
}

/** Placeholder in the shape of a CanvasTile — keeps the grid from collapsing
 *  while the first page loads and while more canvases stream in. */
function CanvasSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]">
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-white/[0.04]">
        <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      </div>
      <div className="space-y-2 p-3">
        <div className="h-3 w-3/4 rounded-full bg-white/10" />
        <div className="h-2.5 w-1/2 rounded-full bg-white/[0.07]" />
      </div>
    </div>
  );
}

interface CanvasTileProps {
  artwork: Artwork;
  priceFrom: number;
  index: number;
  onOpen: (artworkId: string) => void;
}

/**
 * Shop tile — opens the canvas purchase sheet. Mirrors ArtworkTile's framing
 * (hover zoom, origin badge, quick-save) but leads with the starting price,
 * which is what this grid is for. It's an <article> rather than one big
 * <button> so the save control isn't nested inside another button.
 */
function CanvasTile({ artwork, priceFrom, index, onOpen }: CanvasTileProps) {
  const { getArtist } = useCatalog();
  const { isSaved, toggleSaved } = useAppState();
  const artist = getArtist(artwork.artistId);
  const saved = isSaved(artwork.id);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.3 }}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] transition-colors hover:border-white/20"
    >
      <motion.button
        onClick={() => onOpen(artwork.id)}
        whileTap={{ scale: 0.98 }}
        aria-label={`Order a canvas of ${artwork.title}`}
        className="block w-full text-left"
      >
        <div className="aspect-[3/4] w-full">
          <BlurImage
            src={artwork.image}
            alt={artwork.title}
            accent={artwork.accent}
            className="transition-transform duration-500 group-hover:scale-105"
            thumbWidth={320}
          />
        </div>
        <div className="p-3">
          <p className="truncate font-serif text-sm text-white">
            {artwork.title}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-white/45">
            {artist?.name} · {artwork.year}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="flex items-baseline gap-1">
              <span className="text-[10px] uppercase tracking-[0.08em] text-white/40">
                from
              </span>
              <span className="text-sm font-semibold tabular-nums text-white">
                ${priceFrom}
              </span>
            </span>
            <span
              className={`shrink-0 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[8px] font-semibold uppercase leading-none tracking-[0.05em] ${
                artwork.origin === "artist-original"
                  ? "bg-sky-400/15 text-sky-200"
                  : "bg-emerald-400/15 text-emerald-200"
              }`}
            >
              {originLabel(artwork.origin)}
            </span>
          </div>
        </div>
      </motion.button>

      <button
        onClick={() => toggleSaved(artwork.id)}
        aria-label={saved ? "Remove from saved" : "Save artwork"}
        aria-pressed={saved}
        className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-md transition-colors ${
          saved
            ? "border-amber-300/40 bg-amber-300/20 text-amber-300"
            : "border-white/15 bg-black/35 text-white hover:bg-black/50"
        }`}
      >
        <BookmarkIcon filled={saved} className="h-4 w-4" />
      </button>
    </motion.article>
  );
}
