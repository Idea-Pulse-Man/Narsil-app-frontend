import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  historyEras,
  featuredArtistIds,
  artworks as curatedArtworks,
  shouldResolvePortrait,
  type Artwork,
  type Artist,
} from "@/data";
import { useCatalog } from "@/data/catalog";
import { sizedAvatarUrl } from "@/lib/imageUrl";
import ArtistAvatar from "./ArtistAvatar";
import ArtworkTile from "./ArtworkTile";
import ArtworkRow from "./ArtworkRow";
import DailyQuizCard from "./DailyQuizCard";
import ArtistRail from "./ArtistRail";
import { ArrowRightIcon } from "./Icons";
import { screenScrollClass, screenContentClass } from "./artwork-layout";
import { useEraWorks, useArtistsForWorks } from "./era-works";
import { useInfiniteScroll } from "./useInfiniteScroll";

interface DiscoverViewProps {
  onOpenArtist: (artistId: string) => void;
  onOpenArtwork: (artworkId: string) => void;
  onOpenEra: (eraId: string) => void;
  onOpenQuiz: () => void;
  /** Bumped when the quiz overlay closes so the card re-reads its streak. */
  quizRefresh: number;
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

/**
 * Works previewed per era on the timeline. The rest live on the era's own
 * screen — keeping the preview short is what stops one long age from burying
 * the ages after it.
 */
const ERA_PREVIEW = 2;

export default function DiscoverView({
  onOpenArtist,
  onOpenArtwork,
  onOpenEra,
  onOpenQuiz,
  quizRefresh,
}: DiscoverViewProps) {
  const {
    artworks: liveArtworks,
    artists: liveArtists,
    getArtist,
    getArtistAvatar,
  } = useCatalog();
  const [lens, setLens] = useState<Lens>("age");
  const [activeEmpire, setActiveEmpire] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

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

  // Explore across BOTH the curated timeline and the live museum catalog, so the
  // famous set pieces always appear and the real collection fills everything in.
  const artworkPool = useMemo(
    () => mergeById(curatedArtworks, liveArtworks),
    [liveArtworks],
  );

  // ── Lens 1: Ages ── shared with the era screen so both agree on what an
  // age contains.
  const eraWorks = useEraWorks();
  const artistsForWorks = useArtistsForWorks();

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
  // popularity. Real engagement on their works (likes + saves from Supabase)
  // counts heavily — one like ≈ 1k of the mock profile followers — but blends
  // into a single score with followers so the grid still reads as sorted by
  // the follower counts it displays. Anonymous/"Unknown" makers and garbled
  // catalog names ("? a lithograph", "a painting", "[N") are skipped.
  // No cap — the grid pages in via infinite scroll.
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
    const popularity = (artist: Artist) =>
      artist.followers + 1_000 * (engagement.get(artist.id) ?? 0);

    const list: Artist[] = [];
    const seen = new Set<string>();
    const push = (artist: Artist | undefined) => {
      if (!artist || seen.has(artist.id)) return;
      if (!artist.name || /^unknown/i.test(artist.name)) return;
      if (!/^\p{L}/u.test(artist.name)) return;
      if (/^(a|an|the)\s/i.test(artist.name)) return;
      seen.add(artist.id);
      list.push(artist);
    };
    for (const id of featuredArtistIds) push(getArtist(id));
    for (const artist of liveArtists) push(artist);
    return list.sort((a, b) => popularity(b) - popularity(a));
  }, [liveArtworks, liveArtists, getArtist]);

  // Page the ranked grid in as the user scrolls (resets on lens switch).
  const {
    visible: shownArtists,
    sentinelRef,
    hasMore: hasMoreArtists,
  } = useInfiniteScroll(browseArtists, {
    pageSize: ARTIST_PAGE,
    resetKey: lens,
    rootRef: scrollRef,
  });

  return (
    <div ref={scrollRef} className={screenScrollClass}>
      <div className={screenContentClass}>
        {/* No eyebrow label here — the active "Discover" tab above already
            names the screen, so the title carries it alone. */}
        <h1 className="font-serif text-[32px] leading-tight text-white">
          Art History
        </h1>

        {/* Daily quiz — a Duolingo-style retention hook at the top of Discover */}
        <DailyQuizCard onStart={onOpenQuiz} refreshKey={quizRefresh} />

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
                    ? "bg-accent text-ink"
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
                const rest = works.length - ERA_PREVIEW;
                return (
                  <motion.section
                    key={era.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: eraIndex * 0.06, duration: 0.35 }}
                    className="relative pl-7"
                  >
                    <div className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-accent/50 bg-ink ring-4 ring-ink" />

                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-accent">
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
                      {works.slice(0, ERA_PREVIEW).map((artwork) => {
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

                    {/* The rest of the age lives on its own screen — a long
                        age would otherwise bury the ages after it. */}
                    {rest > 0 && (
                      <button
                        type="button"
                        onClick={() => onOpenEra(era.id)}
                        className="mt-3 flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[11px] font-medium text-white/70 transition-colors hover:border-white/25 hover:text-white"
                      >
                        See all {works.length} works
                        <ArrowRightIcon className="h-3 w-3" />
                      </button>
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
                              ? "bg-accent text-ink"
                              : "border border-white/15 bg-white/5 text-white/70 hover:text-white"
                          }`}
                        >
                          {group.empire}
                          <span
                            className={`ml-1.5 ${active ? "text-ink/55" : "text-white/35"}`}
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
                  <div ref={sentinelRef} className="h-1" aria-hidden />
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
