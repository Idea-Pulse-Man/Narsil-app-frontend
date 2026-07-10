import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Artwork } from "@/data";
import { useCatalog, FEED_LIMIT } from "@/data/catalog";
import { partitionSeen, sortByPopularity } from "@/lib/feed-utils";
import { useAppState } from "./AppState";
import ArtworkCard from "./ArtworkCard";
import HistoryPlacard from "./HistoryPlacard";
import type { ToastState } from "./Toast";
import type { TutorialBridge } from "./tutorial";

export type FeedFilter = "all" | "museum" | "freelance";

interface ArtFeedProps {
  showToast: (message: string, variant?: ToastState["variant"]) => void;
  onOpenArtist: (artistId: string) => void;
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
  onCleanChange,
  onViewIndex,
  filter = "all",
  tutorial,
}: ArtFeedProps) {
  const { feedPool, getArtist, loading } = useCatalog();
  const { seen, markSeen } = useAppState();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const lastIndex = useRef(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [placardOpen, setPlacardOpen] = useState(false);

  // Freeze the "seen" set once the catalog is ready, so cards marked seen while
  // scrolling don't reshuffle under the user mid-session. The snapshot refreshes
  // on the next app load — that's when unseen art gets promoted to the top.
  const frozenSeen = useRef<Set<string> | null>(null);
  if (frozenSeen.current === null && !loading && feedPool.length > 0) {
    frozenSeen.current = new Set(seen);
  }
  const seenSnapshot = frozenSeen.current;

  // Build the feed: filter by source, then show unseen works first and let seen
  // ones follow so the feed never runs dry. Capped to FEED_LIMIT images.
  const items = useMemo<Artwork[]>(() => {
    const filtered = feedPool.filter((art) => {
      if (filter === "museum") return art.origin !== "artist-original";
      if (filter === "freelance") return art.origin === "artist-original";
      return true;
    });
    if (!seenSnapshot || seenSnapshot.size === 0) {
      return [...filtered].sort(sortByPopularity).slice(0, FEED_LIMIT);
    }
    const { unseen, alreadySeen } = partitionSeen(filtered, seenSnapshot);
    unseen.sort(sortByPopularity);
    alreadySeen.sort(sortByPopularity);
    return [...unseen, ...alreadySeen].slice(0, FEED_LIMIT);
  }, [feedPool, filter, seenSnapshot]);

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
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-ink px-8 text-center">
        {loading ? (
          <>
            <span className="h-9 w-9 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
            <p className="text-sm text-white/55">Loading the gallery…</p>
          </>
        ) : (
          <>
            <p className="font-serif text-lg text-white">No artworks to show</p>
            <p className="max-w-[16rem] text-sm text-white/50">
              We couldn&apos;t reach the gallery. Check your connection and try
              again.
            </p>
          </>
        )}
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
        {items.map((artwork, index) => {
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
