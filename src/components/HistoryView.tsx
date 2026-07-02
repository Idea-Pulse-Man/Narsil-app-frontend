import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  historyEras,
  featuredArtistIds,
  artworks as curatedArtworks,
  artists as curatedArtists,
  shouldResolvePortrait,
  type Artwork,
  type Artist,
} from "@/data";
import { useCatalog } from "@/data/catalog";
import BlurImage from "./BlurImage";
import ArtistAvatar from "./ArtistAvatar";
import ArtworkTile from "./ArtworkTile";
import { screenScrollClass, screenContentClass } from "./artwork-layout";

interface HistoryViewProps {
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

export default function HistoryView({
  onOpenArtist,
  onOpenArtwork,
}: HistoryViewProps) {
  const {
    artworks: liveArtworks,
    artists: liveArtists,
    getArtwork,
    getArtist,
    getArtistAvatar,
  } = useCatalog();
  const [lens, setLens] = useState<Lens>("age");
  const [activeEmpire, setActiveEmpire] = useState<string | null>(null);

  const featured = featuredArtistIds
    .map((id) => getArtist(id))
    .filter((a): a is Artist => !!a);

  // Explore across BOTH the curated timeline and the live museum catalog, so the
  // famous set pieces always appear and the real collection fills everything in.
  const artworkPool = useMemo(
    () => mergeById(curatedArtworks, liveArtworks),
    [liveArtworks],
  );

  // ── Lens 1: Ages ── resolve the artists active in each timeline era.
  const artistsForEra = (artworkIds: string[]): Artist[] => {
    const seen = new Set<string>();
    const list: Artist[] = [];
    for (const id of artworkIds) {
      const artwork = getArtwork(id);
      if (!artwork) continue;
      const artist = getArtist(artwork.artistId);
      if (artist && !seen.has(artist.id)) {
        seen.add(artist.id);
        list.push(artist);
      }
    }
    return list;
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

  // ── Lens 3: Artists ── curated masters first (best portraits), then the live
  // catalog. Capped so we don't fire hundreds of portrait lookups at once.
  const browseArtists = useMemo(
    () =>
      mergeById(curatedArtists, liveArtists)
        .filter((a) => a.name && !/^unknown/i.test(a.name))
        .slice(0, 60),
    [liveArtists],
  );

  return (
    <div className={screenScrollClass}>
      <div className={screenContentClass}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Timeline
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
                const eraArtists = artistsForEra(era.artworkIds);
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
                      {era.artworkIds.map((id) => {
                        const artwork = getArtwork(id);
                        if (!artwork) return null;
                        const artist = getArtist(artwork.artistId);
                        return (
                          <ArtworkRow
                            key={id}
                            artwork={artwork}
                            subtitle={`${artist?.name ?? "Unknown"} · ${artwork.year}`}
                            onOpen={onOpenArtwork}
                          />
                        );
                      })}
                    </div>
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
                <div className="grid grid-cols-3 gap-x-3 gap-y-6">
                  {browseArtists.map((artist, i) => (
                    <motion.button
                      key={artist.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{
                        delay: Math.min(i * 0.02, 0.3),
                        duration: 0.3,
                      }}
                      onClick={() => onOpenArtist(artist.id)}
                      className="flex flex-col items-center gap-2"
                    >
                      <ArtistAvatar
                        src={getArtistAvatar(artist.id)}
                        name={artist.name}
                        initials={artist.initials}
                        lookup={shouldResolvePortrait(artist)}
                        className="h-20 w-20 rounded-full border border-white/15 font-serif text-lg text-white"
                        fallbackClassName=""
                        style={
                          artist.accent
                            ? { backgroundColor: artist.accent }
                            : undefined
                        }
                      />
                      <span className="line-clamp-2 text-center text-[11px] leading-tight text-white/65">
                        {artist.name}
                      </span>
                    </motion.button>
                  ))}
                </div>
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
        <BlurImage src={artwork.image} alt={artwork.title} accent={artwork.accent} />
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
