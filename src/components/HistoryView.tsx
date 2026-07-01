import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  historyEras,
  featuredArtistIds,
  type Artwork,
  type Artist,
} from "@/data";
import { useCatalog } from "@/data/catalog";
import BlurImage from "./BlurImage";
import ArtistAvatar from "./ArtistAvatar";
import { screenScrollClass, screenContentClass } from "./artwork-layout";

interface HistoryViewProps {
  onOpenArtist: (artistId: string) => void;
  onOpenArtwork: (artworkId: string) => void;
}

type Organise = "age" | "artist";

/** Compact artwork row — thumbnail + title + meta. Shared by both modes. */
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

export default function HistoryView({
  onOpenArtist,
  onOpenArtwork,
}: HistoryViewProps) {
  const { getArtwork, getArtist, getArtistAvatar } = useCatalog();
  const [organise, setOrganise] = useState<Organise>("age");

  const featured = featuredArtistIds
    .map((id) => getArtist(id))
    .filter((a): a is NonNullable<typeof a> => !!a);

  // Both modes draw from the same timeline works — just organised differently.
  const artistGroups = useMemo(() => {
    const groups: { artist: Artist; artworks: Artwork[] }[] = [];
    const byId = new Map<string, { artist: Artist; artworks: Artwork[] }>();
    for (const era of historyEras) {
      for (const id of era.artworkIds) {
        const artwork = getArtwork(id);
        if (!artwork) continue;
        const artist = getArtist(artwork.artistId);
        if (!artist) continue;
        let group = byId.get(artist.id);
        if (!group) {
          group = { artist, artworks: [] };
          byId.set(artist.id, group);
          groups.push(group);
        }
        group.artworks.push(artwork);
      }
    }
    return groups;
  }, [getArtwork, getArtist]);

  return (
    <div className={screenScrollClass}>
      <div className={screenContentClass}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Timeline
        </p>
        <h1 className="mt-2 font-serif text-[28px] leading-tight text-white">
          Art History
        </h1>
        <p className="mt-2 max-w-[92%] text-[15px] leading-relaxed text-white/60">
          A learning journey through the ages — from Ancient Egypt to the dawn of
          modern art.
        </p>

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
                className="h-16 w-16 rounded-full border border-white/15 font-serif text-lg text-white"
                fallbackClassName=""
                style={artist.accent ? { backgroundColor: artist.accent } : undefined}
              />
              <span className="line-clamp-2 text-center text-[11px] leading-tight text-white/60">
                {artist.name}
              </span>
            </button>
          ))}
        </div>

        {/* Organise toggle — by art age (timeline) or by artist. */}
        <div className="mt-8 flex items-center justify-between gap-3">
          <h2 className="font-serif text-lg text-white">
            {organise === "age" ? "By period" : "By artist"}
          </h2>
          <div className="flex items-center gap-0.5 rounded-full border border-white/12 bg-white/[0.04] p-0.5">
            {(
              [
                { id: "age", label: "Art age" },
                { id: "artist", label: "Artists" },
              ] as { id: Organise; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                onClick={() => setOrganise(opt.id)}
                className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                  organise === opt.id
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
          {organise === "age" ? (
            <motion.div
              key="age"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="relative mt-5 space-y-10"
            >
              <div className="absolute bottom-0 left-[7px] top-0 w-px bg-white/10" />

              {historyEras.map((era, eraIndex) => (
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
                  <h3 className="mt-1 font-serif text-xl text-white">{era.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-white/55">
                    {era.description}
                  </p>

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
              ))}
            </motion.div>
          ) : (
            <motion.div
              key="artist"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22 }}
              className="mt-5 space-y-8"
            >
              {artistGroups.map((group, i) => (
                <motion.section
                  key={group.artist.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06, duration: 0.35 }}
                >
                  {/* Artist header — tap to open the full profile. */}
                  <button
                    onClick={() => onOpenArtist(group.artist.id)}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <ArtistAvatar
                      src={getArtistAvatar(group.artist.id)}
                      name={group.artist.name}
                      initials={group.artist.initials}
                      className="h-12 w-12 shrink-0 rounded-full border border-white/15 font-serif text-sm text-white"
                      fallbackClassName=""
                      style={group.artist.accent ? { backgroundColor: group.artist.accent } : undefined}
                    />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-serif text-lg text-white">
                        {group.artist.name}
                      </h3>
                      <p className="truncate text-[12px] text-white/45">
                        {group.artist.lifespan} · {group.artist.style}
                      </p>
                    </div>
                  </button>

                  <p className="mt-2.5 text-sm leading-relaxed text-white/55">
                    {group.artist.bio}
                  </p>

                  <div className="mt-4 space-y-3">
                    {group.artworks.map((artwork) => (
                      <ArtworkRow
                        key={artwork.id}
                        artwork={artwork}
                        subtitle={`${artwork.period} · ${artwork.year}`}
                        onOpen={onOpenArtwork}
                      />
                    ))}
                  </div>
                </motion.section>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
