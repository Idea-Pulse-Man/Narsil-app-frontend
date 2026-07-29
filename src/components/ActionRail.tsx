import { useState } from "react";
import { motion } from "framer-motion";
import { shouldResolvePortrait, type Artist, type Artwork } from "@/data";
import { useCatalog } from "@/data/catalog";
import ArtistAvatar from "./ArtistAvatar";
import {
  HeartIcon,
  DownloadIcon,
  CommentIcon,
  ShareIcon,
  EyeOffIcon,
  BookmarkIcon,
} from "./Icons";
import { useAppState } from "./AppState";
import { shareArtwork } from "@/lib/download";
import DownloadSheet from "./DownloadSheet";
import type { ToastState } from "./Toast";

interface ActionRailProps {
  artist: Artist;
  artworkId: string;
  artworkTitle: string;
  /** Opens the artist profile (the rail's top button is profile-only). */
  onOpenArtist: () => void;
  onOpenComments: () => void;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
  /** Hides all on-screen UI (clean view); a tap on the artwork restores it. */
  onHideUi: () => void;
  /** Subtle highlight used while the tutorial explains the quick actions. */
  highlight?: boolean;
}

function RailButton({
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
    <div className="flex flex-col items-center gap-1.5">
      <motion.button
        whileTap={{ scale: 0.82 }}
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className={`flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/25 backdrop-blur-md transition-colors ${
          active ? activeColor : "text-white hover:bg-black/40"
        }`}
      >
        {children}
      </motion.button>
    </div>
  );
}

export default function ActionRail({
  artist,
  artworkId,
  artworkTitle,
  onOpenArtist,
  onOpenComments,
  showToast,
  onHideUi,
  highlight = false,
}: ActionRailProps) {
  const { isLiked, toggleLiked, isSaved, toggleSaved } = useAppState();
  const { getArtistAvatar, getArtwork } = useCatalog();
  // Which artwork the download sheet is open for (null = closed).
  const [downloadFor, setDownloadFor] = useState<Artwork | null>(null);

  const liked = isLiked(artworkId);
  const saved = isSaved(artworkId);

  const handleShare = () => shareArtwork(artworkId, artworkTitle, showToast);

  // Downloading now asks for a resolution first — Standard is free, High
  // Resolution is a Narsil Pro perk (see DownloadSheet).
  const handleDownload = () => {
    const artwork = getArtwork(artworkId);
    if (artwork) setDownloadFor(artwork);
  };

  return (
    <div
      className={`absolute bottom-24 right-3 flex flex-col items-center gap-4 rounded-full p-1 transition-shadow ${
        highlight
          ? "z-[85] ring-2 ring-white/60 shadow-[0_0_30px_rgba(255,255,255,0.35)]"
          : "z-40"
      }`}
    >
      {/* 1. Artist profile — tap to open the artist's profile. */}
      <div className="flex flex-col items-center gap-1.5">
        <motion.button
          whileTap={{ scale: 0.85 }}
          onClick={onOpenArtist}
          aria-label={`View ${artist.name}'s profile`}
          className="relative flex h-11 w-11 items-center justify-center rounded-full text-[13px] font-semibold tracking-wide text-white ring-1 ring-white/30 backdrop-blur-md transition-[box-shadow] hover:ring-white/60"
        >
          <ArtistAvatar
            src={getArtistAvatar(artist.id)}
            name={artist.name}
            initials={artist.initials}
            lookup={shouldResolvePortrait(artist)}
            size={44}
            className="h-full w-full rounded-full"
            fallbackClassName="bg-black/25 text-white"
          />
        </motion.button>
      </div>

      {/* 2. Like */}
      <RailButton
        label="Like"
        active={liked}
        activeColor="text-rose-500 bg-rose-500/15 border-rose-500/30"
        onClick={() => toggleLiked(artworkId)}
      >
        <motion.span
          key={liked ? "liked" : "unliked"}
          animate={liked ? { scale: [1, 1.35, 1] } : {}}
          transition={{ duration: 0.4 }}
        >
          <HeartIcon filled={liked} className="h-5 w-5" />
        </motion.span>
      </RailButton>

      {/* 3. Save / bookmark — adds the artwork to the Saved collection. */}
      <RailButton
        label={saved ? "Remove from saved" : "Save"}
        active={saved}
        activeColor="text-amber-300 bg-amber-300/15 border-amber-300/30"
        onClick={() => {
          toggleSaved(artworkId);
          showToast(saved ? "Removed from saved" : "Saved to your gallery");
        }}
      >
        <motion.span
          key={saved ? "saved" : "unsaved"}
          animate={saved ? { scale: [1, 1.3, 1] } : {}}
          transition={{ duration: 0.4 }}
        >
          <BookmarkIcon filled={saved} className="h-5 w-5" />
        </motion.span>
      </RailButton>

      {/* 4. Comments / Art Discussion */}
      <RailButton label="Art discussion" onClick={onOpenComments}>
        <CommentIcon className="h-5 w-5" />
      </RailButton>

      {/* 5. Download — public domain saves to a folder you choose;
          freelance originals need the artist's permission. */}
      <RailButton label="Download" onClick={handleDownload}>
        <DownloadIcon className="h-5 w-5" />
      </RailButton>

      {/* 6. Share */}
      <RailButton label="Share" onClick={handleShare}>
        <ShareIcon className="h-5 w-5" />
      </RailButton>

      {/* 7. Hide interface — collapses all UI for an unobstructed view.
          A single tap on the artwork brings everything back. */}
      <RailButton label="Hide interface" onClick={onHideUi}>
        <EyeOffIcon className="h-5 w-5" />
      </RailButton>

      <DownloadSheet
        artwork={downloadFor}
        onClose={() => setDownloadFor(null)}
        showToast={showToast}
      />
    </div>
  );
}
