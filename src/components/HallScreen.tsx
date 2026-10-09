import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { QUIZ_DIFFICULTIES, todayKey, type QuizDifficulty } from "@/lib/quiz";
import {
  fetchDiscoverBoard,
  fetchMonthBoard,
  type LevelBoard,
} from "@/lib/quizRemote";
import { scrollPalette } from "@/lib/quiz/scrolls";
import { BoardRows } from "./QuizRanking";
import { hallCopy, type HallKind } from "@/lib/quiz/halls";

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
  /** Which hall; defaults to today's same-level board. */
  kind?: HallKind;
  levelId: number;
  /** Today's board, already loaded by the hub / results. */
  board: LevelBoard | null;
  onClose: () => void;
}

/**
 * Full-screen Hall inside the royal frame art. Today's board is passed in;
 * the Monthly and Discover boards load when their hall opens.
 */
export default function HallScreen({
  open,
  kind = "daily",
  levelId,
  board: dailyBoard,
  onClose,
}: HallScreenProps) {
  const copy = hallCopy(kind, levelId);
  const { heading, muted, label, box, body } = scrollPalette("light");
  const rowsRef = useRef<HTMLDivElement>(null);
  const [difficulty, setDifficulty] = useState<QuizDifficulty>("apprentice");
  const [loaded, setLoaded] = useState<{ key: string; board: LevelBoard | null } | null>(
    null,
  );

  const boardKey = kind === "discover" ? `discover:${difficulty}` : kind;
  useEffect(() => {
    if (!open || kind === "daily") return;
    let live = true;
    const request =
      kind === "monthly"
        ? fetchMonthBoard(`${todayKey().slice(0, 7)}-01`)
        : fetchDiscoverBoard(difficulty);
    void request.then((board) => {
      if (live) setLoaded({ key: boardKey, board });
    });
    return () => {
      live = false;
    };
  }, [open, kind, difficulty, boardKey]);

  const loading = kind !== "daily" && loaded?.key !== boardKey;
  const board = kind === "daily" ? dailyBoard : loading ? null : loaded?.board ?? null;
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
  }, [open, onClose, rows.length]);

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
          aria-label={copy.name}
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
                {copy.name}
              </h2>
              <p className={`text-[2.9cqw] leading-snug ${label}`}>{copy.subtitle}</p>
            </div>

            <div className="absolute flex flex-col" style={ROWS_ZONE}>
              {kind === "discover" && (
                <div className="mb-1.5 flex shrink-0 gap-0.5 rounded-full border border-white/20 bg-black/45 p-0.5">
                  {QUIZ_DIFFICULTIES.map((spec) => (
                    <button
                      key={spec.id}
                      type="button"
                      onClick={() => setDifficulty(spec.id)}
                      className={`flex-1 rounded-full py-1 text-[2.7cqw] font-semibold ${
                        difficulty === spec.id
                          ? "bg-[#f6ead0] text-[#2a1c0c]"
                          : "text-[#f0e2bc]"
                      }`}
                    >
                      {spec.label}
                    </button>
                  ))}
                </div>
              )}
              <div
                ref={rowsRef}
                className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {loading ? (
                  <p className={`mt-6 text-center text-sm ${muted}`}>Opening the Hall…</p>
                ) : rows.length > 0 ? (
                  <BoardRows rows={rows} ink="light" levelId={levelId} dense />
                ) : (
                  <p className={`mt-6 rounded-xl border px-3 py-3 text-center text-sm ${box} ${body}`}>
                    {copy.empty}
                  </p>
                )}
              </div>
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
                      {board.points.toLocaleString()} {copy.unit}
                    </p>
                  )}
                </>
              ) : loading ? null : (
                <p className={`text-[3cqw] ${muted}`}>
                  {kind === "discover"
                    ? "Finish a trial at this level to take your place."
                    : "Finish today’s assessment to take your place."}
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
