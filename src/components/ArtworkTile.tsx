import { motion } from "framer-motion";
import type { Artwork } from "@/data";
import { originLabel } from "@/data";
import { useCatalog } from "@/data/catalog";
import BlurImage from "./BlurImage";
import { BookmarkIcon } from "./Icons";
import { useAppState } from "./AppState";

interface ArtworkTileProps {
  artwork: Artwork;
  onOpen?: (artworkId: string) => void;
  /** Show the quick-save bookmark overlay. */
  showSave?: boolean;
  index?: number;
}

export default function ArtworkTile({
  artwork,
  onOpen,
  showSave = true,
  index = 0,
}: ArtworkTileProps) {
  const { getArtist } = useCatalog();
  const artist = getArtist(artwork.artistId);
  const { isSaved, toggleSaved } = useAppState();
  const saved = isSaved(artwork.id);

  return (
    <motion.article
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.3 }}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03]"
    >
      <button
        onClick={() => onOpen?.(artwork.id)}
        className="block w-full text-left"
        aria-label={`Open ${artwork.title}`}
      >
        <div className="aspect-[3/4] w-full">
          <BlurImage
            src={artwork.image}
            alt={artwork.title}
            accent={artwork.accent}
            className="transition-transform duration-500 group-hover:scale-105"
          />
        </div>
        <div className="p-3">
          <p className="truncate font-serif text-sm text-white">
            {artwork.title}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-white/45">
            {artist?.name} · {artwork.year}
          </p>
          <span
            className={`mt-2 inline-block rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.1em] ${
              artwork.origin === "artist-original"
                ? "bg-sky-400/15 text-sky-200"
                : "bg-emerald-400/15 text-emerald-200"
            }`}
          >
            {originLabel(artwork.origin)}
          </span>
        </div>
      </button>

      {showSave && (
        <button
          onClick={() => toggleSaved(artwork.id)}
          aria-label={saved ? "Remove from saved" : "Save artwork"}
          aria-pressed={saved}
          className={`absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full border backdrop-blur-md transition-colors ${
            saved
              ? "border-amber-300/40 bg-amber-300/20 text-amber-300"
              : "border-white/15 bg-black/35 text-white hover:bg-black/50"
          }`}
        >
          <BookmarkIcon filled={saved} className="h-4 w-4" />
        </button>
      )}
    </motion.article>
  );
}
