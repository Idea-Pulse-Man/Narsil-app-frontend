import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Artwork } from "@/data";
import type { HistoryEra } from "@/data/history";
import { useCatalog } from "@/data/catalog";
import { sizedImageUrl } from "@/lib/imageUrl";
import ArtworkRow from "./ArtworkRow";
import ArtistRail from "./ArtistRail";
import { ArrowLeftIcon } from "./Icons";
import { useEraWorks, useArtistsForWorks } from "./era-works";
import { useInfiniteScroll } from "./useInfiniteScroll";
import TopicQuizBar from "./TopicQuizBar";
import { useAppState } from "./AppState";
import {
  isTopicQuizPrepared,
  useQuizBadges,
  useQuizPool,
  useQuizScores,
  useTopicQuizCache,
  type TopicQuizLaunch,
} from "@/lib/quiz";

/** Stable empty list, so effects keyed on `works` don't re-run every render. */
const NO_WORKS: Artwork[] = [];

interface EraScreenProps {
  era: HistoryEra | null;
  onClose: () => void;
  onOpenArtwork: (artworkId: string) => void;
  onOpenArtist: (artistId: string) => void;
  onOpenTopicQuiz: (launch: TopicQuizLaunch) => void;
  quizRefresh: number;
}

/** First paint only mounts this many rows; the rest page in on scroll. */
const ERA_PAGE = 12;
const ERA_WARM = 8;

/**
 * One age, in full. The Discover timeline only previews a couple of works per
 * era — tapping through lands here, where the whole age is listed and the back
 * button stays pinned to the header rather than trailing the last row.
 */
export default function EraScreen({
  era,
  onClose,
  onOpenArtwork,
  onOpenArtist,
  onOpenTopicQuiz,
  quizRefresh,
}: EraScreenProps) {
  const eraWorks = useEraWorks();
  const artistsForWorks = useArtistsForWorks();
  const { getArtist } = useCatalog();
  const { pool, artists: artistIndex } = useQuizPool();
  const { user } = useAppState();
  const { badges } = useQuizBadges(user?.id ?? null, quizRefresh);
  const { scores } = useQuizScores(user?.id ?? null, quizRefresh);
  useTopicQuizCache(pool, artistIndex);
  const unlockedIds = new Set(Object.keys(badges));
  const scrollRef = useRef<HTMLDivElement>(null);

  const works = era ? (eraWorks.get(era.id) ?? NO_WORKS) : NO_WORKS;
  const artists = artistsForWorks(works);
  const { visible, sentinelRef, hasMore } = useInfiniteScroll(works, {
    pageSize: ERA_PAGE,
    resetKey: era?.id,
    rootRef: scrollRef,
  });

  // Warm the first screen of thumbnails so they paint from cache on this open
  // and the next visit — not all 1,800 works at once.
  useEffect(() => {
    if (!era) return;
    for (const art of works.slice(0, ERA_WARM)) {
      if (!art.image) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = sizedImageUrl(art.image, 128);
    }
  }, [era, works]);

  return (
    <AnimatePresence>
      {era && (
        <motion.div
          ref={scrollRef}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          className="absolute inset-0 z-[60] overflow-y-auto bg-ink [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Back bar — sticks to the top so leaving is always one tap away,
              however far down the age you have scrolled. */}
          <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-white/10 bg-ink/85 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl">
            <button
              onClick={onClose}
              aria-label="Back to Discover"
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition-colors hover:bg-white/10 after:absolute after:-inset-2 after:content-['']"
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <p className="truncate font-serif text-[17px] leading-tight text-white">
                {era.title}
              </p>
              <p className="truncate text-[11px] text-white/45">
                {era.years} · {works.length}{" "}
                {works.length === 1 ? "work" : "works"}
              </p>
            </div>
          </div>

          <div className="px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-emerald-300/80">
              {era.years}
            </p>
            <h1 className="mt-1 font-serif text-[28px] leading-tight text-white">
              {era.title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/55">
              {era.description}
            </p>

            {era.quizPrepared !== false &&
              isTopicQuizPrepared({
                kind: "age",
                id: era.id,
                title: era.title,
              }) && (
                <TopicQuizBar
                  topic={{ kind: "age", id: era.id, title: era.title }}
                  targets={works}
                  pool={pool}
                  artists={artistIndex}
                  unlockedIds={unlockedIds}
                  scores={scores}
                  onPlay={onOpenTopicQuiz}
                />
              )}

            <ArtistRail artists={artists.slice(0, 8)} onOpen={onOpenArtist} />

            <div className="mt-5 space-y-3">
              {visible.map((artwork, index) => {
                const artist = getArtist(artwork.artistId);
                return (
                  <ArtworkRow
                    key={artwork.id}
                    artwork={artwork}
                    subtitle={`${artist?.name ?? "Unknown"} · ${artwork.year}`}
                    onOpen={onOpenArtwork}
                    priority={index < 5}
                  />
                );
              })}
            </div>

            {hasMore ? <div ref={sentinelRef} className="h-8" /> : null}

            {works.length === 0 && (
              <p className="mt-10 text-center text-sm text-white/45">
                No works from this age have loaded yet.
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
