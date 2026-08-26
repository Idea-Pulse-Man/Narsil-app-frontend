import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { FeedItem } from "@/data";
import { historyEras } from "@/data/history";
import { useCatalog } from "@/data/catalog";
import BlurImage from "./BlurImage";
import { artworkFooterClass } from "./artwork-layout";

type StoryFeedItem = Extract<
  FeedItem,
  { kind: "artist-story" } | { kind: "era-story" }
>;

interface StoryCardProps {
  item: StoryFeedItem;
  onOpenArtist: (artistId: string) => void;
  onOpenEra: (eraId: string) => void;
  clean: boolean;
  onCleanChange: (clean: boolean) => void;
  priority?: boolean;
}

const FEED_BACKDROP = "#14100e";
const LONG_PRESS_MS = 400;

/**
 * Full-screen reading beat in the For You snap feed — artist bio or era
 * context, tied to a blurred backdrop from a work the user just saw.
 */
export default function StoryCard({
  item,
  onOpenArtist,
  onOpenEra,
  clean,
  onCleanChange,
  priority = false,
}: StoryCardProps) {
  const { getArtist, getArtwork } = useCatalog();
  const backdrop = getArtwork(item.backdropArtworkId);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const cleanRef = useRef(clean);
  cleanRef.current = clean;

  const clearHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const setClean = (next: boolean) => {
    cleanRef.current = next;
    onCleanChange(next);
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    startPos.current = { x: e.clientX, y: e.clientY };
    longPressFired.current = false;
    clearHold();
    if (!cleanRef.current) {
      holdTimer.current = setTimeout(() => {
        cleanRef.current = true;
        setClean(true);
        longPressFired.current = true;
      }, LONG_PRESS_MS);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startPos.current) return;
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    if (dx > 8 || dy > 8) clearHold();
  };

  const handlePointerUp = () => {
    clearHold();
    startPos.current = null;
    if (longPressFired.current) {
      suppressClick.current = true;
      longPressFired.current = false;
    }
  };

  const handlePointerCancel = () => {
    clearHold();
    startPos.current = null;
  };

  const handleClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (cleanRef.current) {
      cleanRef.current = false;
      setClean(false);
      e.preventDefault();
      e.stopPropagation();
    }
  };

  let eyebrow = "Artist";
  let title = "";
  let meta = "";
  let body = "";
  let cta = "Meet the artist";
  let onCta: (() => void) | null = null;

  if (item.kind === "artist-story") {
    const artist = getArtist(item.artistId);
    if (!artist) return null;
    eyebrow = "Artist";
    title = artist.name;
    meta = [artist.lifespan, artist.nationality].filter(Boolean).join(" · ");
    body = artist.bio;
    cta = "Meet the artist";
    onCta = () => onOpenArtist(artist.id);
  } else {
    const era = historyEras.find((e) => e.id === item.eraId);
    if (!era) return null;
    eyebrow = "This age";
    title = era.title;
    meta = era.years;
    body = era.description;
    cta = "Explore this age";
    onCta = () => onOpenEra(era.id);
  }

  return (
    <section
      className="relative h-full min-h-0 w-full snap-start snap-always overflow-hidden bg-ink"
      onPointerDownCapture={handlePointerDown}
      onPointerMoveCapture={handlePointerMove}
      onPointerUpCapture={handlePointerUp}
      onPointerCancelCapture={handlePointerCancel}
      onClickCapture={handleClickCapture}
    >
      {backdrop?.image ? (
        <div className="absolute inset-0 touch-pan-y">
          <BlurImage
            src={backdrop.image}
            alt=""
            accent={FEED_BACKDROP}
            priority={priority}
            fit="cover"
            className="scale-110 opacity-50 blur-sm"
          />
          <div className="absolute inset-0 bg-ink/55" />
        </div>
      ) : (
        <div className="absolute inset-0 bg-ink" />
      )}

      <AnimatePresence>
        {!clean && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="pointer-events-none absolute inset-0"
          >
            <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/60 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!clean && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className={`absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end ${artworkFooterClass}`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent/85">
              {eyebrow}
            </p>
            <h2 className="mt-2 max-w-[92%] font-serif text-[1.75rem] leading-tight text-white">
              {title}
            </h2>
            {meta ? (
              <p className="mt-1.5 text-sm text-white/55">{meta}</p>
            ) : null}
            <p className="mt-4 max-w-[92%] line-clamp-4 text-[15px] leading-relaxed text-white/85">
              {body}
            </p>
            {onCta ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onCta?.();
                }}
                className="pointer-events-auto mt-5 w-fit rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white/15"
              >
                {cta}
              </button>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
