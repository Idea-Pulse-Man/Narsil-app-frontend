import type { ReactNode } from "react";
import type { BoardRow, LevelBoard } from "@/lib/quizRemote";
import { levelTitle } from "@/lib/quiz";
import { scrollPalette, type ScrollInk } from "@/lib/quiz/scrolls";
import { useAppState } from "./AppState";
import PersonLevelFrame from "./PersonLevelFrame";
import { HallCard } from "./HallCards";

/** Rows visible before the Hall scrolls internally. */
const HALL_VISIBLE_ROWS = 4;
const ROW_ESTIMATE_PX = 52;

function MemberAvatar({
  name,
  avatarUrl,
  levelId,
  highlight,
  ink,
  size = 44,
}: {
  name: string;
  avatarUrl: string | null;
  levelId: number;
  highlight?: boolean;
  ink: ScrollInk;
  size?: number;
}) {
  const initial = (name.charAt(0) || "?").toUpperCase();
  const photoSize = Math.round(size * 0.5);
  const photoTone =
    ink === "dark"
      ? highlight
        ? "bg-[#c9a227]/45 text-[#1a1208]"
        : "bg-[#efe2c4] text-[#1a1208]"
      : highlight
        ? "bg-amber-300/25 text-amber-100"
        : "bg-white/15 text-[#f8efd8]";

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <span
        className={`absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center justify-center overflow-hidden rounded-full font-serif ${photoTone}`}
        style={{
          width: photoSize,
          height: photoSize,
          fontSize: Math.round(photoSize * 0.6),
        }}
      >
        {avatarUrl ? (
          <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initial
        )}
      </span>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <PersonLevelFrame levelId={levelId} size={size} />
      </span>
    </span>
  );
}

export function BoardRows({
  rows,
  ink,
  levelId,
  scrollable,
  dense,
}: {
  rows: BoardRow[];
  ink: ScrollInk;
  levelId: number;
  /** Cap height so a long Hall cannot bury the rest of the hub. */
  scrollable?: boolean;
  /** Tighter rows for the narrow opening of the full-screen Hall frame. */
  dense?: boolean;
}) {
  const nodes: ReactNode[] = [];
  const { muted, strong, youRow, peerRow } = scrollPalette(ink);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const prev = rows[i - 1];
    if (prev && row.rank > prev.rank + 1) {
      nodes.push(
        <div
          key={`gap-${prev.rank}-${row.rank}`}
          className={`py-1 text-center text-sm tracking-widest ${muted}`}
        >
          ···
        </div>,
      );
    }
    nodes.push(
      <div
        key={`${row.rank}-${row.userId}`}
        data-you={row.isYou || undefined}
        className={`flex items-center rounded-xl border ${
          dense ? "gap-1.5 px-1.5 py-1" : "gap-3 px-3 py-2.5"
        } ${row.isYou ? youRow : peerRow}`}
      >
        <span
          className={`${dense ? "w-5" : "w-6"} shrink-0 text-center text-xs font-semibold tabular-nums ${muted}`}
        >
          {row.rank}
        </span>
        <MemberAvatar
          name={row.isYou ? "You" : row.displayName}
          avatarUrl={row.avatarUrl}
          levelId={row.levelId ?? levelId}
          highlight={row.isYou}
          ink={ink}
          size={dense ? 34 : 44}
        />
        <div className="min-w-0 flex-1">
          <p className={`truncate ${dense ? "text-[13px]" : "text-sm"} font-medium ${strong}`}>
            {row.isYou ? "You" : row.displayName}
          </p>
        </div>
        <span
          className={`shrink-0 ${dense ? "text-[13px]" : "text-sm"} font-semibold tabular-nums ${strong}`}
        >
          {row.points.toLocaleString()}
        </span>
      </div>,
    );
  }

  const list = <div className={dense ? "space-y-1.5" : "space-y-2"}>{nodes}</div>;
  if (dense) return list;
  if (!scrollable || rows.length <= HALL_VISIBLE_ROWS) {
    return <div className="mt-3">{list}</div>;
  }

  return (
    <div
      className="mt-3 overflow-y-auto overscroll-contain pr-0.5 [scrollbar-width:thin]"
      style={{ maxHeight: HALL_VISIBLE_ROWS * ROW_ESTIMATE_PX }}
    >
      {list}
    </div>
  );
}

interface QuizRankingProps {
  levelId: number;
  board: LevelBoard | null;
  boardLocked: boolean;
  ink: ScrollInk;
  /** Compact copy for the hub vs full results heading. */
  compact?: boolean;
  /** Hub only — keep the Hall from pushing Study options off-screen. */
  scrollable?: boolean;
  /** Show an "Enter the Hall" button instead of rows; rows live in HallScreen. */
  onEnterHall?: () => void;
}

export default function QuizRanking({
  levelId,
  board,
  boardLocked,
  ink,
  compact,
  scrollable = false,
  onEnterHall,
}: QuizRankingProps) {
  const title = levelTitle(levelId);
  const { label, body, box } = scrollPalette(ink);
  const { requestSignIn } = useAppState();

  return (
    <section>
      <p
        className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${label}`}
      >
        Hall of {title}s
      </p>
      <p className={`mt-1 text-xs ${label}`}>
        {compact ? "Today’s ranking · same level" : "Today · same level only"}
        {board?.rank != null && <span> · you #{board.rank}</span>}
      </p>

      {boardLocked ? (
        <button
          type="button"
          onClick={requestSignIn}
          className={`mt-3 w-full rounded-xl border px-4 py-3 text-left text-sm ${box} ${body}`}
        >
          Sign in to join the Hall and appear on the rankings.
        </button>
      ) : onEnterHall ? (
        <div className="mt-3">
          <HallCard
            kind="daily"
            levelId={levelId}
            ink={ink}
            rank={board?.rank}
            onOpen={onEnterHall}
          />
        </div>
      ) : board && board.rows.length > 0 ? (
        <BoardRows
          rows={board.rows}
          ink={ink}
          levelId={levelId}
          scrollable={scrollable}
        />
      ) : (
        <p className={`mt-3 rounded-xl border px-4 py-3 text-sm ${box} ${body}`}>
          The Hall is quiet. Finish today&apos;s assessment to take a place
          among {title}s.
        </p>
      )}
    </section>
  );
}
