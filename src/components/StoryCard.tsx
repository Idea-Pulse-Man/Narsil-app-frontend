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

  const catalogBackdrop = getArtwork(item.backdropArtworkId);

  if (item.kind === "artist-story") {
    const artistCard = getFypArtistCard(item.artistId);
    if (!artistCard) return null;
    const artist = getArtist(item.artistId);
    const backdropImage =
      catalogBackdrop?.image ?? artistCard.backdropImageUrl;
    const backdropTitle =
      catalogBackdrop?.title ?? artistCard.backdropTitle;
    const avatarName = artist?.name ?? artistCard.name;
    const avatarInitials =
      artist?.initials ?? artistCard.name.slice(0, 2).toUpperCase();

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
              alt={backdropTitle ?? artistCard.name}
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
              {artistCard.portraitUrl ? (
                <div className="mb-4">
                  <ArtistAvatar
                    src={artistCard.portraitUrl}
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

              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent/85">
                Artist
              </p>
              <h2 className="mt-2 max-w-[92%] font-serif text-[1.75rem] leading-tight text-white">
                {artistCard.name}
              </h2>
              {[artistCard.lifespan, artistCard.nationality].filter(Boolean)
                .length > 0 && (
                <p className="mt-1.5 text-sm text-white/55">
                  {[artistCard.lifespan, artistCard.nationality]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}

              {artistCard.famousFor ? (
                <p className="mt-3 max-w-[92%] text-[13px] leading-snug text-accent/90">
                  <span className="font-semibold uppercase tracking-[0.14em] text-accent/70">
                    Famous for
                  </span>
                  <span className="mt-1 block font-serif text-[15px] text-white/90">
                    {artistCard.famousFor}
                  </span>
                </p>
              ) : null}

              <p className="mt-3 max-w-[92%] line-clamp-6 text-[15px] leading-relaxed text-white/85">
                {artistCard.bio}
              </p>

              {backdropTitle ? (
                <p className="mt-2 max-w-[92%] truncate text-[11px] text-white/50">
                  Backdrop · {backdropTitle}
                </p>
              ) : null}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenArtist(artistCard.artistId);
                }}
                className="pointer-events-auto mt-5 w-fit rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white/15"
              >
                Meet the artist
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    );
  }

  const era = historyEras.find((e) => e.id === item.eraId);
  if (!era) return null;

  const backdropImage = catalogBackdrop?.image;
  const backdropTitle = catalogBackdrop?.title;

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
            alt={backdropTitle ?? era.title}
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
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-accent/85">
              This age
            </p>
            <h2 className="mt-2 max-w-[92%] font-serif text-[1.75rem] leading-tight text-white">
              {era.title}
            </h2>
            <p className="mt-1.5 text-sm text-white/55">{era.years}</p>
            <p className="mt-3 max-w-[92%] line-clamp-6 text-[15px] leading-relaxed text-white/85">
              {era.description}
            </p>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenEra(era.id);
              }}
              className="pointer-events-auto mt-5 w-fit rounded-full border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-medium text-white backdrop-blur-md transition-colors hover:bg-white/15"
            >
              Explore this age
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
