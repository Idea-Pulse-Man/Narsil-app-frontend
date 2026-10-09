import { HALL_ART, hallCopy, type HallKind } from "@/lib/quiz/halls";

/** Painted banner card that opens a hall. */
export function HallCard({
  kind,
  levelId,
  rank,
  onOpen,
}: {
  kind: HallKind;
  levelId: number;
  /** Your place, when already known (today's board loads with the hub). */
  rank?: number | null;
  onOpen: () => void;
}) {
  const art = HALL_ART[kind];
  const copy = hallCopy(kind, levelId);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="relative block h-[104px] w-full overflow-hidden rounded-2xl border border-[#5c3d12]/50 text-left shadow-[0_6px_16px_rgba(42,28,12,0.28)] active:scale-[0.99]"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={art.src}
        alt=""
        draggable={false}
        loading="lazy"
        className="absolute inset-0 h-full w-full select-none object-cover"
        style={{ objectPosition: art.focus }}
      />
      <span
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(90deg,rgba(18,12,8,0.88)_0%,rgba(18,12,8,0.62)_55%,rgba(18,12,8,0.15)_100%)]"
      />
      <span className="relative flex h-full items-center justify-between gap-3 px-4">
        <span className="min-w-0">
          <span className="block font-serif text-lg leading-tight text-[#f8efd8]">
            {copy.name}
          </span>
          <span className="mt-1 block text-[12px] leading-snug text-[#e8d9b0]">
            {rank != null ? `You stand #${rank} · ${copy.teaser}` : copy.teaser}
          </span>
        </span>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f6ead0]/90 text-[#2a1c0c]">
          ›
        </span>
      </span>
    </button>
  );
}
