import { HALL_ART, hallCopy, type HallKind } from "@/lib/quiz/halls";
import type { ScrollInk } from "@/lib/quiz/scrolls";

/*
 * The painting is faded into the scroll like an old print: sepia, partly
 * transparent, and masked out behind the text on the left.
 */
const CARD_TONE: Record<
  ScrollInk,
  { card: string; art: string; name: string; teaser: string; chevron: string }
> = {
  dark: {
    card: "border-[#5c3d12]/35 bg-[#efe2c4]/40 shadow-[0_3px_10px_rgba(42,28,12,0.15)]",
    art: "opacity-70 mix-blend-multiply [filter:sepia(0.5)_saturate(0.8)]",
    name: "text-[#1a1208]",
    teaser: "text-[#3d2810]",
    chevron: "bg-[#2a1c0c] text-[#f6ead0]",
  },
  light: {
    card: "border-white/20 bg-black/35 shadow-[0_3px_10px_rgba(0,0,0,0.25)]",
    art: "opacity-55 [filter:sepia(0.5)_saturate(0.8)]",
    name: "text-[#f8efd8]",
    teaser: "text-[#e8d9b0]",
    chevron: "bg-[#f6ead0] text-[#2a1c0c]",
  },
};

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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={art.src}
        alt=""
        draggable={false}
        loading="lazy"
        className={`absolute inset-0 h-full w-full select-none object-cover [mask-image:linear-gradient(90deg,transparent_0%,rgba(0,0,0,0.3)_40%,#000_80%)] ${tone.art}`}
        style={{ objectPosition: art.focus }}
      />
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
