import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { shouldResolvePortrait, type Artist } from "@/data";
import { useCatalog } from "@/data/catalog";
import {
  fetchArtistEngagement,
  type ArtistEngagement,
} from "@/lib/catalog";
import BlurImage from "./BlurImage";
import ArtistAvatar from "./ArtistAvatar";
import { CloseIcon, PlusIcon, CheckIcon } from "./Icons";
import { useAppState } from "./AppState";
import { formatCount } from "@/lib/format";
import { useInfiniteScroll } from "./useInfiniteScroll";

interface ArtistProfileModalProps {
  artist: Artist | null;
  onClose: () => void;
  onOpenArtwork?: (artworkId: string) => void;
}

export default function ArtistProfileModal({
  artist,
  onClose,
  onOpenArtwork,
}: ArtistProfileModalProps) {
  const { isFollowing, toggleFollowing } = useAppState();
  const { getArtworksByArtist, getArtistAvatar, getFypArtistCard } =
    useCatalog();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [engagement, setEngagement] = useState<ArtistEngagement | null>(null);
  const works = artist ? getArtworksByArtist(artist.id) : [];
  const { visible, sentinelRef, hasMore } = useInfiniteScroll(works, {
    pageSize: 24,
    resetKey: artist?.id,
    rootRef: scrollRef,
  });
  const isFreelance = artist?.profileType === "freelance";
  const following = artist ? isFollowing(artist.id) : false;
  const artistId = artist?.id ?? null;
  const story = artistId ? getFypArtistCard(artistId) : undefined;

  useEffect(() => {
    if (!artistId) {
      setEngagement(null);
      return;
    }
    const controller = new AbortController();
    setEngagement(null);
    fetchArtistEngagement(artistId, controller.signal)
      .then((next) => {
        if (!controller.signal.aborted) setEngagement(next);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEngagement(null);
      });
    return () => controller.abort();
  }, [artistId]);

  const portrait =
    story?.portraitUrl ||
    (artist ? getArtistAvatar(artist.id) : undefined) ||
    engagement?.avatarUrl ||
    undefined;
  const description = (
    story?.bio ||
    engagement?.bio ||
    artist?.bio ||
    ""
  ).trim();
  const famousFor = (story?.famousFor ?? "").trim();
  const originLine = [
    factOrEmpty(story?.nationality) || factOrEmpty(artist?.nationality),
    factOrEmpty(story?.lifespan) || factOrEmpty(artist?.lifespan),
  ].filter((part): part is string => Boolean(part));

  // Scale the display name to its length so long historical names (e.g.
  // "Joseph Mallord William Turner") stay balanced against the avatar instead
  // of overflowing the hero.
  const nameLength = artist?.name.length ?? 0;
  const nameSizeClass =
    nameLength > 34 ? "text-xl" : nameLength > 22 ? "text-2xl" : "text-3xl";

  return (
    <AnimatePresence>
      {artist && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          ref={scrollRef}
          className="absolute inset-0 z-[75] overflow-y-auto bg-ink [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {/* Hero */}
          <div className="relative w-full overflow-hidden">
            <div
              className="absolute inset-0"
              style={{
                background: isFreelance
                  ? `radial-gradient(120% 90% at 30% 10%, ${artist.accent ?? "#c4a574"}55, rgba(20,16,14,0.25)), linear-gradient(160deg, #2a221c, #14100e)`
                  : `radial-gradient(120% 90% at 30% 10%, rgba(196,165,116,0.18), rgba(20,16,14,0.25)), linear-gradient(160deg, #2f261f, #14100e)`,
              }}
            />
            <div className="relative flex min-h-60 items-center px-6 pb-6 pt-[calc(env(safe-area-inset-top)+1.5rem)]">
              <div className="flex w-full items-center gap-4">
                <ArtistAvatar
                  src={portrait}
                  name={artist.name}
                  initials={artist.initials}
                  lookup={shouldResolvePortrait(artist)}
                  size={80}
                  priority
                  className="h-20 w-20 shrink-0 rounded-full border border-white/15 font-serif text-2xl shadow-rail backdrop-blur-md"
                  fallbackClassName={
                    isFreelance ? "text-white" : "bg-white/10 text-white"
                  }
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
                    {isFreelance ? "Freelance Artist" : "Artist"}
                  </p>
                  <h2
                    className={`mt-1.5 font-serif ${nameSizeClass} leading-[1.05] text-white [overflow-wrap:anywhere] line-clamp-3`}
                  >
                    {artist.name}
                  </h2>
                  {originLine.length > 0 ? (
                    <p className="mt-2 text-sm text-white/60">
                      {originLine.join(" · ")}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onClose}
              aria-label="Close artist profile"
              className="absolute right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/30 text-white backdrop-blur-md"
            >
              <CloseIcon className="h-5 w-5" />
            </motion.button>
          </div>

          {/* Body */}
          <div className="px-6 pb-[calc(env(safe-area-inset-bottom)+6.5rem)]">
            {/* Live app counts — follows, and likes/saves on collection works. */}
            <div className="mt-5 flex items-center gap-5">
              <StatInline
                label="Followers"
                value={
                  engagement ? formatCount(engagement.followers) : "—"
                }
              />
              <StatInline
                label="Likes"
                value={engagement ? formatCount(engagement.likes) : "—"}
              />
              <StatInline
                label="Saves"
                value={engagement ? formatCount(engagement.saves) : "—"}
              />
              <button
                onClick={() => {
                  toggleFollowing(artist.id);
                  setEngagement((prev) =>
                    prev
                      ? {
                          ...prev,
                          followers: Math.max(
                            0,
                            prev.followers + (following ? -1 : 1),
                          ),
                        }
                      : prev,
                  );
                }}
                className={`ml-auto flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                  following
                    ? "border border-white/20 bg-white/5 text-white"
                    : "bg-accent text-ink"
                }`}
              >
                {following ? (
                  <>
                    <CheckIcon className="h-4 w-4" /> Following
                  </>
                ) : (
                  <>
                    <PlusIcon className="h-3.5 w-3.5" /> Follow
                  </>
                )}
              </button>
            </div>
            <p className="mt-2 max-w-[28rem] text-[11px] leading-snug text-white/40">
              Followers are people in Narsil. Likes and saves are on this
              artist&apos;s works in the collection.
            </p>

            {description ? (
              <div className="mt-6 border-y border-white/10 py-6">
                {famousFor ? (
                  <p className="text-[13px] leading-snug text-accent/90">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
                      Famous for
                    </span>
                    <span className="mt-1 block font-serif text-[15px] text-white/90">
                      {famousFor}
                    </span>
                  </p>
                ) : null}
                <h3
                  className={`text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45 ${
                    famousFor ? "mt-5" : ""
                  }`}
                >
                  Description
                </h3>
                <p className="mt-2 text-[15px] leading-relaxed text-white/75">
                  {description}
                </p>
              </div>
            ) : (
              <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 border-y border-white/10 py-6">
                <Stat label="Period" value={artist.period} />
                <Stat label="Style" value={artist.style} />
                {artist.knownFor ? (
                  <div className="col-span-2">
                    <Stat label="Known for" value={artist.knownFor} />
                  </div>
                ) : null}
              </div>
            )}

            <div className="mt-8 flex items-baseline justify-between">
              <h3 className="font-serif text-xl text-white">
                {isFreelance ? "Posts" : "Works in collection"}
              </h3>
              <span className="text-xs text-white/45">
                {works.length} {works.length === 1 ? "piece" : "pieces"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              {visible.map((work) => (
                <button
                  key={work.id}
                  onClick={() => onOpenArtwork?.(work.id)}
                  className="group overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] text-left"
                >
                  <div className="aspect-[3/4] w-full">
                    <BlurImage
                      src={work.image}
                      alt={work.title}
                      accent={work.accent}
                      className="transition-transform duration-500 group-hover:scale-105"
                      thumbWidth={240}
                    />
                  </div>
                  <div className="p-3">
                    <p className="truncate font-serif text-sm text-white">
                      {work.title}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-white/50">
                      {work.year} · {work.medium}
                    </p>
                  </div>
                </button>
              ))}
            </div>
            {hasMore ? <div ref={sentinelRef} className="h-8" /> : null}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Drop ingest placeholders ("—") so the name line is not "— · —". */
function factOrEmpty(value?: string | null): string {
  const text = (value ?? "").trim();
  if (!text || /^[-—–]+$/.test(text) || /^unknown$/i.test(text)) return "";
  return text;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">
        {label}
      </p>
      <p className="mt-1 text-sm text-white/85">{value}</p>
    </div>
  );
}

function StatInline({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-serif text-lg leading-none text-white">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.12em] text-white/45">
        {label}
      </p>
    </div>
  );
}
