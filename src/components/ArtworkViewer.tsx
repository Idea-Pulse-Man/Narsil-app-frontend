import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Artwork, Artist } from "@/data";
import { originLabel } from "@/data";
import { useAppState } from "./AppState";
import ZoomableImage, { type ZoomableImageHandle } from "./ZoomableImage";
import HistoryPlacard from "./HistoryPlacard";
import ArtDiscussion from "./ArtDiscussion";
import {
  CloseIcon,
  HeartIcon,
  BookmarkIcon,
  DownloadIcon,
  ShareIcon,
  CommentIcon,
  MinimizeIcon,
  ChevronUpIcon,
} from "./Icons";
import type { ToastState } from "./Toast";

interface ArtworkViewerProps {
  artwork: Artwork;
  artist: Artist;
  open: boolean;
  onClose: () => void;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
  /** Opens the artist's profile (title/subtitle becomes tappable when provided). */
  onOpenArtist?: (artistId: string) => void;
}

function ActionButton({
  label,
  active,
  activeColor,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  activeColor?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.85 }}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={`flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur-md transition-colors ${
        active
          ? activeColor
          : "border-white/15 bg-black/30 text-white hover:bg-black/45"
      }`}
    >
      {children}
    </motion.button>
  );
}

/**
 * Full-screen "view mode" for a single artwork: a zoomable canvas to inspect the
 * work up close, quick actions (like / save / download / share / discuss), and
 * the museum placard as a slide-up info layer. Opened from grid tiles (Saved,
 * History, Search, You) so a saved piece is something you can actually study,
 * not just read about.
 */
export default function ArtworkViewer({
  artwork,
  artist,
  open,
  onClose,
  showToast,
  onOpenArtist,
}: ArtworkViewerProps) {
  const { isLiked, toggleLiked, isSaved, toggleSaved } = useAppState();
  const zoomRef = useRef<ZoomableImageHandle>(null);

  const [chrome, setChrome] = useState(true);
  const [zoomed, setZoomed] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);

  const liked = isLiked(artwork.id);
  const saved = isSaved(artwork.id);

  // Reset transient UI each time a new artwork opens.
  useEffect(() => {
    if (open) {
      setChrome(true);
      setZoomed(false);
      setInfoOpen(false);
      setDiscussionOpen(false);
    }
  }, [open, artwork.id]);

  // Close on Escape for desktop / keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (infoOpen) setInfoOpen(false);
      else if (discussionOpen) setDiscussionOpen(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, infoOpen, discussionOpen, onClose]);

  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: artwork.title,
          text: `${artwork.title} — on Narsil`,
          url,
        });
        return;
      }
      if (typeof navigator !== "undefined" && navigator.clipboard && url) {
        await navigator.clipboard.writeText(url);
        showToast("Link copied to clipboard");
        return;
      }
      showToast("Sharing isn't available here");
    } catch {
      // User dismissed the native share sheet — no toast needed.
    }
  };

  const handleDownload = () =>
    artwork.origin === "artist-original"
      ? showToast("Download needs the artist's permission")
      : showToast(`"${artwork.title}" downloaded · public domain`);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          className="absolute inset-0 z-[60] bg-ink"
        >
          <ZoomableImage
            ref={zoomRef}
            src={artwork.image}
            alt={artwork.title}
            accent={artwork.accent}
            onTap={() => setChrome((c) => !c)}
            onZoomChange={setZoomed}
          />

          {/* Top bar — close, title, reset-zoom */}
          <AnimatePresence>
            {chrome && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 bg-gradient-to-b from-black/60 to-transparent px-3 pb-8 pt-[calc(env(safe-area-inset-top)+0.75rem)]"
              >
                <button
                  onClick={onClose}
                  aria-label="Close viewer"
                  className="pointer-events-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-md transition-colors hover:bg-black/55"
                >
                  <CloseIcon className="h-5 w-5" />
                </button>

                <button
                  type="button"
                  disabled={!onOpenArtist}
                  onClick={() => onOpenArtist?.(artist.id)}
                  className="pointer-events-auto min-w-0 flex-1 text-center"
                >
                  <p className="truncate font-serif text-[15px] leading-tight text-white">
                    {artwork.title}
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-white/60">
                    {artist.name} · {artwork.year}
                  </p>
                </button>

                <div className="flex h-10 w-10 shrink-0 items-center justify-center">
                  <AnimatePresence>
                    {zoomed && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        onClick={() => zoomRef.current?.reset()}
                        aria-label="Reset zoom"
                        className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-md transition-colors hover:bg-black/55"
                      >
                        <MinimizeIcon className="h-5 w-5" />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Origin badge */}
          <AnimatePresence>
            {chrome && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className={`absolute left-3 top-[calc(env(safe-area-inset-top)+3.6rem)] z-10 inline-block whitespace-nowrap rounded-full px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.08em] backdrop-blur-md ${
                  artwork.origin === "artist-original"
                    ? "bg-sky-400/20 text-sky-100"
                    : "bg-emerald-400/20 text-emerald-100"
                }`}
              >
                {originLabel(artwork.origin)}
              </motion.span>
            )}
          </AnimatePresence>

          {/* Bottom actions */}
          <AnimatePresence>
            {chrome && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-4 bg-gradient-to-t from-black/65 to-transparent px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-10"
              >
                <button
                  onClick={() => setInfoOpen(true)}
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/35 px-4 py-2 text-xs font-medium text-white/90 backdrop-blur-md transition-colors hover:bg-black/55"
                >
                  <ChevronUpIcon className="h-4 w-4" />
                  View details
                </button>

                <div className="flex items-center gap-3">
                  <ActionButton
                    label="Like"
                    active={liked}
                    activeColor="text-rose-500 bg-rose-500/15 border-rose-500/30"
                    onClick={() => toggleLiked(artwork.id)}
                  >
                    <HeartIcon filled={liked} className="h-5 w-5" />
                  </ActionButton>

                  <ActionButton
                    label={saved ? "Remove from saved" : "Save"}
                    active={saved}
                    activeColor="text-amber-300 bg-amber-300/15 border-amber-300/30"
                    onClick={() => {
                      toggleSaved(artwork.id);
                      showToast(
                        saved ? "Removed from saved" : "Saved to your gallery"
                      );
                    }}
                  >
                    <BookmarkIcon filled={saved} className="h-5 w-5" />
                  </ActionButton>

                  <ActionButton
                    label="Art discussion"
                    onClick={() => setDiscussionOpen(true)}
                  >
                    <CommentIcon className="h-5 w-5" />
                  </ActionButton>

                  <ActionButton label="Download" onClick={handleDownload}>
                    <DownloadIcon className="h-5 w-5" />
                  </ActionButton>

                  <ActionButton label="Share" onClick={handleShare}>
                    <ShareIcon className="h-5 w-5" />
                  </ActionButton>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <HistoryPlacard
            artwork={artwork}
            artist={artist}
            open={infoOpen}
            onClose={() => setInfoOpen(false)}
          />

          <ArtDiscussion
            artwork={artwork}
            open={discussionOpen}
            onClose={() => setDiscussionOpen(false)}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
