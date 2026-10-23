import { useEffect, useState } from "react";
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
import { ArrowLeftIcon } from "./Icons";

const FRAME_SRC = "/quiz-scrolls/hall-frame-v2.png";
/** Native size of the frame art. */
const FRAME_W = 1200;
const FRAME_H = 2677;

/*
 * Clear areas inside the frame art, as % of the frame box. Measured from the
 * PNG's alpha: the banner's ribbon tails narrow the top, the leaning swords
 * narrow the bottom, so the wide band between the pillars holds the rows.
 * Your own row sits apart, between the sword hilts, so it is always visible.
 */
const TITLE_ZONE = { left: "27.5%", right: "27.5%", top: "16.3%", bottom: "77.8%" };
const ROWS_ZONE = { left: "19.5%", right: "19.5%", top: "23.5%", bottom: "46.5%" };
const YOU_ZONE = { left: "23.5%", right: "20%", top: "56%", bottom: "37.6%" };

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
  // Rows come as the unbroken top block, then a window around you when you
  // rank below it. Inside the block you are already in the list; below it,
  // your row moves to its own spot under the list.
  let topCount = rows.length;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].rank > rows[i - 1].rank + 1) {
      topCount = i;
      break;
    }
  }
  const youIndex = rows.findIndex((row) => row.isYou);
  const youApart = youIndex >= topCount ? rows[youIndex] : null;
  const listRows = youApart ? rows.slice(0, topCount) : rows;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
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
          className="absolute inset-0 z-10 bg-[#120c08]"
          role="dialog"
          aria-label={copy.name}
        >
          {/* Outside the scroller so it stays put while the frame scrolls. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Back"
            className="absolute left-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-black/55 text-white backdrop-blur-md transition-colors hover:bg-black/70 after:absolute after:-inset-2 after:content-['']"
          >
            <ArrowLeftIcon className="h-4 w-4" />
          </button>

          <div className="h-full overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {/* Full width, so the frame runs taller than the screen and scrolls. */}
            <div
              className="@container relative mx-auto w-full max-w-[520px]"
              style={{ aspectRatio: `${FRAME_W} / ${FRAME_H}` }}
            >
              <div
                aria-hidden
                className="absolute inset-[16%_14%_11%] rounded-[30%] bg-[radial-gradient(ellipse_at_50%_40%,#2e2014_0%,#120c08_75%)]"
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
                <h2 className={`font-serif text-[4.2cqw] leading-tight ${heading}`}>
                  {copy.name}
                </h2>
                <p className={`text-[2.6cqw] leading-snug ${label}`}>{copy.subtitle}</p>
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
                <div className="relative min-h-0 flex-1 overflow-y-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {loading ? (
                    <p className={`mt-6 text-center text-sm ${muted}`}>Opening the Hall…</p>
                  ) : rows.length > 0 ? (
                    <BoardRows rows={listRows} ink="light" levelId={levelId} dense />
                  ) : (
                    <p className={`mt-6 rounded-xl border px-3 py-3 text-center text-sm ${box} ${body}`}>
                      {copy.empty}
                    </p>
                  )}
                </div>
              </div>

              <div className="absolute flex flex-col justify-end" style={YOU_ZONE}>
                {youApart ? (
                  <>
                    <p className={`pb-0.5 text-center text-xs leading-none tracking-widest ${muted}`}>···</p>
                    <BoardRows rows={[youApart]} ink="light" levelId={levelId} dense />
                  </>
                ) : youIndex >= 0 ? null : board?.rank != null ? (
                  <p className={`text-center font-serif text-[4.2cqw] leading-tight ${heading}`}>
                    Your place #{board.rank}
                    {board.points != null && (
                      <span className={`block text-[3cqw] tabular-nums ${muted}`}>
                        {board.points.toLocaleString()} {copy.unit}
                      </span>
                    )}
                  </p>
                ) : loading ? null : (
                  <p className={`text-center text-[3cqw] ${muted}`}>
                    {kind === "discover"
                      ? "Finish a trial at this level to take your place."
                      : "Finish today’s assessment to take your place."}
                  </p>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
