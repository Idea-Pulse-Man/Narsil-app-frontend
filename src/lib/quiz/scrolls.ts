/**
 * Per-level parchment scroll art for the Assessment hub + results.
 * Images live in `public/quiz-scrolls/` (client-supplied 9:16 frames).
 */

export type ScrollInk = "dark" | "light";

export interface LevelScroll {
  src: string;
  /** Text color on the parchment: dark ink vs cream/gilt. */
  ink: ScrollInk;
}

const SCROLLS: Record<number, LevelScroll> = {
  0: { src: "/quiz-scrolls/peasant.png", ink: "dark" },
  1: { src: "/quiz-scrolls/scholar.png", ink: "dark" },
  2: { src: "/quiz-scrolls/archivist.png", ink: "light" },
  3: { src: "/quiz-scrolls/master-archivist.png", ink: "dark" },
  4: { src: "/quiz-scrolls/grand-archivist.png", ink: "light" },
};

export function scrollForLevel(levelId: number): LevelScroll {
  return SCROLLS[levelId] ?? SCROLLS[0];
}
