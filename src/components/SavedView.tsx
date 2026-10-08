import { useState } from "react";
import { WORLD } from "@/data/worldCopy";
import { useCatalog } from "@/data/catalog";
import { useAppState } from "./AppState";
import { screenScrollClass, screenContentClass } from "./artwork-layout";
import { BookmarkIcon } from "./Icons";
import ArtworkTile from "./ArtworkTile";
import CanvasPurchaseSheet from "./CanvasPurchaseSheet";
import { isCanvasSellable } from "@/lib/sellability";
import type { Screen } from "./navigation";
import type { ToastState } from "./Toast";

interface SavedViewProps {
  onOpenArtwork: (artworkId: string) => void;
  onNavigate: (screen: Screen) => void;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

export default function SavedView({
  onOpenArtwork,
  onNavigate,
  showToast,
}: SavedViewProps) {
  const { saved, ready } = useAppState();
  const { getArtwork } = useCatalog();
  // The saved artwork whose canvas purchase sheet is open (null = closed).
  const [canvasId, setCanvasId] = useState<string | null>(null);

  const items = saved
    .map((id) => getArtwork(id))
    .filter((a): a is NonNullable<typeof a> => !!a);

  const canvasArtwork = canvasId ? getArtwork(canvasId) ?? null : null;

  return (
    <div className={screenScrollClass}>
      <div className={screenContentClass}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Collection
        </p>
        <h1 className="mt-2 font-serif text-[28px] leading-tight text-white">
          {WORLD.vault}
        </h1>

        {ready && items.length === 0 ? (
          <div className="mt-16 flex flex-col items-center text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-full border border-white/12 bg-white/5 text-white/50">
              <BookmarkIcon className="h-7 w-7" />
            </span>
            <h2 className="mt-5 max-w-[18rem] font-serif text-xl text-white">
              {WORLD.vaultEmpty}
            </h2>
            <button
              onClick={() => onNavigate("for-you")}
              className="mt-6 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-ink transition-transform active:scale-95"
            >
              Discover the archives
            </button>
          </div>
        ) : (
          <div className="mt-7 grid grid-cols-2 gap-3">
            {items.map((art, i) => (
              <ArtworkTile
                key={art.id}
                artwork={art}
                index={i}
                onOpen={onOpenArtwork}
                onOrderCanvas={
                  isCanvasSellable(art) ? setCanvasId : undefined
                }
              />
            ))}
          </div>
        )}

        {ready && items.length > 0 && (
          <p className="mt-5 text-center text-[11px] text-white/50">
            {items.length} piece{items.length === 1 ? "" : "s"} in the vault
          </p>
        )}
      </div>

      <CanvasPurchaseSheet
        artwork={canvasArtwork}
        onClose={() => setCanvasId(null)}
        showToast={showToast}
      />
    </div>
  );
}
