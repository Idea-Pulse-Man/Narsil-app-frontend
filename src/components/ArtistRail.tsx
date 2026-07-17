import { shouldResolvePortrait, type Artist } from "@/data";
import { useCatalog } from "@/data/catalog";
import ArtistAvatar from "./ArtistAvatar";

/** Horizontal, tappable row of artist portraits — used by the Ages & Empires
 * lenses to answer "who was working here?". Renders nothing when empty. */
export default function ArtistRail({
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
