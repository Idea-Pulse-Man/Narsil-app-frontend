import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import type { Artwork, Artist } from "@/data";
import { addCommunityTag } from "@/lib/tags";
import { useAppState } from "./AppState";
import { useCatalog } from "@/data/catalog";
import { ChevronDownIcon } from "./Icons";

interface HistoryPlacardProps {
  artwork: Artwork;
  artist: Artist;
  open: boolean;
  onClose: () => void;
  /** Let swipes on the dimmed area reach the feed behind (For You). */
  passThroughBackdrop?: boolean;
}

const CLOSE_OFFSET = 80;
const CLOSE_VELOCITY = 400;

/** Museum name shown in the placard — uses the artwork's credit/source field. */
function museumName(artwork: Artwork): string {
  const source = artwork.source?.trim();
  if (source) return source;
  // Legacy rows ingested before `source` was stored.
  if (/^wc-/i.test(artwork.id)) return "Wellcome Collection";
  if (/^aic-/i.test(artwork.id)) return "Art Institute of Chicago";
  return "—";
}

/** Drop redundant "From the …" lines when the museum is already listed above. */
function placardDescription(artwork: Artwork): string {
  let raw = artwork.aiDescription?.trim() || artwork.description;
  const museum = museumName(artwork);
  if (museum !== "—") {
    const escaped = museum.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    raw = raw.replace(new RegExp(`\\s*From the ${escaped}\\.?\\s*`, "gi"), " ");
  }
  // Older ingest copy that repeated the default Wellcome credit in prose.
  raw = raw.replace(/\s*From the Wellcome Collection\.?\s*$/i, " ");
  return raw.replace(/\s+/g, " ").trim();
}

export default function HistoryPlacard({
  artwork,
  artist,
  open,
  onClose,
  passThroughBackdrop = false,
}: HistoryPlacardProps) {
  const { isGuest } = useAppState();
  const { refresh } = useCatalog();
  const [tagDraft, setTagDraft] = useState("");
  const [tagBusy, setTagBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const headerDragStart = useRef<{ y: number; t: number } | null>(null);

  const displayDescription = placardDescription(artwork);

  // Fresh placard content when the feed advances to another artwork.
  useEffect(() => {
    setTagDraft("");
    scrollRef.current?.scrollTo({ top: 0 });
  }, [artwork.id]);

  const submitTag = async () => {
    const tag = tagDraft.trim();
    if (!tag || isGuest || tagBusy) return;
    setTagBusy(true);
    const { error } = await addCommunityTag(artwork.id, tag);
    setTagBusy(false);
    if (error) return;
    setTagDraft("");
    await refresh();
  };

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
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            className="pointer-events-auto absolute inset-x-0 bottom-0 z-50 flex max-h-[82%] flex-col overflow-hidden rounded-t-[28px] border-t border-white/15 bg-canvas/95 text-ink shadow-placard backdrop-blur-2xl"
          >
            {/* Top third — fixed; swipe down here closes without shifting layout */}
            <div
              className="flex-[0_0_33%] shrink-0 touch-none px-6 pb-3 pt-3"
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
              <p className="mt-3 text-[11px] text-ink/40">
                {passThroughBackdrop
                  ? "Swipe the artwork above for the next piece"
                  : "Swipe down here to close"}
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
              {artwork.aiDescription && (
                <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/40">
                  Curator note
                </p>
              )}
              <p className="mt-2 text-[15px] leading-relaxed text-ink/80">
                {displayDescription}
              </p>

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

              {!isGuest && (
                <div className="mt-4 flex gap-2">
                  <input
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void submitTag();
                      }
                    }}
                    placeholder="Add a community tag"
                    className="min-w-0 flex-1 rounded-full border border-ink/12 bg-ink/[0.03] px-3 py-2 text-sm text-ink outline-none"
                  />
                  <button
                    type="button"
                    disabled={!tagDraft.trim() || tagBusy}
                    onClick={() => void submitTag()}
                    className="rounded-full bg-ink px-4 py-2 text-xs font-medium text-canvas disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              )}

              <button
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
