import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Artwork } from "@/data";
import { useCatalog } from "@/data/catalog";
import { buildSessionFeed } from "@/lib/feed-utils";
import { useAppState } from "./AppState";
import ArtworkCard from "./ArtworkCard";
import { artworkFooterClass } from "./artwork-layout";
import HistoryPlacard from "./HistoryPlacard";
import type { ToastState } from "./Toast";
import type { TutorialBridge } from "./tutorial";

export type FeedFilter = "all" | "museum" | "freelance";

/** How many more cards to mount each time the user nears the end of the feed. */
const FEED_PAGE = 12;
/** Grow the window this many cards before the user reaches the last mounted one. */
const FEED_LOOKAHEAD = 4;

interface ArtFeedProps {
  showToast: (message: string, variant?: ToastState["variant"]) => void;
  onOpenArtist: (artistId: string) => void;
  /** Shared clean view for the whole feed (hides chrome while swiping). */
  clean: boolean;
  onCleanChange: (clean: boolean) => void;
  /** Reports the index of the currently-visible artwork within the feed. */
  onViewIndex?: (index: number) => void;
  /** Source toggle: mixed (all), museum (public-domain) or freelance originals. */
  filter?: FeedFilter;
  tutorial?: TutorialBridge;
}

export default function ArtFeed({
  showToast,
  onOpenArtist,
  clean,
  onCleanChange,
  onViewIndex,
  filter = "all",
  tutorial,
}: ArtFeedProps) {
  const { feedPool, getArtist, loading, artistMap } = useCatalog();
  const { seen, markSeen } = useAppState();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const lastIndex = useRef(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [placardOpen, setPlacardOpen] = useState(false);

  // One shuffle seed per mount: keeps the within-batch order stable while the
  // user scrolls, but a fresh order every time the feed remounts (new session,
  // or a source-filter switch, since MobileShell keys ArtFeed by filter).
  const sessionSeed = useRef(Math.floor(Math.random() * 0x7fffffff)).current;

  // Freeze the "seen" set once the catalog is ready, so cards marked seen while
  // scrolling don't reshuffle under the user mid-session. The snapshot refreshes
  // on the next app load — that's when unseen art gets promoted to the top.
  const frozenSeen = useRef<Set<string> | null>(null);
  if (frozenSeen.current === null && !loading && feedPool.length > 0) {
    frozenSeen.current = new Set(seen);
  }
  const seenSnapshot = frozenSeen.current;

  // Build the feed: filter by source, then rank into popularity batches shuffled
  // within each batch, with unseen works promoted ahead of already-seen ones.
  const items = useMemo<Artwork[]>(() => {
    const filtered = feedPool.filter((art) => {
      if (filter === "museum") return art.origin !== "artist-original";
      if (filter === "freelance") return art.origin === "artist-original";
      return true;
    });
    return buildSessionFeed(filtered, {
      // Uncapped: the whole ranked pool is the feed. Progressive rendering
      // (below) keeps only a growing window mounted so it stays fast.
      limit: filtered.length,
      seen: seenSnapshot ?? undefined,
      artistMap,
      seed: sessionSeed,
    });
  }, [feedPool, filter, seenSnapshot, artistMap, sessionSeed]);

  // Infinite scroll: mount a small window of cards and grow it as the user
  // swipes toward the end, so a long feed doesn't decode hundreds of images up
  // front. Full-screen snap cards make an index threshold simpler (and snap-
  // safe) than a sentinel element inside the scroll container.
  const [renderCount, setRenderCount] = useState(FEED_PAGE);

  // Collapse back to the first window whenever the feed itself changes.
  useEffect(() => {
    setRenderCount(FEED_PAGE);
  }, [items]);

  useEffect(() => {
    if (currentIndex >= renderCount - FEED_LOOKAHEAD && renderCount < items.length) {
      setRenderCount((c) => Math.min(c + FEED_PAGE, items.length));
    }
  }, [currentIndex, renderCount, items.length]);

  const visibleItems = items.slice(0, renderCount);

  // Warm the browser cache for images just ahead of the user so swiping to the
  // next artwork shows it instantly instead of popping in (applies equally to
  // museum and freelance images — both load from a plain CDN URL).
  const preloaded = useRef<Set<string>>(new Set());
  const preload = useCallback((art?: Artwork) => {
    if (!art?.image || preloaded.current.has(art.id)) return;
    preloaded.current.add(art.id);
    const img = new Image();
    img.src = art.image;
  }, []);

  // Lock vertical scrolling except on the step that teaches it, so the user
  // stays on the artwork while learning the other gestures.
  const lockScroll = !!tutorial?.active && tutorial.allow !== "scroll";
  const scrollStep = !!tutorial?.active && tutorial.allow === "scroll";

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    const index = Math.round(el.scrollTop / el.clientHeight);
    if (index !== lastIndex.current) {
      lastIndex.current = index;
      setCurrentIndex(index);
      const artwork = items[index];
      if (artwork) {
        markSeen(artwork.id);
        onViewIndex?.(index);
        preload(items[index + 1]);
        preload(items[index + 2]);
      }
    }

    if (!scrollStep) return;
    const delta = Math.abs(el.scrollTop - lastScrollTop.current);
    if (delta < 24) return;
    lastScrollTop.current = el.scrollTop;
    tutorial?.report("scroll");
  }, [scrollStep, tutorial, onViewIndex, items, markSeen, preload]);

  // The first card is on screen at mount — count it as seen and warm the next.
  useEffect(() => {
    if (items[0]) {
      markSeen(items[0].id);
      preload(items[1]);
      preload(items[2]);
    }
  }, [items, markSeen, preload]);

  // Tutorial resets should close the shared placard.
  useEffect(() => {
    if (tutorial?.resetToken === undefined) return;
    setPlacardOpen(false);
  }, [tutorial?.resetToken]);

  const currentArtwork = items[currentIndex];
  const currentArtist = currentArtwork
    ? getArtist(currentArtwork.artistId)
    : undefined;

  // No real artworks yet: show a loading state while fetching, or a friendly
  // empty state if the gallery couldn't be reached. Never show mock/fake data.
  // (Placed after all hooks so hook order stays stable — Rules of Hooks.)
  if (items.length === 0) {
    if (loading) {
      return (
        <div
          role="status"
          aria-label="Loading the gallery"
          className="relative h-full w-full overflow-hidden bg-ink"
        >
          <div className="absolute inset-0 bg-white/[0.04]">
            <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
          </div>
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/55 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
          </div>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center pb-24">
            <div className="animate-gallery-float relative flex h-[9.5rem] w-[9.5rem] items-center justify-center">
              {/* Ornate medieval ring — slow gold orbit */}
              <svg
                viewBox="0 0 120 120"
                className="animate-gallery-spin absolute inset-0 h-full w-full"
                aria-hidden
              >
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="#c4a574"
                  strokeWidth="1"
                  opacity="0.22"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="52"
                  fill="none"
                  stroke="#c4a574"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeDasharray="18 28 8 40 12 55"
                  opacity="0.9"
                />
                {/* Compass points */}
                <path
                  d="M60 6 L63 14 L60 12 L57 14 Z"
                  fill="#c4a574"
                  opacity="0.85"
                />
                <path
                  d="M60 114 L63 106 L60 108 L57 106 Z"
                  fill="#c4a574"
                  opacity="0.55"
                />
                <path
                  d="M6 60 L14 57 L12 60 L14 63 Z"
                  fill="#c4a574"
                  opacity="0.55"
                />
                <path
                  d="M114 60 L106 57 L108 60 L106 63 Z"
                  fill="#c4a574"
                  opacity="0.55"
                />
              </svg>

              {/* Classic parchment scroll */}
              <svg
                viewBox="0 0 72 96"
                className="relative h-[5.75rem] w-[4.35rem] drop-shadow-[0_10px_28px_rgba(196,165,116,0.28)]"
                aria-hidden
              >
                {/* Soft gold glow behind the scroll */}
                <ellipse
                  cx="36"
                  cy="48"
                  rx="28"
                  ry="36"
                  fill="#c4a574"
                  className="animate-gallery-glow"
                  opacity="0.12"
                />

                {/* Main parchment body */}
                <g
                  className="animate-gallery-unfurl"
                  style={{ transformOrigin: "36px 48px", transformBox: "fill-box" }}
                >
                  <path
                    d="M14 18 H58 Q64 18 64 24 V72 Q64 78 58 78 H14 Q8 78 8 72 V24 Q8 18 14 18 Z"
                    fill="#e4d9c8"
                  />
                  <path
                    d="M14 18 H58 Q64 18 64 24 V72 Q64 78 58 78 H14 Q8 78 8 72 V24 Q8 18 14 18 Z"
                    fill="url(#scrollShade)"
                    opacity="0.35"
                  />
                  {/* Illuminated manuscript lines */}
                  <rect x="16" y="28" width="18" height="3.5" rx="1" fill="#9a7b4a" opacity="0.55" />
                  <rect x="16" y="36" width="40" height="2" rx="1" fill="#3a2e24" opacity="0.28" />
                  <rect x="16" y="42" width="36" height="2" rx="1" fill="#3a2e24" opacity="0.22" />
                  <rect x="16" y="48" width="38" height="2" rx="1" fill="#3a2e24" opacity="0.22" />
                  <rect x="16" y="54" width="28" height="2" rx="1" fill="#3a2e24" opacity="0.18" />
                  <rect x="16" y="62" width="34" height="2" rx="1" fill="#3a2e24" opacity="0.16" />
                  {/* Tiny fleuron / illuminated initial mark */}
                  <path
                    d="M52 30 L54 28 L56 30 L54 32 Z"
                    fill="#c4a574"
                    opacity="0.8"
                  />
                </g>

                {/* Top roller */}
                <rect x="4" y="12" width="64" height="10" rx="5" fill="#c4a574" />
                <rect x="6" y="14" width="60" height="6" rx="3" fill="#9a7b4a" />
                <circle cx="8" cy="17" r="3.2" fill="#e4d9c8" opacity="0.55" />
                <circle cx="64" cy="17" r="3.2" fill="#e4d9c8" opacity="0.55" />

                {/* Bottom roller */}
                <rect x="4" y="74" width="64" height="10" rx="5" fill="#c4a574" />
                <rect x="6" y="76" width="60" height="6" rx="3" fill="#9a7b4a" />
                <circle cx="8" cy="79" r="3.2" fill="#e4d9c8" opacity="0.55" />
                <circle cx="64" cy="79" r="3.2" fill="#e4d9c8" opacity="0.55" />

                {/* Wax seal */}
                <circle cx="36" cy="70" r="7" fill="#7a2e24" opacity="0.92" />
                <circle
                  cx="36"
                  cy="70"
                  r="5"
                  fill="none"
                  stroke="#c4a574"
                  strokeWidth="0.8"
                  opacity="0.7"
                />
                <path
                  d="M36 66.5 L37.2 69.2 L40.2 69.4 L37.9 71.2 L38.6 74 L36 72.5 L33.4 74 L34.1 71.2 L31.8 69.4 L34.8 69.2 Z"
                  fill="#c4a574"
                  opacity="0.9"
                />

                <defs>
                  <linearGradient id="scrollShade" x1="8" y1="18" x2="64" y2="78">
                    <stop offset="0%" stopColor="#f4efe6" stopOpacity="0.5" />
                    <stop offset="55%" stopColor="#c4a574" stopOpacity="0.15" />
                    <stop offset="100%" stopColor="#3a2e24" stopOpacity="0.35" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <p className="mt-5 font-serif text-[15px] tracking-[0.08em] text-accent/90">
              Unfurling the collection…
            </p>
          </div>

          <div className={`absolute inset-x-0 bottom-0 ${artworkFooterClass}`}>
            <div className="h-7 w-[70%] rounded-md bg-white/15" />
            <div className="mt-3 flex items-center gap-2">
              <div className="h-6 w-6 shrink-0 rounded-full bg-white/15" />
              <div className="h-3.5 w-[38%] rounded-full bg-white/10" />
            </div>
            <div className="mt-4 h-9 w-28 rounded-full bg-white/10" />
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-ink px-8 text-center">
        <p className="font-serif text-lg text-white">No artworks to show</p>
        <p className="max-w-[16rem] text-sm text-white/50">
          We couldn&apos;t reach the gallery. Check your connection and try
          again.
        </p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`h-full w-full snap-y snap-mandatory overscroll-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          lockScroll ? "overflow-hidden" : "overflow-y-scroll"
        }`}
      >
        {visibleItems.map((artwork, index) => {
          const artist = getArtist(artwork.artistId);
          if (!artist) return null;
          return (
            <ArtworkCard
              key={artwork.id}
              artwork={artwork}
              artist={artist}
              priority={index === 0}
              showToast={showToast}
              onOpenArtist={onOpenArtist}
              clean={clean}
              onCleanChange={onCleanChange}
              tutorial={tutorial}
              placardOpen={placardOpen}
              onOpenPlacard={() => setPlacardOpen(true)}
            />
          );
        })}
      </div>

      {/* One placard for the whole feed — stays open while swiping artworks. */}
      {currentArtwork && currentArtist && (
        <HistoryPlacard
          artwork={currentArtwork}
          artist={currentArtist}
          open={placardOpen}
          onClose={() => setPlacardOpen(false)}
          passThroughBackdrop
        />
      )}
    </div>
  );
}
