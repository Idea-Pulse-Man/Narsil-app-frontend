import type { Artwork } from "@/data";
import BlurImage from "./BlurImage";

/** Compact artwork row — thumbnail + title + meta. Used by the Ages timeline
 * and the full-screen era list. */
export default function ArtworkRow({
  artwork,
  subtitle,
  onOpen,
  priority = false,
}: {
  artwork: Artwork;
  subtitle: string;
  onOpen: (artworkId: string) => void;
  priority?: boolean;
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
          thumbWidth={80}
          priority={priority}
        />
      </div>
      <div className="min-w-0 flex-1 pr-2">
        <p className="truncate font-serif text-[15px] text-white">
          {artwork.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-white/50">{subtitle}</p>
        <p className="mt-1 truncate text-[11px] text-white/50">
          {artwork.medium}
        </p>
      </div>
    </button>
  );
}
