import { AnimatePresence, motion } from "framer-motion";
import type { Artwork, Artist } from "@/data";
import { ChevronDownIcon } from "./Icons";

interface HistoryPlacardProps {
  artwork: Artwork;
  artist: Artist;
  open: boolean;
  onClose: () => void;
}

export default function HistoryPlacard({
  artwork,
  artist,
  open,
  onClose,
}: HistoryPlacardProps) {
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
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 80 || info.velocity.y > 400) onClose();
            }}
            className="absolute inset-x-0 bottom-0 z-50 max-h-[82%] overflow-y-auto rounded-t-[28px] border-t border-white/15 bg-canvas/95 text-ink shadow-placard backdrop-blur-2xl"
          >
            <div className="sticky top-0 flex flex-col items-center bg-gradient-to-b from-canvas/95 to-canvas/0 pb-2 pt-3">
              <div className="h-1.5 w-11 rounded-full bg-ink/15" />
            </div>

            <div className="px-6 pb-[calc(env(safe-area-inset-bottom)+2.75rem)]">
              <div className="flex items-center gap-2">
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

              <dl className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4 border-y border-ink/10 py-5">
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
                    Collection
                  </dt>
                  <dd className="mt-1 text-sm text-ink/85">{artwork.source}</dd>
                </div>
              </dl>

              <h3 className="mt-6 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/45">
                About this work
              </h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink/80">
                {artwork.description}
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
