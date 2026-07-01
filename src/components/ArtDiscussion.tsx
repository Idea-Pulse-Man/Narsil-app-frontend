import { AnimatePresence, motion } from "framer-motion";
import type { Artwork } from "@/data";
import { CommentIcon, CloseIcon } from "./Icons";

interface ArtDiscussionProps {
  artwork: Artwork;
  open: boolean;
  onClose: () => void;
}

interface MockComment {
  id: string;
  author: string;
  initials: string;
  accent: string;
  text: string;
  time: string;
}

const COMMENTS: MockComment[] = [
  {
    id: "c1",
    author: "Mara Liang",
    initials: "ML",
    accent: "#7c5cff",
    text: "The movement in this piece feels incredibly modern.",
    time: "2h",
  },
  {
    id: "c2",
    author: "Devin Okoye",
    initials: "DO",
    accent: "#e0567a",
    text: "I love how the color palette changes the mood.",
    time: "5h",
  },
  {
    id: "c3",
    author: "Sofia Reyes",
    initials: "SR",
    accent: "#2f9e74",
    text: "Does anyone know more about this period?",
    time: "1d",
  },
];

export default function ArtDiscussion({
  artwork,
  open,
  onClose,
}: ArtDiscussionProps) {
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
            className="absolute inset-0 z-40 bg-black/50"
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
              if (info.offset.y > 120 || info.velocity.y > 500) onClose();
            }}
            className="absolute inset-x-0 bottom-0 z-50 flex max-h-[80%] flex-col rounded-t-[28px] border-t border-white/10 bg-ink-soft/95 text-white shadow-placard backdrop-blur-2xl"
          >
            <div className="flex flex-col items-center pb-1 pt-3">
              <div className="h-1.5 w-11 rounded-full bg-white/15" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-6 pt-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CommentIcon className="h-[18px] w-[18px] text-white/70" />
                  <h2 className="font-serif text-lg leading-none text-white">
                    Art Discussion
                  </h2>
                </div>
                <p className="mt-1.5 truncate text-xs text-white/45">
                  {COMMENTS.length} comments ·{" "}
                  <span className="text-white/65">{artwork.title}</span>
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close discussion"
                className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Comments */}
            <div className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {COMMENTS.map((comment) => (
                <div
                  key={comment.id}
                  className="flex gap-3 rounded-2xl px-3 py-2.5"
                >
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                    style={{ backgroundColor: comment.accent }}
                  >
                    {comment.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {comment.author}
                      </span>
                      <span className="text-[11px] text-white/35">
                        {comment.time}
                      </span>
                    </div>
                    <p className="mt-1 text-[14px] leading-relaxed text-white/75">
                      {comment.text}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer — disabled mock composer */}
            <div className="border-t border-white/10 px-4 pb-7 pt-3">
              <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-2.5 pl-4 pr-2.5">
                <input
                  disabled
                  placeholder="Join the discussion…"
                  className="min-w-0 flex-1 cursor-not-allowed bg-transparent text-sm text-white placeholder:text-white/35 outline-none"
                />
                <span className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/35">
                  Post
                </span>
              </div>
              <p className="mt-2.5 text-center text-[11px] text-white/30">
                Demo conversation — comments aren&apos;t saved
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
