import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { Artwork, Artist } from "@/data";
import { ChevronDownIcon } from "./Icons";

interface HistoryPlacardProps {
  artwork: Artwork;
  artist: Artist;
  open: boolean;
  onClose: () => void;
  /**
   * For You feed: dimmed area stays pass-through so swipe up/down still
   * changes artworks (iOS-safe). Outside taps still close via capture listeners.
   */
  passThroughBackdrop?: boolean;
}

const CLOSE_OFFSET = 80;
const CLOSE_VELOCITY = 400;
/** Max movement (px) still counted as a tap — keeps feed swipes working on iOS. */
const OUTSIDE_TAP_SLOP = 12;

/** Museum name shown in the placard — the artwork's holding institution. */
function museumName(artwork: Artwork): string {
  const source = artwork.source?.trim();
  if (source) return source;
  // Legacy rows ingested before `source` was stored.
  if (/^wc-/i.test(artwork.id)) return "Wellcome Collection";
  if (/^aic-/i.test(artwork.id)) return "The Art Institute of Chicago";
  if (/^met-/i.test(artwork.id)) return "The Met";
  if (/^cma-/i.test(artwork.id)) return "The Cleveland Museum of Art";
  if (/^rijks-/i.test(artwork.id)) return "The Rijksmuseum";
  return "—";
}

/** Build short placard prose from fields when catalog copy is missing. */
function composeFromFields(artwork: Artwork, artist: Artist): string {
  const medium = artwork.medium && artwork.medium !== "—" ? artwork.medium : "";
  const year = artwork.year && artwork.year !== "Date unknown" ? artwork.year : "";
  const artistName =
    artist.name && !/^unknown/i.test(artist.name) ? artist.name : "";
  let lead = medium ? medium.charAt(0).toUpperCase() + medium.slice(1) : "";
  if (artistName) lead = lead ? `${lead} by ${artistName}` : `A work by ${artistName}`;
  if (lead && year) lead += `, ${year}`;
  return lead ? `${lead}.` : "";
}

/**
 * Prefer AI curator copy, then museum description. When those are empty or only
 * repeat the metadata grid / museum credit, compose readable wall text so the
 * placard always has an About this work paragraph (AI can replace it later).
 */
function placardDescription(artwork: Artwork, artist: Artist): string {
  let raw = artwork.aiDescription?.trim() || artwork.description?.trim() || "";

  const museum = museumName(artwork);
  if (museum !== "—") {
    const escaped = museum.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    raw = raw.replace(new RegExp(`\\s*From the ${escaped}\\.?\\s*`, "gi"), " ");
  }
  // Older ingest copy that repeated the default Wellcome credit in prose.
  raw = raw.replace(/\s*From the Wellcome Collection\.?\s*$/i, " ");
  raw = raw.replace(/\s+/g, " ").trim();

  // Empty, credit-only, or legacy field dump ("Artist · medium · 1858").
  const needsCompose =
    !artwork.aiDescription?.trim() && (!raw || raw.includes(" · "));
  if (needsCompose) {
    const composed = composeFromFields(artwork, artist);
    if (composed) return composed;
  }

  return raw || composeFromFields(artwork, artist);
}

/** Above this length the description clamps to a few lines behind "Read more". */
const CLAMP_THRESHOLD = 260;

export default function HistoryPlacard({
  artwork,
  artist,
  open,
  onClose,
  passThroughBackdrop = false,
}: HistoryPlacardProps) {
  const [descExpanded, setDescExpanded] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const headerDragStart = useRef<{ y: number; t: number } | null>(null);

  const displayDescription = placardDescription(artwork, artist);
  const descClamps = displayDescription.length > CLAMP_THRESHOLD;

  // Fresh placard content when the feed advances to another artwork.
  useEffect(() => {
    setDescExpanded(false);
    scrollRef.current?.scrollTo({ top: 0 });
  }, [artwork.id]);

  // For You: backdrop stays pointer-events-none so vertical swipes keep
  // scrolling the feed (works on iOS WKWebView). Detect a true tap outside
  // the sheet in the capture phase and close — swipes exceed the slop and
  // are ignored here.
  useEffect(() => {
    if (!open || !passThroughBackdrop) return;

    let start: { x: number; y: number } | null = null;
    let tracking = false;

    const isOutsideSheet = (target: EventTarget | null) => {
      const sheet = sheetRef.current;
      if (!sheet || !(target instanceof Node)) return true;
      return !sheet.contains(target);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (!isOutsideSheet(e.target)) {
        tracking = false;
        start = null;
        return;
      }
      tracking = true;
      start = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!tracking || !start) return;
      tracking = false;
      const dx = Math.abs(e.clientX - start.x);
      const dy = Math.abs(e.clientY - start.y);
      start = null;
      if (dx <= OUTSIDE_TAP_SLOP && dy <= OUTSIDE_TAP_SLOP) {
        onClose();
      }
    };

    const onPointerCancel = () => {
      tracking = false;
      start = null;
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerCancel, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerCancel, true);
    };
  }, [open, passThroughBackdrop, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={passThroughBackdrop ? undefined : onClose}
            className={`absolute inset-0 z-40 bg-black/40 ${
              passThroughBackdrop ? "pointer-events-none" : ""
            }`}
          />
          <motion.div
            ref={sheetRef}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            className="pointer-events-auto absolute inset-x-0 bottom-0 z-50 flex max-h-[82%] flex-col overflow-hidden rounded-t-[28px] border-t border-white/15 bg-canvas/95 text-ink shadow-placard backdrop-blur-2xl"
          >
            {/* Header — swipe down here closes without shifting layout */}
            <div
              className="shrink-0 touch-none px-6 pb-3 pt-3"
              onPointerDown={(e) => {
                headerDragStart.current = { y: e.clientY, t: Date.now() };
              }}
              onPointerUp={(e) => {
                const start = headerDragStart.current;
                headerDragStart.current = null;
                if (!start) return;
                const dy = e.clientY - start.y;
                const dt = Date.now() - start.t;
                const velocity = dy / Math.max(dt, 1);
                if (dy > CLOSE_OFFSET || velocity > CLOSE_VELOCITY / 1000) {
                  onClose();
                }
              }}
              onPointerCancel={() => {
                headerDragStart.current = null;
              }}
            >
              <div className="flex flex-col items-center">
                <div className="h-1.5 w-11 rounded-full bg-ink/15" />
              </div>

              <div className="mt-4 flex items-center gap-2">
                <span className="rounded-full bg-ink/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink/55">
                  Museum Placard
                </span>
              </div>

              <h2 className="mt-4 font-serif text-[26px] leading-tight text-ink">
                {artwork.title}
              </h2>
              <p className="mt-1 text-[15px] text-ink/70">
                {artist.name} · {artwork.year}
              </p>
            </div>

            {/* Bottom two thirds — scrollable metadata */}
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-[calc(env(safe-area-inset-bottom)+2.75rem)]"
              style={{ touchAction: "pan-y" }}
            >
              <motion.div
                key={artwork.id}
                initial={{ opacity: 0.4 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-y border-ink/10 py-5">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                    Medium
                  </dt>
                  <dd className="mt-1 text-sm text-ink/85">{artwork.medium}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                    Date
                  </dt>
                  <dd className="mt-1 text-sm text-ink/85">{artwork.year}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                    Artist
                  </dt>
                  <dd className="mt-1 text-sm text-ink/85">{artist.name}</dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                    Museum
                  </dt>
                  <dd className="mt-1 text-sm text-ink/85">{museumName(artwork)}</dd>
                </div>
              </dl>

              <h3 className="mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                About this work
              </h3>
              {artwork.aiDescription?.trim() ? (
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/40">
                  Curator note
                </p>
              ) : null}
              <p
                className={`mt-2 text-[15px] leading-relaxed text-ink/80 ${
                  descClamps && !descExpanded ? "line-clamp-4" : ""
                }`}
              >
                {displayDescription ||
                  "No description yet — AI curator copy will appear here."}
              </p>
              {descClamps && (
                <button
                  type="button"
                  onClick={() => setDescExpanded((open) => !open)}
                  className="mt-1.5 text-[13px] font-medium text-ink/55 underline-offset-2 hover:text-ink/80 hover:underline"
                >
                  {descExpanded ? "Show less" : "Read more"}
                </button>
              )}

              {artwork.tags.length > 0 && (
                <div className="mt-6 flex flex-wrap gap-2">
                  {artwork.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-ink/12 bg-ink/[0.04] px-3 py-1.5 text-xs font-medium text-ink/70"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                className="mt-8 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3.5 text-sm font-medium text-canvas transition-transform active:scale-[0.98]"
              >
                <ChevronDownIcon className="h-4 w-4" />
                Close placard
              </button>
              </motion.div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
