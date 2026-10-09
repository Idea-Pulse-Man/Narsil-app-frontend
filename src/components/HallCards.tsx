import { HALL_ART, hallCopy, type HallKind } from "@/lib/quiz/halls";
import type { ScrollInk } from "@/lib/quiz/scrolls";
import { CARD_TONE } from "@/lib/quiz/cardArt";
import CardArt from "./CardArt";

/** Painted banner card that opens a hall. */
export function HallCard({
  kind,
  levelId,
  ink = "dark",
  rank,
  onOpen,
}: {
  kind: HallKind;
  levelId: number;
  /** Ink of the scroll behind the card (parchment vs dark scroll). */
  ink?: ScrollInk;
  /** Your place, when already known (today's board loads with the hub). */
  rank?: number | null;
  onOpen: () => void;
}) {
  const art = HALL_ART[kind];
  const copy = hallCopy(kind, levelId);
  const tone = CARD_TONE[ink];

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`relative block h-[96px] w-full overflow-hidden rounded-2xl border text-left active:scale-[0.99] ${tone.card}`}
    >
      <CardArt art={art} ink={ink} />
      <span className="relative flex h-full items-center justify-between gap-3 px-4">
        <span className="min-w-0">
          <span className={`block font-serif text-lg leading-tight ${tone.name}`}>
            {copy.name}
          </span>
          <span className={`mt-1 block text-[12px] leading-snug ${tone.teaser}`}>
            {rank != null ? `You stand #${rank} · ${copy.teaser}` : copy.teaser}
          </span>
        </span>
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${tone.chevron}`}
        >
          ›
        </span>
      </span>
    </button>
  );
}
