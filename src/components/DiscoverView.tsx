import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  historyEras,
  featuredArtistIds,
  eraForArtwork,
  artworks as curatedArtworks,
  shouldResolvePortrait,
  type Artwork,
  type Artist,
} from "@/data";
import { useCatalog } from "@/data/catalog";
import { sizedAvatarUrl } from "@/lib/imageUrl";
import BlurImage from "./BlurImage";
import ArtistAvatar from "./ArtistAvatar";
import ArtworkTile from "./ArtworkTile";
import { screenScrollClass, screenContentClass } from "./artwork-layout";

interface DiscoverViewProps {
  onOpenArtist: (artistId: string) => void;
  onOpenArtwork: (artworkId: string) => void;
}

/** The three ways to explore the past — no search box, just tap to browse. */
type Lens = "age" | "empire" | "artist";

/** Merge two id-keyed lists, keeping the first occurrence of each id. */
function mergeById<T extends { id: string }>(base: T[], extra: T[]): T[] {
  const seen = new Set(base.map((item) => item.id));
  const out = [...base];
  for (const item of extra) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/** How many artists to show in the grid before loading more on scroll. */
const ARTIST_PAGE = 36;

/** How many works each timeline era previews (curated set-pieces first). */
const ERA_PREVIEW = 6;

export default function DiscoverView({
  onOpenArtist,
  onOpenArtwork,
}: DiscoverViewProps) {
  const {
    artworks: liveArtworks,
    artists: liveArtists,
    getArtwork,
    getArtist,
    getArtistAvatar,
  } = useCatalog();
  const [lens, setLens] = useState<Lens>("age");
  const [activeEmpire, setActiveEmpire] = useState<string | null>(null);
  const [visibleArtists, setVisibleArtists] = useState(ARTIST_PAGE);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  const featured = featuredArtistIds
    .map((id) => getArtist(id))
    .filter((a): a is Artist => !!a);

  // Warm the cache for above-the-fold featured portraits.
  useEffect(() => {
    for (const artist of featured) {
      const url = getArtistAvatar(artist.id);
      if (!url) continue;
      const img = new Image();
      img.src = sizedAvatarUrl(url, 64);
    }
  }, [featured, getArtistAvatar]);

  // Reset pagination when switching to the artist lens.
  useEffect(() => {
    if (lens === "artist") setVisibleArtists(ARTIST_PAGE);
  }, [lens]);

  // Explore across BOTH the curated timeline and the live museum catalog, so the
  // famous set pieces always appear and the real collection fills everything in.
  const artworkPool = useMemo(
    () => mergeById(curatedArtworks, liveArtworks),
    [liveArtworks],
  );

  // ── Lens 1: Ages ── curated set-pieces stay pinned first, then the live
  // museum catalog fills each era (matched by period/tags/empire, then date).
  const eraWorks = useMemo(() => {
    const map = new Map<string, Artwork[]>();
    for (const era of historyEras) {
      map.set(
        era.id,
        era.artworkIds
          .map((id) => getArtwork(id))
          .filter((a): a is Artwork => !!a),
      );
    }
    for (const art of liveArtworks) {
      const era = eraForArtwork(art);
      if (!era) continue;
      const list = map.get(era.id)!;
      if (!list.some((a) => a.id === art.id)) list.push(art);
    }
    return map;
  }, [liveArtworks, getArtwork]);

  // The named artists working in an era — anonymous/"Unknown" makers add
  // nothing to a portrait rail, so they're skipped.
  const artistsForWorks = (works: Artwork[]): Artist[] => {
    const seen = new Set<string>();
    const list: Artist[] = [];
    for (const work of works) {
      const artist = getArtist(work.artistId);
      if (!artist || seen.has(artist.id)) continue;
      if (!artist.name || /^unknown/i.test(artist.name)) continue;
      seen.add(artist.id);
      list.push(artist);
    }
    return list.slice(0, 16);
  };

  // ── Lens 2: Empires ── group every work that belongs to an ancient empire.
  const empireGroups = useMemo(() => {
    const map = new Map<
      string,
      { empire: string; artworks: Artwork[]; artistIds: Set<string> }
    >();
    for (const art of artworkPool) {
      if (!art.empire) continue;
      let group = map.get(art.empire);
      if (!group) {
        group = { empire: art.empire, artworks: [], artistIds: new Set() };
        map.set(art.empire, group);
      }
      group.artworks.push(art);
      group.artistIds.add(art.artistId);
    }
    return Array.from(map.values()).sort(
      (a, b) => b.artworks.length - a.artworks.length,
    );
  }, [artworkPool]);

  const selectedEmpire =
    empireGroups.find((g) => g.empire === activeEmpire) ?? empireGroups[0];
  const empireArtists = selectedEmpire
    ? Array.from(selectedEmpire.artistIds)
        .map((id) => getArtist(id))
        .filter((a): a is Artist => !!a)
    : [];

  // ── Lens 3: Artists ── every named artist in the catalog, ranked by
  // popularity: real engagement on their works (likes + saves from Supabase)
  // first, profile followers as the tiebreak. Anonymous/"Unknown" makers and
  // garbled catalog names (not starting with a letter, e.g. "? a lithograph")
  // are skipped. No cap — the grid pages in via infinite scroll.
  const browseArtists = useMemo(() => {
    const engagement = new Map<string, number>();
    for (const art of liveArtworks) {
      const score = (art.likeCount ?? 0) + (art.saveCount ?? 0);
      if (score > 0) {
        engagement.set(
          art.artistId,
          (engagement.get(art.artistId) ?? 0) + score,
        );
      }
    }
    const list: Artist[] = [];
    const seen = new Set<string>();
    const push = (artist: Artist | undefined) => {
      if (!artist || seen.has(artist.id)) return;
      if (!artist.name || /^unknown/i.test(artist.name)) return;
      if (!/^\p{L}/u.test(artist.name)) return;
      seen.add(artist.id);
      list.push(artist);
    };
    for (const id of featuredArtistIds) push(getArtist(id));
    for (const artist of liveArtists) push(artist);
    return list.sort(
      (a, b) =>
        (engagement.get(b.id) ?? 0) - (engagement.get(a.id) ?? 0) ||
        b.followers - a.followers,
    );
  }, [liveArtworks, liveArtists, getArtist]);

  const shownArtists = browseArtists.slice(0, visibleArtists);
  const hasMoreArtists = visibleArtists < browseArtists.length;

  // Load the next page of artists as the user scrolls near the grid bottom.
  useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || lens !== "artist" || !hasMoreArtists) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleArtists((n) =>
            Math.min(n + ARTIST_PAGE, browseArtists.length),
          );
        }
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [lens, hasMoreArtists, browseArtists.length, visibleArtists]);

  return (
    <div className={screenScrollClass}>
      <div className={screenContentClass}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Discover
        </p>
        <h1 className="mt-2 font-serif text-[28px] leading-tight text-white">
          Art History
        </h1>

        {/* Featured artists rail */}
        <h2 className="mt-7 font-serif text-lg text-white">Featured artists</h2>
        <div className="mt-3 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {featured.map((artist) => (
            <button
              key={artist.id}
              onClick={() => onOpenArtist(artist.id)}
              className="flex w-[4.5rem] shrink-0 flex-col items-center gap-2"
            >
              <ArtistAvatar
                src={getArtistAvatar(artist.id)}
                name={artist.name}
                initials={artist.initials}
                lookup={shouldResolvePortrait(artist)}
                size={64}
                priority
                className="h-16 w-16 rounded-full border border-white/15 font-serif text-lg text-white"
                fallbackClassName=""
                style={
                  artist.accent ? { backgroundColor: artist.accent } : undefined
                }
              />
              <span className="line-clamp-2 text-center text-[11px] leading-tight text-white/60">
                {artist.name}
              </span>
            </button>
          ))}
        </div>

        {/* Explore lens selector */}
        <div className="mt-8 flex items-center justify-between gap-3">
          <h2 className="font-serif text-lg text-white">
            {lens === "age" ? "By age" : lens === "empire" ? "By empire" : "By artist"}
          </h2>
          <div className="flex items-center gap-0.5 rounded-full border border-white/12 bg-white/[0.04] p-0.5">
            {(
              [
                { id: "age", label: "Art age" },
                { id: "empire", label: "Empire" },
                { id: "artist", label: "Artists" },
              ] as { id: Lens; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setLens(opt.id)}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                  lens === opt.id
                    ? "bg-white text-ink"
                    : "text-white/60 hover:text-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {/* ─────────────────────────── AGES ─────────────────────────── */}
          {lens === "age" && (
            <motion.div
              key="age"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="relative mt-5 space-y-10"
            >
              <div className="absolute bottom-0 left-[7px] top-0 w-px bg-white/10" />

              {historyEras.map((era, eraIndex) => {
                const works = eraWorks.get(era.id) ?? [];
                const eraArtists = artistsForWorks(works);
                const shown = works.slice(0, ERA_PREVIEW);
                const hidden = works.length - shown.length;
                return (
                  <motion.section
                    key={era.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: eraIndex * 0.06, duration: 0.35 }}
                    className="relative pl-7"
                  >
                    <div className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white/30 bg-ink ring-4 ring-ink" />

                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300/80">
                      {era.years}
                    </p>
                    <h3 className="mt-1 font-serif text-xl text-white">
                      {era.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/55">
                      {era.description}
                    </p>

                    {/* Who was working in this age */}
                    <ArtistRail artists={eraArtists} onOpen={onOpenArtist} />

                    <div className="mt-4 space-y-3">
                      {shown.map((artwork) => {
                        const artist = getArtist(artwork.artistId);
                        return (
                          <ArtworkRow
                            key={artwork.id}
                            artwork={artwork}
                            subtitle={`${artist?.name ?? "Unknown"} · ${artwork.year}`}
                            onOpen={onOpenArtwork}
                          />
                        );
                      })}
                    </div>

                    {hidden > 0 && (
                      <p className="mt-3 text-[11px] text-white/35">
                        +{hidden} more {hidden === 1 ? "work" : "works"} from
                        this age in the collection
                      </p>
                    )}
                  </motion.section>
                );
              })}
            </motion.div>
          )}

          {/* ────────────────────────── EMPIRES ───────────────────────── */}
          {lens === "empire" && (
            <motion.div
              key="empire"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="mt-5"
            >
              {empireGroups.length === 0 ? (
                <EmptyNote text="Empires appear here once the collection loads." />
              ) : (
                <>
                  {/* Empire chips — sift by empire */}
                  <div className="flex flex-wrap gap-2">
                    {empireGroups.map((group) => {
                      const active = group.empire === selectedEmpire?.empire;
                      return (
                        <button
                          key={group.empire}
                          onClick={() => setActiveEmpire(group.empire)}
                          className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                            active
                              ? "bg-white text-ink"
                              : "border border-white/15 bg-white/5 text-white/70 hover:text-white"
                          }`}
                        >
                          {group.empire}
                          <span
                            className={`ml-1.5 ${active ? "text-ink/50" : "text-white/35"}`}
                          >
                            {group.artworks.length}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {selectedEmpire && (
                    <motion.div
                      key={selectedEmpire.empire}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25 }}
                      className="mt-6"
                    >
                      <h3 className="font-serif text-xl text-white">
                        {selectedEmpire.empire}
                      </h3>
                      <p className="mt-1 text-[12px] text-white/45">
                        {selectedEmpire.artworks.length}{" "}
                        {selectedEmpire.artworks.length === 1 ? "work" : "works"}{" "}
                        · {empireArtists.length}{" "}
                        {empireArtists.length === 1 ? "artist" : "artists"}
                      </p>

                      <ArtistRail artists={empireArtists} onOpen={onOpenArtist} />

                      <div className="mt-5 grid grid-cols-2 gap-3">
                        {selectedEmpire.artworks.map((art, i) => (
                          <ArtworkTile
                            key={art.id}
                            artwork={art}
                            index={i}
                            onOpen={onOpenArtwork}
                          />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </>
              )}
            </motion.div>
          )}

          {/* ────────────────────────── ARTISTS ───────────────────────── */}
          {lens === "artist" && (
            <motion.div
              key="artist"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="mt-6"
            >
              {browseArtists.length === 0 ? (
                <EmptyNote text="Artists appear here once the collection loads." />
              ) : (
                <>
                <div className="grid grid-cols-3 gap-x-3 gap-y-6">
                  {shownArtists.map((artist) => (
                    <button
                      key={artist.id}
                      onClick={() => onOpenArtist(artist.id)}
                      className="flex flex-col items-center gap-2"
                    >
                      <ArtistAvatar
                        src={getArtistAvatar(artist.id)}
                        name={artist.name}
                        initials={artist.initials}
                        lookup={shouldResolvePortrait(artist)}
                        size={80}
                        className="h-20 w-20 rounded-full border border-white/15 font-serif text-lg text-white"
                        fallbackClassName=""
                        style={
                          artist.accent
                            ? { backgroundColor: artist.accent }
                            : undefined
                        }
                      />
                      <span className="flex flex-col items-center">
                        <span className="line-clamp-2 text-center text-[11px] leading-tight text-white/65">
                          {artist.name}
                        </span>
                        <span className="mt-0.5 text-[10px] text-white/40">
                          {formatFollowers(artist.followers)} followers
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                {hasMoreArtists && (
                  <div ref={loadMoreRef} className="h-1" aria-hidden />
                )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/** Horizontal, tappable row of artist portraits — used by the Ages & Empires
 * lenses to answer "who was working here?". Renders nothing when empty. */
function ArtistRail({
  artists,
  onOpen,
}: {
  artists: Artist[];
  onOpen: (artistId: string) => void;
}) {
  const { getArtistAvatar } = useCatalog();
  if (artists.length === 0) return null;
  return (
    <div className="mt-4 flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {artists.map((artist) => (
        <button
          key={artist.id}
          onClick={() => onOpen(artist.id)}
          className="flex w-14 shrink-0 flex-col items-center gap-1.5"
        >
          <ArtistAvatar
            src={getArtistAvatar(artist.id)}
            name={artist.name}
            initials={artist.initials}
            lookup={shouldResolvePortrait(artist)}
            size={48}
            className="h-12 w-12 rounded-full border border-white/15 text-[13px] font-semibold text-white"
            fallbackClassName=""
            style={artist.accent ? { backgroundColor: artist.accent } : undefined}
          />
          <span className="line-clamp-2 text-center text-[10px] leading-tight text-white/55">
            {artist.name}
          </span>
        </button>
      ))}
    </div>
  );
}

/** Compact artwork row — thumbnail + title + meta. Used by the Ages timeline. */
function ArtworkRow({
  artwork,
  subtitle,
  onOpen,
}: {
  artwork: Artwork;
  subtitle: string;
  onOpen: (artworkId: string) => void;
}) {
  return (
    <button
      onClick={() => onOpen(artwork.id)}
      className="group flex w-full items-center gap-3 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-2 text-left transition-colors hover:border-white/20 hover:bg-white/[0.06]"
    >
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl">
        <BlurImage
          src={artwork.image}
          alt={artwork.title}
          accent={artwork.accent}
          thumbWidth={128}
        />
      </div>
      <div className="min-w-0 flex-1 pr-2">
        <p className="truncate font-serif text-[15px] text-white">
          {artwork.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-white/50">{subtitle}</p>
        <p className="mt-1 truncate text-[11px] text-white/40">{artwork.medium}</p>
      </div>
    </button>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="mt-10 text-center text-sm text-white/45">{text}</p>;
}

/** Compact follower count for the ranked artist grid — 2.1M, 184k, 840. */
function formatFollowers(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}
