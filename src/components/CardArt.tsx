import { CARD_TONE, type CardArtSpec } from "@/lib/quiz/cardArt";
import type { ScrollInk } from "@/lib/quiz/scrolls";

/**
 * Faded painting behind a card's content. The parent needs `relative
 * overflow-hidden`, and its content `relative` so it stacks above.
 */
export default function CardArt({ art, ink }: { art: CardArtSpec; ink: ScrollInk }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={art.src}
      alt=""
      aria-hidden
      draggable={false}
      className={`pointer-events-none absolute inset-0 h-full w-full select-none object-cover [mask-image:linear-gradient(90deg,transparent_0%,rgba(0,0,0,0.3)_40%,#000_80%)] ${CARD_TONE[ink].art}`}
      style={{ objectPosition: art.focus }}
    />
  );
}
