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

              {/* Aged medieval parchment — dimensional rollers, curled edges */}
              <svg
                viewBox="0 0 88 112"
                className="relative h-[6.5rem] w-[5.1rem] drop-shadow-[0_12px_32px_rgba(196,165,116,0.32)]"
                aria-hidden
              >
                <defs>
                  <linearGradient id="parchmentFace" x1="18" y1="20" x2="70" y2="92">
                    <stop offset="0%" stopColor="#f7f0e2" />
                    <stop offset="42%" stopColor="#e8dcc4" />
                    <stop offset="100%" stopColor="#cbb894" />
                  </linearGradient>
                  <linearGradient id="parchmentEdge" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#a89068" />
                    <stop offset="35%" stopColor="#e4d5b5" />
                    <stop offset="100%" stopColor="#8f7750" />
                  </linearGradient>
                  <linearGradient id="woodRod" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#d4b07a" />
                    <stop offset="45%" stopColor="#8a6236" />
                    <stop offset="100%" stopColor="#5c3f1f" />
                  </linearGradient>
                  <linearGradient id="woodEnd" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#e0c08a" />
                    <stop offset="55%" stopColor="#9a6e38" />
                    <stop offset="100%" stopColor="#4a3018" />
                  </linearGradient>
                  <radialGradient id="waxSeal" cx="40%" cy="35%" r="65%">
                    <stop offset="0%" stopColor="#b8453a" />
                    <stop offset="55%" stopColor="#7a241c" />
                    <stop offset="100%" stopColor="#4a1410" />
                  </radialGradient>
                  <filter id="softBlur" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="1.1" />
                  </filter>
                </defs>

                {/* Ambient gold bloom */}
                <ellipse
                  cx="44"
                  cy="56"
                  rx="30"
                  ry="38"
                  fill="#c4a574"
                  className="animate-gallery-glow"
                  opacity="0.14"
                  filter="url(#softBlur)"
                />

                <g
                  className="animate-gallery-unfurl"
                  style={{ transformOrigin: "44px 56px", transformBox: "fill-box" }}
                >
                  {/* Cast shadow under parchment */}
                  <ellipse
                    cx="46"
                    cy="94"
                    rx="24"
                    ry="4"
                    fill="#000"
                    opacity="0.28"
                    filter="url(#softBlur)"
                  />

                  {/* Left curl of parchment */}
                  <path
                    d="M20 24 C12 28 11 40 12 56 C11 72 12 84 20 88 C16 78 15 64 16 56 C15 48 16 34 20 24 Z"
                    fill="url(#parchmentEdge)"
                  />
                  {/* Right curl */}
                  <path
                    d="M68 24 C76 28 77 40 76 56 C77 72 76 84 68 88 C72 78 73 64 72 56 C73 48 72 34 68 24 Z"
                    fill="url(#parchmentEdge)"
                  />

                  {/* Main face */}
                  <path
                    d="M22 22 C28 20 60 20 66 22 L68 24 V88 C62 90 28 90 20 88 L20 24 Z"
                    fill="url(#parchmentFace)"
                  />
                  {/* Inner age wash */}
                  <path
                    d="M24 26 C30 24 58 24 64 26 V86 C58 88 30 88 24 86 Z"
                    fill="#b89a6a"
                    opacity="0.12"
                  />
                  {/* Soft vertical fold */}
                  <path
                    d="M44 26 V86"
                    stroke="#8a7048"
                    strokeWidth="3"
                    opacity="0.08"
                  />

                  {/* Script suggestion — uneven hand lines */}
                  <path
                    d="M28 36 Q36 34 48 36"
                    stroke="#6b4e2e"
                    strokeWidth="1.6"
                    fill="none"
                    opacity="0.45"
                    strokeLinecap="round"
                  />
                  <path
                    d="M28 43 H60"
                    stroke="#5c4228"
                    strokeWidth="1.15"
                    opacity="0.28"
                    strokeLinecap="round"
                  />
                  <path
                    d="M28 49 H56"
                    stroke="#5c4228"
                    strokeWidth="1.15"
                    opacity="0.24"
                    strokeLinecap="round"
                  />
                  <path
                    d="M28 55 H58"
                    stroke="#5c4228"
                    strokeWidth="1.1"
                    opacity="0.22"
                    strokeLinecap="round"
                  />
                  <path
                    d="M28 61 H50"
                    stroke="#5c4228"
                    strokeWidth="1.1"
                    opacity="0.18"
                    strokeLinecap="round"
                  />
                  <path
                    d="M28 67 H54"
                    stroke="#5c4228"
                    strokeWidth="1"
                    opacity="0.15"
                    strokeLinecap="round"
                  />

                  {/* Ribbon tails under seal */}
                  <path
                    d="M40 78 L36 92 L40 88 L44 92 Z"
                    fill="#7a241c"
                    opacity="0.85"
                  />
                  <path
                    d="M46 78 L44 90 L48 87 L52 92 Z"
                    fill="#5a1814"
                    opacity="0.8"
                  />

                  {/* Wax seal */}
                  <circle cx="44" cy="76" r="8.5" fill="url(#waxSeal)" />
                  <circle
                    cx="44"
                    cy="76"
                    r="6.4"
                    fill="none"
                    stroke="#c4a574"
                    strokeWidth="0.7"
                    opacity="0.55"
                  />
                  <path
                    d="M44 71.8 L45.1 74.6 L48.1 74.8 L45.8 76.6 L46.5 79.5 L44 77.9 L41.5 79.5 L42.2 76.6 L39.9 74.8 L42.9 74.6 Z"
                    fill="#c4a574"
                    opacity="0.85"
                  />
                </g>

                {/* Top wooden roller with turned finials */}
                <ellipse cx="10" cy="18" rx="5" ry="5.5" fill="url(#woodEnd)" />
                <ellipse cx="78" cy="18" rx="5" ry="5.5" fill="url(#woodEnd)" />
                <rect x="12" y="13.5" width="64" height="9" rx="4.5" fill="url(#woodRod)" />
                <rect x="14" y="15" width="60" height="2.2" rx="1" fill="#e8c990" opacity="0.35" />
                <ellipse cx="10" cy="18" rx="2.2" ry="2.4" fill="#3a2410" opacity="0.45" />
                <ellipse cx="78" cy="18" rx="2.2" ry="2.4" fill="#3a2410" opacity="0.45" />
                {/* Rolled parchment on top rod */}
                <path
                  d="M18 17 C24 14 64 14 70 17 C64 20 24 20 18 17 Z"
                  fill="#d8c8a4"
                  opacity="0.7"
                />

                {/* Bottom wooden roller */}
                <ellipse cx="10" cy="94" rx="5" ry="5.5" fill="url(#woodEnd)" />
                <ellipse cx="78" cy="94" rx="5" ry="5.5" fill="url(#woodEnd)" />
                <rect x="12" y="89.5" width="64" height="9" rx="4.5" fill="url(#woodRod)" />
                <rect x="14" y="91" width="60" height="2.2" rx="1" fill="#e8c990" opacity="0.3" />
                <ellipse cx="10" cy="94" rx="2.2" ry="2.4" fill="#3a2410" opacity="0.45" />
                <ellipse cx="78" cy="94" rx="2.2" ry="2.4" fill="#3a2410" opacity="0.45" />
                <path
                  d="M18 93 C24 90 64 90 70 93 C64 96 24 96 18 93 Z"
                  fill="#cbb894"
                  opacity="0.65"
                />
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
