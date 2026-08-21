import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Artwork, Artist } from "@/data";
import { originLabel, shouldResolvePortrait } from "@/data";
import { useCatalog } from "@/data/catalog";
import BlurImage from "./BlurImage";
import ArtistAvatar from "./ArtistAvatar";
import ActionRail from "./ActionRail";
import ArtDiscussion from "./ArtDiscussion";
import { ChevronUpIcon } from "./Icons";
import { artworkFooterClass } from "./artwork-layout";
import type { ToastState } from "./Toast";
import type { TutorialAction, TutorialBridge } from "./tutorial";

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
  const [titleExpanded, setTitleExpanded] = useState(false);
  // True only when the full title is wider than one line — then tap expands.
  const [titleOverflows, setTitleOverflows] = useState(false);
  const titleRef = useRef<HTMLElement | null>(null);

  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const startPos = useRef<{ x: number; y: number } | null>(null);
  const footerStart = useRef<{ x: number; y: number } | null>(null);
  // After a horizontal swipe, ignore the synthetic click on buttons underneath.
  const suppressClick = useRef(false);
  // Ref keeps clean mode readable inside pointer handlers (avoids stale closures).
  const cleanRef = useRef(clean);
  cleanRef.current = clean;

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
    setTitleExpanded(false);
  }, [resetToken, onCleanChange]);

  // Measure real overflow so short titles stay fully visible on one line.
  // The title node swaps between <span> and <button> as `titleOverflows` flips,
  // so re-run on that change to observe the element that's actually mounted.
  // Ignore callbacks fired for a detached old node — it reports 0×0 and would
  // otherwise clear the flag right after we set it, reverting to a dead span.
  useEffect(() => {
    if (titleExpanded) return;
    const el = titleRef.current;
    if (!el) return;
    const check = () => {
      if (!el.isConnected) return;
      setTitleOverflows(el.scrollWidth > el.clientWidth + 1);
    };
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [artwork.title, titleExpanded, titleOverflows]);

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

  const toggleFit = () => {
    setFit((prev) => (prev === "cover" ? "contain" : "cover"));
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

  // Capture-phase handlers on the whole card so swipe-left works over chrome
  // (rail, title, footer), not only the artwork image layer.
  const handlePointerDown = (e: React.PointerEvent) => {
    if (placardOpen || discussionOpen) return;
    startPos.current = { x: e.clientX, y: e.clientY };
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
    const dx = Math.abs(e.clientX - startPos.current.x);
    const dy = Math.abs(e.clientY - startPos.current.y);
    if (dx > 8 || dy > 8) clearHold();
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    clearHold();
    const start = startPos.current;
    startPos.current = null;

    // Release after long-press enters clean view — ignore this up; wait for a new tap.
    // Also swallow the browser's follow-up click so it doesn't instantly exit clean.
    if (longPressFired.current) {
      longPressFired.current = false;
      suppressClick.current = true;
      return;
    }

    if (!start) return;

    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    // Tap while in clean view → restore the normal UI (no tight time limit).
    if (cleanRef.current && adx < 12 && ady < 12) {
      cleanRef.current = false;
      setClean(false);
      return;
    }

    // Horizontal swipe — still requires clear sideways motion vs vertical scroll.
    if (adx > SWIPE_DISTANCE && adx > ady * 1.15) {
      if (dx < 0) {
        // swipe left → artist profile
        if (gestureBlocked("artist")) return;
        suppressClick.current = true;
        onOpenArtist(artist.id);
        tutorial?.report("artist");
      } else {
        // swipe right → Fit / Fill
        if (gestureBlocked("fit")) return;
        suppressClick.current = true;
        toggleFit();
        tutorial?.report("fit");
      }
    }
  };

  const handlePointerCancel = () => {
    clearHold();
    startPos.current = null;
    // Don't leave long-press latched if the browser cancels mid-hold (e.g. image drag).
    longPressFired.current = false;
  };

  // Swallow the click after a horizontal swipe; otherwise click exits clean view
  // (reliable mouse path, and blocks fading Eye-off from turning clean back on).
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
      <div className="absolute inset-0 touch-pan-y">
        <BlurImage
          src={artwork.image}
          alt={`${artwork.title} by ${artist.name}`}
          accent={artwork.accent}
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
                onHideUi={() => {
                  cleanRef.current = true;
                  setClean(true);
                }}
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
                  {/* Show full title on one line; expand only if it truly overflows. */}
                  {titleOverflows || titleExpanded ? (
                    <button
                      type="button"
                      ref={(node) => {
                        titleRef.current = node;
                      }}
                      onClick={() => setTitleExpanded((open) => !open)}
                      aria-expanded={titleExpanded}
                      aria-label={
                        titleExpanded ? "Collapse title" : "Show full title"
                      }
                      className={`pointer-events-auto -my-1 w-full py-1 text-left ${
                        titleExpanded ? "whitespace-normal" : "block truncate"
                      }`}
                    >
                      {artwork.title}
                    </button>
                  ) : (
                    <span
                      ref={(node) => {
                        titleRef.current = node;
                      }}
                      className="block truncate"
                    >
                      {artwork.title}
                    </span>
                  )}
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
                    className="h-6 w-6 shrink-0 rounded-full text-[10px] font-semibold backdrop-blur-md"
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

              {/* Description + origin tag side by side */}
              <div className="mt-2.5 flex w-full items-center gap-2 pr-14">
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
                  className={`pointer-events-auto inline-flex shrink-0 items-center gap-1 rounded-full border backdrop-blur-md ${
                    placardTutorial
                      ? "min-h-[40px] border-white/40 bg-white/20 px-3.5 py-1.5 text-[11px] text-white ring-2 ring-white/25"
                      : "border-white/12 bg-black/25 px-2.5 py-1 text-[10px] text-white/85"
                  } font-medium`}
                >
                  <ChevronUpIcon className="h-3 w-3" />
                  Description
                </motion.button>

                {!placardTutorial && (
                  <span
                    className={`pointer-events-none shrink-0 whitespace-nowrap rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                      artwork.origin === "artist-original"
                        ? "border-sky-300/30 bg-sky-400/15 text-sky-200"
                        : "border-emerald-300/30 bg-emerald-400/15 text-emerald-200"
                    }`}
                  >
                    {originLabel(artwork.origin)}
                  </span>
                )}
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
