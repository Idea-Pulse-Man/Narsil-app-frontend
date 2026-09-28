import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { levelTitle } from "@/lib/quiz";
import type { LevelBoard } from "@/lib/quizRemote";
import { scrollPalette } from "@/lib/quiz/scrolls";
import { BoardRows } from "./QuizRanking";

const FRAME_SRC = "/quiz-scrolls/hall-frame.png";
/** Native size of the frame art (an iPhone Pro Max screen). */
const FRAME_W = 1284;
const FRAME_H = 2778;

/*
 * Clear areas inside the frame art, as % of the frame box. Measured from the
 * PNG's alpha: the ribbon tails narrow the top, a leaning sword narrows the
 * bottom, so the wide middle band holds the rows.
 */
const TITLE_ZONE = { left: "29%", right: "29%", top: "17.4%", bottom: "77.4%" };
const ROWS_ZONE = { left: "22.5%", right: "22.5%", top: "23.4%", bottom: "46.3%" };
const FOOT_ZONE = { left: "29.5%", right: "29.5%", top: "55%", bottom: "28.9%" };

interface HallScreenProps {
  open: boolean;
  levelId: number;
  board: LevelBoard | null;
  onClose: () => void;
}

/** Full-screen Hall: today's same-level ranking inside the royal frame art. */
export default function HallScreen({ open, levelId, board, onClose }: HallScreenProps) {
  const title = levelTitle(levelId);
  const { heading, muted, label, box, body } = scrollPalette("light");
  const rowsRef = useRef<HTMLDivElement>(null);
  const rows = board?.rows ?? [];

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // Bring your own row into view when you are deep in the list. Scroll the
    // list itself — scrollIntoView would also nudge the overlay on iOS.
    const list = rowsRef.current;
    const you = list?.querySelector<HTMLElement>("[data-you]");
    if (list && you) {
      list.scrollTop = you.offsetTop - list.clientHeight / 2 + you.offsetHeight / 2;
    }
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="absolute inset-0 z-10 flex items-center justify-center bg-[#120c08] [container-type:size]"
          role="dialog"
          aria-label={`Hall of ${title}s`}
        >
          <div
            className="@container relative"
            style={{
              width: `min(100cqw, calc(100cqh * ${FRAME_W} / ${FRAME_H}))`,
              aspectRatio: `${FRAME_W} / ${FRAME_H}`,
            }}
          >
            <div
              aria-hidden
              className="absolute inset-[12%_18%] rounded-[40%] bg-[radial-gradient(ellipse_at_50%_40%,#2e2014_0%,#120c08_75%)]"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={FRAME_SRC}
              alt=""
              draggable={false}
              className="pointer-events-none absolute inset-0 h-full w-full select-none"
            />

            <div
              className="absolute flex flex-col items-center justify-center text-center"
              style={TITLE_ZONE}
            >
              <h2 className={`font-serif text-[4.6cqw] leading-tight ${heading}`}>
                Hall of {title}s
              </h2>
              <p className={`text-[2.9cqw] ${label}`}>Today · same level only</p>
            </div>

            <div
              ref={rowsRef}
              className="absolute overflow-y-auto overscroll-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              style={ROWS_ZONE}
            >
              {rows.length > 0 ? (
                <BoardRows rows={rows} ink="light" levelId={levelId} dense />
              ) : (
                <p className={`mt-6 rounded-xl border px-3 py-3 text-center text-sm ${box} ${body}`}>
                  The Hall is quiet. Finish today&apos;s assessment to take a
                  place among {title}s.
                </p>
              )}
            </div>

            <div className="absolute flex flex-col items-center text-center" style={FOOT_ZONE}>
              {board?.rank != null ? (
                <>
                  <p className={`text-[2.7cqw] font-semibold uppercase tracking-[0.18em] ${label}`}>
                    Your place
                  </p>
                  <p className={`mt-0.5 font-serif text-[5.4cqw] leading-tight ${heading}`}>
                    #{board.rank}
                  </p>
                  {board.points != null && (
                    <p className={`text-[3cqw] tabular-nums ${muted}`}>
                      {board.points.toLocaleString()} pts
                    </p>
                  )}
                </>
              ) : (
                <p className={`text-[3cqw] ${muted}`}>
                  Finish today&apos;s assessment to take your place.
                </p>
              )}
              <button
                type="button"
                onClick={onClose}
                className="mt-auto w-full rounded-full border border-amber-200/30 bg-[#f6ead0] py-2 text-[3.4cqw] font-semibold text-[#2a1c0c] shadow-[0_6px_16px_rgba(0,0,0,0.4)] active:scale-[0.98]"
              >
                Leave the Hall
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
