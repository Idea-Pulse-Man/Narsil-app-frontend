import { useCallback, useRef } from "react";
import { useCatalog } from "@/data/catalog";
import ArtworkCard from "./ArtworkCard";
import type { ToastState } from "./Toast";
import type { TutorialBridge } from "./tutorial";

export type FeedFilter = "all" | "museum" | "freelance";

interface ArtFeedProps {
  showToast: (message: string, variant?: ToastState["variant"]) => void;
  onOpenArtist: (artistId: string) => void;
  onCleanChange: (clean: boolean) => void;
  /** Reports the index of the visible artwork in the full `feedArtworks` array. */
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
  const { feedArtworks, getArtist, loading } = useCatalog();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const lastIndex = useRef(0);

  const items = feedArtworks.filter((art) => {
    if (filter === "museum") return art.origin !== "artist-original";
    if (filter === "freelance") return art.origin === "artist-original";
    return true;
  });

  // Lock vertical scrolling except on the step that teaches it, so the user
  // stays on the artwork while learning the other gestures.
  const lockScroll = !!tutorial?.active && tutorial.allow !== "scroll";
  const scrollStep = !!tutorial?.active && tutorial.allow === "scroll";

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;

    // Report the snapped index into the full feedArtworks array (not the filtered
    // list) so MobileShell's preference-modal trigger stays correct when the
    // Museum / Freelance toggle is active.
    const filteredIndex = Math.round(el.scrollTop / el.clientHeight);
    if (filteredIndex !== lastIndex.current) {
      lastIndex.current = filteredIndex;
      const artwork = items[filteredIndex];
      if (artwork) {
        const fullIndex = feedArtworks.findIndex((a) => a.id === artwork.id);
        if (fullIndex >= 0) onViewIndex?.(fullIndex);
      }
    }

    if (!scrollStep) return;
    const delta = Math.abs(el.scrollTop - lastScrollTop.current);
    if (delta < 24) return;
    lastScrollTop.current = el.scrollTop;
    tutorial?.report("scroll");
  }, [scrollStep, tutorial, onViewIndex, items, feedArtworks]);

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
          />
        );
      })}
    </div>
  );
}
