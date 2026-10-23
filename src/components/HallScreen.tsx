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

const ART = "/quiz-scrolls/hall";
/** Native size of the whole frame art, before it was cut into pieces. */
const FRAME_W = 1200;
const FRAME_H = 2677;
/** Source-art pixels → container units, so everything scales with the frame. */
const px = (n: number) => `${(n / FRAME_W) * 100}cqw`;

/*
 * The frame is cut into a fixed top and bottom plus, per pillar, a
 * pole-and-banner tile that repeats so the hall grows as tall as its list
 * (the page scrolls, not the list). Tile ends were picked to join cleanly.
 */
const PIECES = {
  top: [1200, 615],
  bottom: [1200, 1232],
  "left-top": [600, 181],
  "left-bottom": [600, 298],
  "right-top": [600, 371],
  "right-bottom": [600, 96],
} as const;
const TILE_H = { left: 351, right: 363 };

/*
 * Content bands, in source-art pixels. The head holds the title under the
 * banner's ribbon tails; rows fill the wide band between the pillars; the
 * foot is the swords-and-scroll base, with your own row between the hilts.
 */
const HEAD_H = 629;
const TITLE = { top: 436, height: 158 };
const FOOT_H = 1232;
const ROWS_MIN_H = FRAME_H - HEAD_H - FOOT_H;
const YOU = { top: 54, height: 171 };

function Piece({ name, className = "" }: { name: keyof typeof PIECES; className?: string }) {
  const [width, height] = PIECES[name];
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${ART}/${name}.png`}
      alt=""
      width={width}
      height={height}
      draggable={false}
      className={`block h-auto w-full ${className}`}
    />
  );
}

function Pillar({ side }: { side: "left" | "right" }) {
  return (
    <div className="flex w-1/2 flex-col">
      <Piece name={`${side}-top`} />
      {/* -my-px hides hairline seams between the scaled pieces. */}
      <div
        className="-my-px min-h-0 flex-1"
        style={{
          backgroundImage: `url(${ART}/${side}-tile.png)`,
          backgroundSize: `100% ${px(TILE_H[side])}`,
          backgroundRepeat: "no-repeat round",
        }}
      />
      <Piece name={`${side}-bottom`} />
    </div>
  );
}

function HallFrameArt() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex select-none flex-col">
      <Piece name="top" className="-mb-px" />
      <div className="flex min-h-0 flex-1">
        <Pillar side="left" />
        <Pillar side="right" />
      </div>
      <Piece name="bottom" className="-mt-px" />
    </div>
  );
}

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
            {/* Full width; the content sets the height and the art grows to match. */}
            <div className="@container relative mx-auto w-full max-w-[520px]">
              <div
                aria-hidden
                className="absolute inset-[16%_14%_11%] rounded-[30%] bg-[radial-gradient(ellipse_at_50%_40%,#2e2014_0%,#120c08_75%)]"
              />
              <HallFrameArt />

              <div className="relative" style={{ height: px(HEAD_H) }}>
                <div
                  className="absolute inset-x-[27.5%] flex flex-col items-center justify-center text-center"
                  style={{ top: px(TITLE.top), height: px(TITLE.height) }}
                >
                  <h2 className={`font-serif text-[4.2cqw] leading-tight ${heading}`}>
                    {copy.name}
                  </h2>
                  <p className={`text-[2.6cqw] leading-snug ${label}`}>{copy.subtitle}</p>
                </div>
              </div>

              <div className="relative px-[19.5%] pb-2" style={{ minHeight: px(ROWS_MIN_H) }}>
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

              <div className="relative" style={{ height: px(FOOT_H) }}>
                <div
                  className="absolute left-[23.5%] right-[20%] flex flex-col justify-end"
                  style={{ top: px(YOU.top), height: px(YOU.height) }}
                >
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
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
