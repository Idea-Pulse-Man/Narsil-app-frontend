import type { ReactNode } from "react";
import type { BoardRow, LevelBoard } from "@/lib/quizRemote";
import { levelTitle } from "@/lib/quiz";
import { scrollPalette, type ScrollInk } from "@/lib/quiz/scrolls";
import { useAppState } from "./AppState";

function MemberAvatar({
  name,
  avatarUrl,
  highlight,
  ink,
}: {
  name: string;
  avatarUrl: string | null;
  highlight?: boolean;
  ink: ScrollInk;
}) {
  const initial = (name.charAt(0) || "?").toUpperCase();
  const ring =
    ink === "dark"
      ? highlight
        ? "border-[#5c3d12] bg-[#c9a227]/35 text-[#1a1208]"
        : "border-[#5c3d12]/50 bg-[#efe2c4] text-[#1a1208]"
      : highlight
        ? "border-amber-300/60 bg-amber-300/20 text-amber-100"
        : "border-white/25 bg-white/15 text-[#f8efd8]";
  return (
    <div
      className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border font-serif text-sm ${ring}`}
    >
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}

function BoardRows({ rows, ink }: { rows: BoardRow[]; ink: ScrollInk }) {
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
        className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
          row.isYou ? youRow : peerRow
        }`}
      >
        <span className={`w-6 shrink-0 text-center text-xs font-semibold tabular-nums ${muted}`}>
          {row.rank}
        </span>
        <MemberAvatar
          name={row.isYou ? "You" : row.displayName}
          avatarUrl={row.avatarUrl}
          highlight={row.isYou}
          ink={ink}
        />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-sm font-medium ${strong}`}>
            {row.isYou ? "You" : row.displayName}
          </p>
        </div>
        <span className={`shrink-0 text-sm font-semibold tabular-nums ${strong}`}>
          {row.points.toLocaleString()}
        </span>
      </div>,
    );
  }
  return <div className="mt-3 space-y-2">{nodes}</div>;
}

interface QuizRankingProps {
  levelId: number;
  board: LevelBoard | null;
  boardLocked: boolean;
  ink: ScrollInk;
  /** Compact copy for the hub vs full results heading. */
  compact?: boolean;
}

export default function QuizRanking({
  levelId,
  board,
  boardLocked,
  ink,
  compact,
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
      ) : board && board.rows.length > 0 ? (
        <BoardRows rows={board.rows} ink={ink} />
      ) : (
        <p className={`mt-3 rounded-xl border px-4 py-3 text-sm ${box} ${body}`}>
          The Hall is quiet. Finish today&apos;s assessment to take a place
          among {title}s.
        </p>
      )}
    </section>
  );
}
