import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Artwork, Artist } from "@/data";
import { eraForArtwork, shouldResolvePortrait } from "@/data";
import { useCatalog } from "@/data/catalog";
import BlurImage from "./BlurImage";
import ArtistAvatar from "./ArtistAvatar";
import ActionRail from "./ActionRail";
import ArtDiscussion from "./ArtDiscussion";
import { artworkFooterClass } from "./artwork-layout";
import type { ToastState } from "./Toast";
import type { TutorialAction, TutorialBridge } from "./tutorial";

/** Age chip for the feed footer — same eras as Discover’s “By age” lens. */
function ageTagsFor(artwork: Artwork): string[] {
  const era = eraForArtwork(artwork);
  if (era) return [era.title];
  if (artwork.period && artwork.period !== "—") return [artwork.period];
  return [];
}

interface ArtworkCardProps {
  artwork: Artwork;
  artist: Artist;
  priority?: boolean;
  /**
   * Dual-layer Fill/Fit animation. Only the on-screen card needs this — neighbours
   * render a single image so the feed doesn't decode the same JPEG twice.
   */
  zoomable?: boolean;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
  onOpenArtist: (artistId: string) => void;
  /** Shared across the feed — stays on while swiping artworks. */
  clean: boolean;
  onCleanChange: (clean: boolean) => void;
  tutorial?: TutorialBridge;
  /** Shared feed placard — open state lives in ArtFeed. */
  placardOpen?: boolean;
  onOpenPlacard?: () => void;
}

const SWIPE_DISTANCE = 40;
const LONG_PRESS_MS = 400;
/** Match `--color-ink` so letterboxing / load flashes don't swap per-artwork accents. */
const FEED_BACKDROP = "#14100e";

export default function ArtworkCard({
  artwork,
  artist,
  priority = false,
  zoomable = true,
  showToast,
  onOpenArtist,
  clean,
  onCleanChange,
  tutorial,
  placardOpen = false,
  onOpenPlacard,
}: ArtworkCardProps) {
  const { getArtistAvatar } = useCatalog();
  const [discussionOpen, setDiscussionOpen] = useState(false);
  const [fit, setFit] = useState<"cover" | "contain">("contain");

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const footerStart = useRef<{ x: number; y: number } | null>(null);
  const capturedPointerId = useRef<number | null>(null);
  // After a horizontal swipe, ignore the synthetic click on buttons underneath.
  const suppressClick = useRef(false);
  // Ref keeps clean mode readable inside pointer handlers (avoids stale closures).
  const cleanRef = useRef(clean);
  cleanRef.current = clean;
  const fitRef = useRef(fit);
  fitRef.current = fit;
  // After restoring from fill, the next swipe-right opens the artist instead of
  // filling again — so fit → unfit → artist is a single direction on FYP.
  const readyForArtistRef = useRef(false);

  // During the tutorial, only the gesture being taught is permitted; this keeps
  // the user focused and prevents stray actions from firing out of order.
  const gestureBlocked = (action: TutorialAction) =>
    !!tutorial?.active && tutorial.allow !== action;

  // When the tutorial advances, ask cards to return to a neutral state.
  // Only react to resetToken *changes* — not mount — so infinite-scroll cards
  // don't clear the shared clean mode while the user is swiping.
  const resetToken = tutorial?.resetToken;
  const prevResetToken = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (resetToken === undefined) return;
    if (prevResetToken.current === undefined) {
      prevResetToken.current = resetToken;
      return;
    }
    if (prevResetToken.current === resetToken) return;
    prevResetToken.current = resetToken;
    setDiscussionOpen(false);
    onCleanChange(false);
    setFit("contain");
    fitRef.current = "contain";
    readyForArtistRef.current = false;
  }, [resetToken, onCleanChange]);

  const setClean = (next: boolean) => {
    cleanRef.current = next;
    onCleanChange(next);
  };

  const clearHold = () => {
    if (holdTimer.current) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  // Leaving this card (scrolled off For You) resets the fit → artist chain.
  useEffect(() => {
    if (!zoomable) readyForArtistRef.current = false;
  }, [zoomable]);

  const releasePointer = (target: EventTarget | null, pointerId: number) => {
    if (capturedPointerId.current !== pointerId) return;
    capturedPointerId.current = null;
    const node = target as HTMLElement | undefined;
    if (node?.hasPointerCapture?.(pointerId)) {
      node.releasePointerCapture(pointerId);
    }
  };

  const openPlacard = () => {
    if (gestureBlocked("placard")) return;
    onOpenPlacard?.();
    tutorial?.report("placard");
  };

  const scrollTutorial = !!tutorial?.active && tutorial.allow === "scroll";
  const placardTutorial = !!tutorial?.active && tutorial.allow === "placard";
  const actionsTutorial = !!tutorial?.active && tutorial.allow === "actions";
  const footerInteractive = !tutorial?.active || placardTutorial;
  const blockArtworkGestures = scrollTutorial || placardTutorial;
  const ageTags = ageTagsFor(artwork);

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

  const applyHorizontalSwipe = (dx: number, dy: number) => {
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx <= SWIPE_DISTANCE || adx <= ady * 1.15) return;

    if (dx < 0) {
      // swipe left → artist profile
      if (gestureBlocked("artist")) return;
      readyForArtistRef.current = false;
      suppressClick.current = true;
      onOpenArtist(artist.id);
      tutorial?.report("artist");
      return;
    }

    // Swipe right on For You: fill the frame, restore the full artwork, then
    // open the artist — so you can unfit without jumping, then continue right.
    if (fitRef.current === "cover") {
      if (tutorial?.active && tutorial.allow !== "fit") return;
      suppressClick.current = true;
      setFit("contain");
      fitRef.current = "contain";
      readyForArtistRef.current = true;
      return;
    }

    if (readyForArtistRef.current && !gestureBlocked("artist")) {
      suppressClick.current = true;
      readyForArtistRef.current = false;
      onOpenArtist(artist.id);
      tutorial?.report("artist");
      return;
    }

    if (gestureBlocked("fit")) return;
    suppressClick.current = true;
    setFit("cover");
    fitRef.current = "cover";
    readyForArtistRef.current = false;
    tutorial?.report("fit");
  };

  // Capture-phase handlers on the whole card so swipe-left works over chrome
  // (rail, title, footer), not only the artwork image layer.
  const handlePointerDown = (e: React.PointerEvent) => {
    if (placardOpen || discussionOpen) return;
    startPos.current = { x: e.clientX, y: e.clientY };
    lastPos.current = { x: e.clientX, y: e.clientY };
    longPressFired.current = false;
    clearHold();
    // Only start a long-press when UI is visible; tap-to-exit uses pointerup/click.
    if (!cleanRef.current) {
      holdTimer.current = setTimeout(() => {
        if (gestureBlocked("clean")) return;
        cleanRef.current = true;
        setClean(true);
        longPressFired.current = true;
        tutorial?.report("clean");
      }, LONG_PRESS_MS);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!startPos.current) return;
    lastPos.current = { x: e.clientX, y: e.clientY };
    const dx = e.clientX - startPos.current.x;
    const dy = e.clientY - startPos.current.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);
    if (adx > 8 || ady > 8) clearHold();
    // Lock the pointer only after the gesture is clearly horizontal so vertical
    // feed scrolling and footer swipe-up still reach their targets.
    if (
      capturedPointerId.current == null &&
      adx > 12 &&
      adx > ady * 1.15
    ) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
        capturedPointerId.current = e.pointerId;
      } catch {
        /* section may not accept capture on every target */
      }
    }
  };

  const finishPointer = (e: React.PointerEvent, cancelled: boolean) => {
    clearHold();
    const start = startPos.current;
    const end = lastPos.current ?? { x: e.clientX, y: e.clientY };
    startPos.current = null;
    lastPos.current = null;
    releasePointer(e.currentTarget, e.pointerId);

    // Release after long-press enters clean view — ignore this up; wait for a new tap.
    // Also swallow the browser's follow-up click so it doesn't instantly exit clean.
    if (longPressFired.current) {
      longPressFired.current = false;
      suppressClick.current = true;
      return;
    }

    if (!start) return;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    // Tap while in clean view → restore the normal UI (no tight time limit).
    if (!cancelled && cleanRef.current && adx < 12 && ady < 12) {
      cleanRef.current = false;
      setClean(false);
      return;
    }

    applyHorizontalSwipe(dx, dy);
  };

  const handlePointerUp = (e: React.PointerEvent) => finishPointer(e, false);

  const handlePointerCancel = (e: React.PointerEvent) => {
    // Don't leave long-press latched if the browser cancels mid-hold (e.g. image drag).
    finishPointer(e, true);
    longPressFired.current = false;
  };

  // Swallow the click after a horizontal swipe; otherwise click exits clean view
  // (reliable mouse path after long-press clean mode).
  const handleClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      suppressClick.current = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    if (cleanRef.current) {
      cleanRef.current = false;
      setClean(false);
      e.preventDefault();
      e.stopPropagation();
    }
  };

  return (
    <section
      className="relative h-full min-h-0 w-full snap-start snap-always overflow-hidden bg-ink"
      {...(blockArtworkGestures
        ? {}
        : {
            onPointerDownCapture: handlePointerDown,
            onPointerMoveCapture: handlePointerMove,
            onPointerUpCapture: handlePointerUp,
            onPointerCancelCapture: handlePointerCancel,
            onClickCapture: handleClickCapture,
          })}
    >
      <div
        className="absolute inset-0 touch-pan-y artwork-image"
        onContextMenu={(e) => e.preventDefault()}
      >
        <BlurImage
          src={artwork.image}
          alt={`${artwork.title} by ${artist.name}`}
          accent={FEED_BACKDROP}
          priority={priority}
          fit={fit}
          zoomable={zoomable}
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
                highlight={actionsTutorial}
              />
            </div>

            {/* Invisible footer — metadata + title tap target for the placard.
                Swipe up here also opens the placard; tutorial step-2 anchors on
                the title. */}
            <footer
              className={`absolute inset-x-0 bottom-0 z-30 flex flex-col justify-end ${artworkFooterClass} ${
                footerInteractive ? "pointer-events-auto" : "pointer-events-none"
              } ${placardTutorial ? "z-40" : ""}`}
              onPointerDown={handleFooterPointerDown}
              onPointerUp={handleFooterPointerUp}
              onPointerLeave={handleFooterPointerCancel}
              onPointerCancel={handleFooterPointerCancel}
            >
              <div className="pointer-events-none max-w-[90%] pr-14">
                {ageTags.length > 0 && (
                  <div className="mb-2 flex flex-wrap gap-1.5">
                    {ageTags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full border border-white/15 bg-black/35 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/80 backdrop-blur-md"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                <h2 className="font-serif text-[26px] leading-[1.14] text-white drop-shadow">
                  {/* Title opens the placard — full name is shown there. */}
                  <motion.button
                    type="button"
                    data-tutorial="placard-trigger"
                    onClick={openPlacard}
                    whileTap={{ scale: 0.98 }}
                    animate={
                      placardTutorial ? { scale: [1, 1.03, 1] } : undefined
                    }
                    transition={
                      placardTutorial
                        ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" }
                        : undefined
                    }
                    aria-label={`About ${artwork.title}`}
                    className={`pointer-events-auto -my-1 block w-full truncate py-1 text-left underline-offset-4 hover:underline ${
                      placardTutorial
                        ? "rounded-md bg-white/15 px-1.5 ring-2 ring-white/30"
                        : ""
                    }`}
                  >
                    {artwork.title}
                  </motion.button>
                </h2>

                <button
                  onClick={() => {
                    if (gestureBlocked("artist")) return;
                    onOpenArtist(artist.id);
                    tutorial?.report("artist");
                  }}
                  className="pointer-events-auto mt-2 flex max-w-full items-center gap-2 text-left text-[15px] text-white/85 transition-colors hover:text-white"
                >
                  <ArtistAvatar
                    src={getArtistAvatar(artist.id)}
                    name={artist.name}
                    initials={artist.initials}
                    lookup={shouldResolvePortrait(artist)}
                    size={24}
                    className="h-6 w-6 shrink-0 rounded-full text-[11px] font-semibold backdrop-blur-md"
                    fallbackClassName="bg-white/15 text-white"
                  />
                  {/* Wrap rather than truncate so a long name is never cut off. */}
                  <span className="line-clamp-2 underline-offset-4 hover:underline">
                    {artist.name}
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-white/45">
                    · {artwork.year}
                  </span>
                </button>
              </div>
            </footer>
          </motion.div>
        )}
      </AnimatePresence>

      <ArtDiscussion
        artwork={artwork}
        open={discussionOpen}
        onClose={() => setDiscussionOpen(false)}
      />
    </section>
  );
}
