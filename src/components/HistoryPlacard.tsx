import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { Artwork, Artist } from "@/data";
import { isWellcomeCollection, wellcomeWorkUrl } from "@/lib/wellcome";
import { addCommunityTag } from "@/lib/tags";
import { useAppState } from "./AppState";
import { useCatalog } from "@/data/catalog";
import { ChevronDownIcon } from "./Icons";

interface HistoryPlacardProps {
  artwork: Artwork;
  artist: Artist;
  open: boolean;
  onClose: () => void;
}

const CLOSE_OFFSET = 80;
const CLOSE_VELOCITY = 400;

function CollectionField({ artwork }: { artwork: Artwork }) {
  const wellcomeUrl = wellcomeWorkUrl(artwork.id);
  const isWellcome = isWellcomeCollection(artwork.source);

  if (isWellcome && wellcomeUrl) {
    return (
      <div>
        <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">
          Collection
        </dt>
        <dd className="mt-1 text-sm text-ink/85">
          <a
            href={wellcomeUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-ink underline-offset-2 hover:underline"
          >
            Wellcome Collection
          </a>
          <p className="mt-1 text-xs leading-relaxed text-ink/55">
            A London museum of art, science, and human stories.
          </p>
        </dd>
      </div>
    );
  }

  return (
    <div>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink/45">
        Collection
      </dt>
      <dd className="mt-1 text-sm text-ink/85">{artwork.source || "—"}</dd>
    </div>
  );
}

export default function HistoryPlacard({
  artwork,
  artist,
  open,
  onClose,
}: HistoryPlacardProps) {
  const { isGuest } = useAppState();
  const { refresh } = useCatalog();
  const [tagDraft, setTagDraft] = useState("");
  const [tagBusy, setTagBusy] = useState(false);

  const displayDescription =
    artwork.aiDescription?.trim() || artwork.description;

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
            onClick={onClose}
            className="absolute inset-0 z-40 bg-black/40"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            className="absolute inset-x-0 bottom-0 z-50 flex max-h-[82%] flex-col rounded-t-[28px] border-t border-white/15 bg-canvas/95 text-ink shadow-placard backdrop-blur-2xl"
          >
            {/* Top third — drag down to close */}
            <motion.div
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.4 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > CLOSE_OFFSET || info.velocity.y > CLOSE_VELOCITY) {
                  onClose();
                }
              }}
              className="shrink-0 touch-none px-6 pb-3 pt-3"
              style={{ minHeight: "33%" }}
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
                Swipe down here to close
              </p>
            </motion.div>

            {/* Bottom two thirds — scrollable metadata */}
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-[calc(env(safe-area-inset-bottom)+2.75rem)]"
              style={{ touchAction: "pan-y" }}
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
                <CollectionField artwork={artwork} />
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
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
