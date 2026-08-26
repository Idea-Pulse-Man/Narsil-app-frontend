import { useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { FeedItem } from "@/data";
import { historyEras, shouldResolvePortrait } from "@/data";
import { useCatalog } from "@/data/catalog";
import ArtistAvatar from "./ArtistAvatar";
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
 * Full-screen reading beat in the For You snap feed — artist card rows from
 * `fyp_artist_cards`, or era context from static history data.
 */
export default function StoryCard({
  item,
  onOpenArtist,
  onOpenEra,
  clean,
  onCleanChange,
  priority = false,
}: StoryCardProps) {
  const { getArtist, getArtwork, getFypArtistCard } = useCatalog();
  const artistCard =
    item.kind === "artist-story" ? getFypArtistCard(item.artistId) : undefined;
  const artist =
    item.kind === "artist-story" ? getArtist(item.artistId) : undefined;
  const catalogBackdrop = getArtwork(item.backdropArtworkId);
  const backdropImage =
    catalogBackdrop?.image ??
    (item.kind === "artist-story" ? artistCard?.backdropImageUrl : undefined);
  const backdropTitle =
    catalogBackdrop?.title ??
    (item.kind === "artist-story" ? artistCard?.backdropTitle : undefined);
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

  const era =
    item.kind === "era-story"
      ? historyEras.find((e) => e.id === item.eraId)
      : undefined;

  if (item.kind === "artist-story" && !artistCard) return null;
  if (item.kind === "era-story" && !era) return null;

  const eyebrow = item.kind === "artist-story" ? "Artist" : "This age";
  const title =
    item.kind === "artist-story" ? artistCard!.name : era!.title;
  const meta =
    item.kind === "artist-story"
      ? [artistCard!.lifespan, artistCard!.nationality]
          .filter(Boolean)
          .join(" · ")
      : era!.years;
  const body =
    item.kind === "artist-story" ? artistCard!.bio : era!.description;
  const famous =
    item.kind === "artist-story" ? artistCard!.famousFor ?? null : null;
  const cta =
    item.kind === "artist-story" ? "Meet the artist" : "Explore this age";
  const onCta =
    item.kind === "artist-story"
      ? () => onOpenArtist(artistCard!.artistId)
      : () => onOpenEra(era!.id);

  const portraitSrc =
    item.kind === "artist-story" ? artistCard!.portraitUrl : undefined;
  const avatarName = artist?.name ?? artistCard!.name;
  const avatarInitials =
    artist?.initials ?? artistCard!.name.slice(0, 2).toUpperCase();

  return (
    <section
      className="relative h-full min-h-0 w-full snap-start snap-always overflow-hidden bg-ink"
      onPointerDownCapture={handlePointerDown}
      onPointerMoveCapture={handlePointerMove}
      onPointerUpCapture={handlePointerUp}
      onPointerCancelCapture={handlePointerCancel}
      onClickCapture={handleClickCapture}
    >
      {backdropImage ? (
        <div className="absolute inset-0 touch-pan-y">
          <BlurImage
            src={backdropImage}
            alt={backdropTitle ?? title}
            accent={FEED_BACKDROP}
            priority={priority}
            fit="cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/45 to-black/25" />
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
            transition={{ duration: 0.3 }}
            className={`absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end ${artworkFooterClass}`}
          >
            {item.kind === "artist-story" && portraitSrc ? (
              <div className="mb-4">
                <ArtistAvatar
                  src={portraitSrc}
                  name={avatarName}
                  initials={avatarInitials}
                  lookup={artist ? shouldResolvePortrait(artist) : false}
                  size={72}
                  priority={priority}
                  className="h-[4.5rem] w-[4.5rem] rounded-full ring-2 ring-white/25 shadow-lg"
                  fallbackClassName="bg-white/15 text-white text-lg font-semibold"
                  style={
                    artist?.accent ? { background: artist.accent } : undefined
                  }
                />
              </div>
            ) : null}

            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-accent/85">
              {eyebrow}
            </p>
            <h2 className="mt-2 max-w-[92%] font-serif text-[1.75rem] leading-tight text-white">
              {title}
            </h2>
            {meta ? (
              <p className="mt-1.5 text-sm text-white/55">{meta}</p>
            ) : null}

            {famous ? (
              <p className="mt-3 max-w-[92%] text-[13px] leading-snug text-accent/90">
                <span className="font-semibold uppercase tracking-[0.14em] text-accent/70">
                  Famous for
                </span>
                <span className="mt-1 block font-serif text-[15px] text-white/90">
                  {famous}
                </span>
              </p>
            ) : null}

            <p className="mt-3 max-w-[92%] line-clamp-6 text-[15px] leading-relaxed text-white/85">
              {body}
            </p>

            {backdropTitle && item.kind === "artist-story" ? (
              <p className="mt-2 max-w-[92%] truncate text-[11px] text-white/40">
                Backdrop · {backdropTitle}
              </p>
            ) : null}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onCta();
              }}
              className="pointer-events-auto mt-5 w-fit rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white/15"
            >
              {cta}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
