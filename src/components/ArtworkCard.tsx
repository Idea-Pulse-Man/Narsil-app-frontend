import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Artwork, Artist } from "@/data";
import { originLabel, shouldResolvePortrait } from "@/data";
import { useCatalog } from "@/data/catalog";
import BlurImage from "./BlurImage";
import ArtistAvatar from "./ArtistAvatar";
import ActionRail from "./ActionRail";
import HistoryPlacard from "./HistoryPlacard";
import ArtDiscussion from "./ArtDiscussion";
import { ChevronUpIcon } from "./Icons";
import { artworkFooterClass } from "./artwork-layout";
import type { ToastState } from "./Toast";
import type { TutorialAction, TutorialBridge } from "./tutorial";

interface ArtworkCardProps {
  artwork: Artwork;
  artist: Artist;
  priority?: boolean;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
  onOpenArtist: (artistId: string) => void;
  onCleanChange: (clean: boolean) => void;
  tutorial?: TutorialBridge;
}

const SWIPE_DISTANCE = 60;
const LONG_PRESS_MS = 400;
/** Feed heading shows only the first few words; the rest expands on tap. */
const TITLE_WORDS = 4;

export default function ArtworkCard({
  artwork,
  artist,
  priority = false,
  showToast,
  onOpenArtist,
  onCleanChange,
  tutorial,
}: ArtworkCardProps) {
  const { getArtistAvatar } = useCatalog();
  const [placardOpen, setPlacardOpen] = useState(false);
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [clean, setClean] = useState(false);
  const [fit, setFit] = useState<"cover" | "contain">("contain");
  const [titleExpanded, setTitleExpanded] = useState(false);

  // Split the title so the heading can show a short version with a tappable "…"
  // that reveals the rest, like a "more" toggle.
  const titleWords = artwork.title.replace(/…$/, "").trim().split(/\s+/);
  const titleTruncated = titleWords.length > TITLE_WORDS;

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const startTime = useRef(0);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const footerStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    onCleanChange(clean);
  }, [clean, onCleanChange]);

  // During the tutorial, only the gesture being taught is permitted; this keeps
  // the user focused and prevents stray actions from firing out of order.
  const gestureBlocked = (action: TutorialAction) =>
    !!tutorial?.active && tutorial.allow !== action;

  // When the tutorial advances, ask cards to return to a neutral state.
  const resetToken = tutorial?.resetToken;
  useEffect(() => {
    if (resetToken === undefined) return;
    setPlacardOpen(false);
    setDiscussionOpen(false);
    setClean(false);
    setFit("contain");
    setTitleExpanded(false);
  }, [resetToken]);

  const clearHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  const toggleFit = () => {
    setFit((prev) => (prev === "cover" ? "contain" : "cover"));
  };

  const openPlacard = () => {
    if (gestureBlocked("placard")) return;
    setPlacardOpen(true);
    tutorial?.report("placard");
  };

  const scrollTutorial = !!tutorial?.active && tutorial.allow === "scroll";
  const placardTutorial = !!tutorial?.active && tutorial.allow === "placard";
  const actionsTutorial = !!tutorial?.active && tutorial.allow === "actions";
  const footerInteractive = !tutorial?.active || placardTutorial;
  const blockArtworkGestures = scrollTutorial || placardTutorial;

  const handleFooterPointerDown = (e: React.PointerEvent) => {
    footerStart.current = { x: e.clientX, y: e.clientY };
  };

  const handleFooterPointerUp = (e: React.PointerEvent) => {
    const start = footerStart.current;
    footerStart.current = null;
    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    // Swipe up anywhere in the footer opens the placard.
    const threshold = placardTutorial ? 24 : 40;
    if (dy < -threshold && ady > adx * 1.1) {
      openPlacard();
    }
  };

  const handleFooterPointerCancel = () => {
    footerStart.current = null;
  };

  // Long-press enters a persistent "clean art" mode; a single tap restores the
  // UI. Horizontal flicks switch context (artist) or framing (fit/fill). The
  // museum placard opens from the bottom description button only.
  const handlePointerDown = (e: React.PointerEvent) => {
    if (placardOpen || discussionOpen) return;
    startPos.current = { x: e.clientX, y: e.clientY };
    startTime.current = Date.now();
    longPressFired.current = false;
    clearHold();
    if (!clean) {
      holdTimer.current = setTimeout(() => {
        if (gestureBlocked("clean")) return;
        setClean(true);
        longPressFired.current = true;
        tutorial?.report("clean");
      }, LONG_PRESS_MS);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startPos.current) return;
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    if (dx > 8 || dy > 8) clearHold();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    clearHold();
    const start = startPos.current;
    startPos.current = null;
    if (!start || longPressFired.current) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    const dt = Date.now() - startTime.current;

    // Horizontal swipe (does not conflict with the vertical snap feed).
    if (adx > SWIPE_DISTANCE && adx > ady * 1.3) {
      if (dx < 0) {
        // swipe left → artist profile
        if (gestureBlocked("artist")) return;
        onOpenArtist(artist.id);
        tutorial?.report("artist");
      } else {
        // swipe right → Fit / Fill
        if (gestureBlocked("fit")) return;
        toggleFit();
        tutorial?.report("fit");
      }
      return;
    }

    // Tap → bring the UI back when in clean mode.
    if (adx < 8 && ady < 8 && dt < 300 && clean) {
      setClean(false);
    }
  };

  const handlePointerCancel = () => {
    clearHold();
    startPos.current = null;
  };

  return (
    <section className="relative h-full min-h-0 w-full snap-start snap-always overflow-hidden bg-ink">
      {/* Artwork — no pointer handlers during scroll/placard tutorial. */}
      <div
        className="absolute inset-0 touch-pan-y"
        {...(blockArtworkGestures
          ? {}
          : {
              onPointerDown: handlePointerDown,
              onPointerMove: handlePointerMove,
              onPointerUp: handlePointerUp,
              onPointerLeave: handlePointerCancel,
              onPointerCancel: handlePointerCancel,
            })}
      >
        <BlurImage
          src={artwork.image}
          alt={`${artwork.title} by ${artist.name}`}
          accent={artwork.accent}
          priority={priority}
          fit={fit}
          zoomable
          syncToken={resetToken}
        />
      </div>

      {/* Readability gradients */}
      <AnimatePresence>
        {!clean && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="pointer-events-none absolute inset-0"
          >
            <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-black/55 to-transparent" />
            <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/80 via-black/35 to-transparent" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chrome: metadata, rail, history prompt */}
      <AnimatePresence>
        {!clean && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className={scrollTutorial ? "pointer-events-none" : undefined}
          >
            <div className={tutorial?.active ? "pointer-events-none" : undefined}>
              <ActionRail
                artist={artist}
                artworkId={artwork.id}
                artworkTitle={artwork.title}
                onOpenArtist={() => onOpenArtist(artist.id)}
                onOpenComments={() => setDiscussionOpen(true)}
                showToast={showToast}
                onHideUi={() => setClean(true)}
                highlight={actionsTutorial}
              />
            </div>

            {/* Invisible footer — structural bottom zone for metadata, the
                description trigger, and tutorial step-2 anchoring. No visible
                chrome; it only defines the interaction area at the bottom. */}
            <footer
              className={`absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end ${artworkFooterClass} ${
                footerInteractive ? "pointer-events-auto" : "pointer-events-none"
              } ${placardTutorial ? "z-40" : ""}`}
              onPointerDown={handleFooterPointerDown}
              onPointerUp={handleFooterPointerUp}
              onPointerLeave={handleFooterPointerCancel}
              onPointerCancel={handleFooterPointerCancel}
            >
              <div className="pointer-events-none max-w-[90%]">
                <h2 className="font-serif text-[26px] leading-[1.14] text-white drop-shadow">
                  {!titleTruncated ? (
                    artwork.title
                  ) : titleExpanded ? (
                    <button
                      type="button"
                      onClick={() => setTitleExpanded(false)}
                      aria-label="Collapse title"
                      className="pointer-events-auto text-left"
                    >
                      {artwork.title}
                    </button>
                  ) : (
                    <>
                      {titleWords.slice(0, TITLE_WORDS).join(" ")}
                      <button
                        type="button"
                        onClick={() => setTitleExpanded(true)}
                        aria-label="Show full title"
                        className="pointer-events-auto ml-1 align-baseline text-white/60 transition-colors hover:text-white"
                      >
                        …
                      </button>
                    </>
                  )}
                </h2>

                <motion.button
                  type="button"
                  data-tutorial="placard-trigger"
                  onClick={openPlacard}
                  whileTap={{ scale: 0.96 }}
                  animate={
                    placardTutorial ? { scale: [1, 1.04, 1] } : undefined
                  }
                  transition={
                    placardTutorial
                      ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
                      : undefined
                  }
                  className={`pointer-events-auto mt-1.5 inline-flex items-center gap-1 rounded-full border backdrop-blur-md ${
                    placardTutorial
                      ? "min-h-[40px] border-white/40 bg-white/20 px-3.5 py-1.5 text-[11px] text-white ring-2 ring-white/25"
                      : "border-white/12 bg-black/25 px-2.5 py-1 text-[10px] text-white/85"
                  } font-medium`}
                >
                  <ChevronUpIcon className="h-3 w-3" />
                  Description
                </motion.button>

                <button
                  onClick={() => {
                    if (gestureBlocked("artist")) return;
                    onOpenArtist(artist.id);
                    tutorial?.report("artist");
                  }}
                  className="pointer-events-auto mt-2 inline-flex max-w-full items-center gap-2 text-[15px] text-white/85 transition-colors hover:text-white"
                >
                  <ArtistAvatar
                    src={getArtistAvatar(artist.id)}
                    name={artist.name}
                    initials={artist.initials}
                    lookup={shouldResolvePortrait(artist)}
                    size={24}
                    className="h-6 w-6 shrink-0 rounded-full text-[10px] font-semibold backdrop-blur-md"
                    fallbackClassName="bg-white/15 text-white"
                  />
                  <span className="truncate whitespace-nowrap underline-offset-4 hover:underline">
                    {artist.name}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-white/45">
                    · {artwork.year}
                  </span>
                </button>
              </div>
            </footer>

            {/* Origin badge — bottom-left (former Narsil mark position) */}
            {!placardTutorial && (
              <span
                className={`pointer-events-none absolute bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] left-4 z-40 shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                  artwork.origin === "artist-original"
                    ? "border-sky-300/30 bg-sky-400/15 text-sky-200"
                    : "border-emerald-300/30 bg-emerald-400/15 text-emerald-200"
                }`}
              >
                {originLabel(artwork.origin)}
              </span>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <HistoryPlacard
        artwork={artwork}
        artist={artist}
        open={placardOpen}
        onClose={() => setPlacardOpen(false)}
      />

      <ArtDiscussion
        artwork={artwork}
        open={discussionOpen}
        onClose={() => setDiscussionOpen(false)}
      />
    </section>
  );
}
