import { AnimatePresence, motion } from "framer-motion";
import type { HistoryEra } from "@/data/history";
import { useCatalog } from "@/data/catalog";
import ArtworkRow from "./ArtworkRow";
import ArtistRail from "./ArtistRail";
import { ArrowLeftIcon } from "./Icons";
import { useEraWorks, useArtistsForWorks } from "./era-works";

interface EraScreenProps {
  era: HistoryEra | null;
  onClose: () => void;
  onOpenArtwork: (artworkId: string) => void;
  onOpenArtist: (artistId: string) => void;
}

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
}: EraScreenProps) {
  const eraWorks = useEraWorks();
  const artistsForWorks = useArtistsForWorks();
  const { getArtist } = useCatalog();

  const works = era ? (eraWorks.get(era.id) ?? []) : [];
  const artists = artistsForWorks(works);

  return (
    <AnimatePresence>
      {era && (
        <motion.div
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
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition-colors hover:bg-white/10"
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
            <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-300/80">
              {era.years}
            </p>
            <h1 className="mt-1 font-serif text-[28px] leading-tight text-white">
              {era.title}
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/55">
              {era.description}
            </p>

            <ArtistRail artists={artists} onOpen={onOpenArtist} />

            <div className="mt-5 space-y-3">
              {works.map((artwork) => {
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
