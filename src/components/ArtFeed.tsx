import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Artwork, FeedItem } from "@/data";
import { feedItemKey } from "@/data";
import { useCatalog } from "@/data/catalog";
import { orderSessionFeed, interleaveStorySlides, shufflePreRankedBatches, diversifyFeed } from "@/lib/feed-utils";
import { prioritizeByTaste, hasTastePreferences } from "@/lib/personalize";
import { isRenderableFeedItem } from "@/lib/feedItemGuards";
import { markImageWarmed } from "@/lib/imageCache";
import { useAppState } from "./AppState";
import ArtworkCard from "./ArtworkCard";
import StoryCard from "./StoryCard";
import { artworkFooterClass } from "./artwork-layout";
import GalleryFrameMark from "./GalleryFrameMark";
import HistoryPlacard from "./HistoryPlacard";
import type { ToastState } from "./Toast";
import type { TutorialBridge } from "./tutorial";

export type FeedFilter = "all" | "museum" | "freelance";

/** How many more cards to mount each time the user nears the end of the feed. */
const FEED_PAGE = 2;
/** Grow the window this many cards before the user reaches the last mounted one. */
const FEED_LOOKAHEAD = 2;

interface ArtFeedProps {
  showToast: (message: string, variant?: ToastState["variant"]) => void;
  onOpenArtist: (artistId: string) => void;
  onOpenEra: (eraId: string) => void;
  /** Shared clean view for the whole feed (hides chrome while swiping). */
  clean: boolean;
  onCleanChange: (clean: boolean) => void;
  /** Reports the index of the currently-visible card within the feed. */
  onViewIndex?: (index: number) => void;
  /** Source toggle: mixed (all), museum (public-domain) or freelance originals. */
  filter?: FeedFilter;
  tutorial?: TutorialBridge;
  /** False when another tab is visible — pause feed batch fetches. */
  active?: boolean;
}

export default function ArtFeed({
  showToast,
  onOpenArtist,
  onOpenEra,
  clean,
  onCleanChange,
  onViewIndex,
  filter = "all",
  tutorial,
  active = true,
}: ArtFeedProps) {
  const {
    feedPool,
    getArtist,
    getArtwork,
    getFypArtistCard,
    loading,
    loadingBatch,
    hasMoreBatches,
    loadNextBatch,
    fypArtistCardMap,
    artistMap,
  } = useCatalog();
  const { seen, markSeen, preferences, feedMatchMode, ready } = useAppState();
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastScrollTop = useRef(0);
  const lastIndex = useRef(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [placardOpen, setPlacardOpen] = useState(false);

  // One shuffle seed per mount: keeps the within-batch order stable while the
  // user scrolls, but a fresh order every time the feed remounts (new session,
  // or a source-filter switch, since MobileShell keys ArtFeed by filter).
  const sessionSeed = useRef(Math.floor(Math.random() * 0x7fffffff)).current;

  // Freeze the "seen" set once prefs + catalog are ready, so cards marked seen
  // while scrolling don't reshuffle under the user mid-session. The snapshot
  // refreshes on the next app load — that's when unseen art gets promoted.
  const frozenSeen = useRef<Set<string> | null>(null);
  if (frozenSeen.current === null && ready && !loading && feedPool.length > 0) {
    frozenSeen.current = new Set(seen);
  }
  const seenSnapshot = frozenSeen.current;

  // Freeze the artwork order after the first non-empty pool so a background
  // catalog refresh (snapshot → preview → full) appends new works instead of
  // jumping the card the user is looking at. Story slides are derived from
  // this frozen list so they stay stable while scrolling.
  const frozenArtworks = useRef<Artwork[] | null>(null);
  const freezeKey = useRef<string>("");
  const nextFreezeKey = `${filter}:${feedMatchMode}:${(preferences.artTypes ?? []).join(",")}|${(preferences.periods ?? []).join(",")}|${(preferences.empires ?? []).join(",")}|${(preferences.artists ?? []).join(",")}|${(preferences.interests ?? []).join(",")}`;

  const artworks = useMemo<Artwork[]>(() => {
    const filtered = feedPool.filter((art) => {
      if (filter === "museum") return art.origin !== "artist-original";
      if (filter === "freelance") return art.origin === "artist-original";
      return true;
    });

    const personalized =
      feedMatchMode !== "normal" && hasTastePreferences(preferences);

    const mixed = personalized
      ? prioritizeByTaste(filtered, preferences, feedMatchMode, {
          artistMap,
          seed: sessionSeed,
        })
      : shufflePreRankedBatches(filtered, sessionSeed);

    const ranked = diversifyFeed(
      orderSessionFeed(mixed, {
        limit: mixed.length,
        seen: seenSnapshot ?? undefined,
      }),
    );

    if (ranked.length === 0) return frozenArtworks.current ?? ranked;
    // Don't lock order until local prefs/seen have hydrated — otherwise every
    // launch freezes the same unpersonalized snapshot as the opening card.
    if (!ready) return ranked;
    if (frozenArtworks.current === null || freezeKey.current !== nextFreezeKey) {
      freezeKey.current = nextFreezeKey;
      frozenArtworks.current = ranked;
      return ranked;
    }
    const byId = new Map(ranked.map((art) => [art.id, art]));
    const have = new Set(frozenArtworks.current.map((art) => art.id));
    const extra = ranked.filter((art) => !have.has(art.id));
    frozenArtworks.current = [
      ...frozenArtworks.current.map((art) => byId.get(art.id) ?? art),
      ...extra,
    ];
    return frozenArtworks.current;
  }, [feedPool, filter, seenSnapshot, preferences, feedMatchMode, nextFreezeKey, artistMap, sessionSeed, ready]);

  const renderGuard = useMemo(
    () => ({ getArtist, getFypArtistCard }),
    [getArtist, getFypArtistCard],
  );

  // Mixed feed: artworks + intermittent artist / era story slides.
  // Tutorial stays artwork-only so gesture lessons land on real cards.
  const items = useMemo<FeedItem[]>(
    () =>
      interleaveStorySlides(artworks, {
        seed: sessionSeed,
        fypArtistCardMap,
        skipStories: !!tutorial?.active,
        filter,
      }).filter((item) => isRenderableFeedItem(item, renderGuard)),
    [artworks, fypArtistCardMap, sessionSeed, tutorial?.active, filter, renderGuard],
  );

  // Infinite scroll: mount a small window of cards and grow it as the user
  // swipes toward the end, so a long feed doesn't decode hundreds of images up
  // front. Full-screen snap cards make an index threshold simpler (and snap-
  // safe) than a sentinel element inside the scroll container.
  const [renderCount, setRenderCount] = useState(FEED_PAGE);

  useEffect(() => {
    if (currentIndex >= renderCount - FEED_LOOKAHEAD && renderCount < items.length) {
      setRenderCount((c) => Math.min(c + FEED_PAGE, items.length));
    }
  }, [currentIndex, renderCount, items.length]);

  const visibleItems = items.slice(0, renderCount);

  // Warm the browser cache for images just ahead of the user so swiping to the
  // next card shows it instantly (artwork image or story backdrop).
  const preloaded = useRef<Set<string>>(new Set());
  const preloadItem = useCallback(
    (item?: FeedItem) => {
      if (!item) return;
      const art =
        item.kind === "artwork"
          ? item.artwork
          : getArtwork(item.backdropArtworkId);
      if (!art?.image || preloaded.current.has(art.id)) return;
      if (!active) return;
      preloaded.current.add(art.id);
      const img = new Image();
      img.decoding = "async";
      img.onload = () => markImageWarmed(art.image);
      img.src = art.image;
    },
    [getArtwork, active],
  );

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
      const item = items[index];
      if (item) {
        if (item.kind === "artwork") {
          markSeen(item.artwork.id);
        } else {
          setPlacardOpen(false);
        }
        onViewIndex?.(index);
        preloadItem(items[index + 1]);
        preloadItem(items[index + 2]);
      }
    }

    if (!scrollStep) return;
    const delta = Math.abs(el.scrollTop - lastScrollTop.current);
    if (delta < 24) return;
    lastScrollTop.current = el.scrollTop;
    tutorial?.report("scroll");
  }, [scrollStep, tutorial, onViewIndex, items, markSeen, preloadItem]);

  // The first card is on screen at mount — count it as seen and warm the next.
  useEffect(() => {
    const first = items[0];
    if (first?.kind === "artwork") {
      markSeen(first.artwork.id);
    }
    preloadItem(items[1]);
    preloadItem(items[2]);
  }, [items, markSeen, preloadItem]);

  // WhatsApp-style batching: when the user has scrolled through half of the
  // loaded artwork pool, fetch the next 80 from Supabase.
  const batchRequested = useRef(false);
  useEffect(() => {
    batchRequested.current = false;
  }, [artworks.length]);

  useEffect(() => {
    if (!active || loading || loadingBatch || !hasMoreBatches || artworks.length === 0) {
      return;
    }
    const artworksViewed = items
      .slice(0, currentIndex + 1)
      .filter((item) => item.kind === "artwork").length;
    const halfway = Math.max(1, Math.floor(artworks.length / 2));
    if (artworksViewed >= halfway && !batchRequested.current) {
      batchRequested.current = true;
      void loadNextBatch();
    }
  }, [
    currentIndex,
    items,
    artworks.length,
    loading,
    loadingBatch,
    hasMoreBatches,
    loadNextBatch,
    active,
  ]);

  // Tutorial resets should close the shared placard.
  useEffect(() => {
    if (tutorial?.resetToken === undefined) return;
    setPlacardOpen(false);
  }, [tutorial?.resetToken]);

  const currentItem = items[currentIndex];
  const currentArtwork =
    currentItem?.kind === "artwork" ? currentItem.artwork : undefined;
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
                  stroke="#c4a574"
                  strokeWidth="1.2"
                  opacity="0.18"
                />
                <circle
                  cx="48"
                  cy="48"
                  r="44"
                  fill="none"
                  stroke="#c4a574"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeDasharray="36 240"
                  opacity="0.95"
                />
              </svg>
              <GalleryFrameMark />
            </div>
            <p className="mt-5 font-serif text-[15px] tracking-[0.06em] text-accent/90">
              Preparing the gallery…
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
    <div className="relative h-full w-full bg-ink">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={`h-full w-full snap-y snap-mandatory overscroll-contain scroll-smooth bg-ink [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
          lockScroll ? "overflow-hidden" : "overflow-y-scroll"
        }`}
      >
        {visibleItems.map((item, index) => {
          if (item.kind === "artwork") {
            const artist = getArtist(item.artwork.artistId);
            if (!artist) return null;
            return (
              <ArtworkCard
                key={feedItemKey(item)}
                artwork={item.artwork}
                artist={artist}
                priority={index === currentIndex}
                zoomable={index === currentIndex}
                showToast={showToast}
                onOpenArtist={onOpenArtist}
                clean={clean}
                onCleanChange={onCleanChange}
                tutorial={tutorial}
                placardOpen={placardOpen}
                onOpenPlacard={() => setPlacardOpen(true)}
              />
            );
          }

          return (
            <StoryCard
              key={feedItemKey(item)}
              item={item}
              onOpenArtist={onOpenArtist}
              onOpenEra={onOpenEra}
              clean={clean}
              onCleanChange={onCleanChange}
              priority={index === currentIndex}
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
