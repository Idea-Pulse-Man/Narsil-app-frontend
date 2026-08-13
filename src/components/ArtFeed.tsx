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
            <div className="animate-gallery-float relative flex h-[7.25rem] w-[7.25rem] items-center justify-center">
              <svg
                viewBox="0 0 96 96"
                className="animate-gallery-spin absolute inset-0 h-full w-full"
                aria-hidden
              >
                <circle
                  cx="48"
                  cy="48"
                  r="44"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  className="text-accent/20"
                />
                <circle
                  cx="48"
                  cy="48"
                  r="44"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeDasharray="42 234"
                  className="text-accent"
                />
              </svg>
              <svg
                viewBox="0 0 64 80"
                className="relative h-[4.35rem] w-[3.5rem] drop-shadow-[0_8px_24px_rgba(196,165,116,0.22)]"
                aria-hidden
              >
                <rect
                  x="2"
                  y="2"
                  width="60"
                  height="76"
                  rx="3"
                  fill="#1a1410"
                  stroke="#c4a574"
                  strokeWidth="2.4"
                />
                <rect
                  x="6.5"
                  y="6.5"
                  width="51"
                  height="67"
                  rx="1.5"
                  fill="#241c16"
                  stroke="#9a7b4a"
                  strokeWidth="0.9"
                />
                <rect x="9" y="9" width="46" height="62" fill="#2c241c" />
                <circle
                  cx="38"
                  cy="26"
                  r="7"
                  fill="#c4a574"
                  className="animate-gallery-glow"
                  opacity="0.72"
                />
                <path
                  d="M9 44C18 36 26 48 32 40C38 50 48 38 55 46V71H9V44Z"
                  fill="#3a2e24"
                />
                <path
                  d="M9 52C20 46 34 58 55 48V71H9V52Z"
                  fill="#2a2218"
                  opacity="0.85"
                />
              </svg>
            </div>
            <p className="mt-5 font-serif text-[15px] tracking-wide text-accent/85">
              Opening the gallery…
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
