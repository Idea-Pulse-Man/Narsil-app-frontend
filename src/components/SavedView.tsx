import { useCatalog } from "@/data/catalog";
import { useAppState } from "./AppState";
import { screenScrollClass, screenContentClass } from "./artwork-layout";
import { BookmarkIcon } from "./Icons";
import ArtworkTile from "./ArtworkTile";
import type { Screen } from "./navigation";

interface SavedViewProps {
  onOpenArtwork: (artworkId: string) => void;
  onNavigate: (screen: Screen) => void;
}

export default function SavedView({ onOpenArtwork, onNavigate }: SavedViewProps) {
  const { saved, ready } = useAppState();
  const { getArtwork } = useCatalog();
  const items = saved
    .map((id) => getArtwork(id))
    .filter((a): a is NonNullable<typeof a> => !!a);

  return (
    <div className={screenScrollClass}>
      <div className={screenContentClass}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Collection
        </p>
        <h1 className="mt-2 font-serif text-[28px] leading-tight text-white">
          Saved
        </h1>
        <p className="mt-2 max-w-[92%] text-[15px] leading-relaxed text-white/60">
          Artworks you bookmark in the feed are kept here on this device.
        </p>

        {ready && items.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/12 bg-white/5 text-white/40">
              <BookmarkIcon className="h-7 w-7" />
            </span>
            <h2 className="mt-5 font-serif text-xl text-white">
              Nothing saved yet
            </h2>
            <p className="mt-2 max-w-[16rem] text-sm leading-relaxed text-white/50">
              Tap the bookmark on any artwork to start building your private
              gallery.
            </p>
            <button
              onClick={() => onNavigate("for-you")}
              className="mt-6 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-transform active:scale-95"
            >
              Explore the feed
            </button>
          </div>
        ) : (
          <div className="mt-7 grid grid-cols-3 gap-2">
            {items.map((art, i) => (
              <ArtworkTile
                key={art.id}
                artwork={art}
                index={i}
                onOpen={onOpenArtwork}
              />
            ))}
          </div>
        )}

        {ready && items.length > 0 && (
          <p className="mt-5 text-center text-[11px] text-white/35">
            {items.length} saved{items.length === 1 ? " artwork" : " artworks"}
          </p>
        )}
      </div>
    </div>
  );
}
