/**
 * Per-level parchment scroll art for the Assessment hub + results.
 * Images live in `public/quiz-scrolls/` (client-supplied 9:16 frames).
 */

export type ScrollInk = "dark" | "light";

export interface LevelScroll {
  src: string;
  /** Text color on the parchment: dark ink vs cream/gilt. */
  ink: ScrollInk;
  /**
   * Opacity (0–1) of a parchment wash over the scroll's middle, fading busy
   * line art behind the text. The rollers at top and bottom stay untouched.
   */
  wash?: number;
}

const SCROLLS: Record<number, LevelScroll> = {
  0: { src: "/quiz-scrolls/peasant.png", ink: "dark", wash: 0.4 },
  1: { src: "/quiz-scrolls/scholar.png", ink: "dark" },
  2: { src: "/quiz-scrolls/archivist.png", ink: "light" },
  3: { src: "/quiz-scrolls/master-archivist.png", ink: "dark" },
  4: { src: "/quiz-scrolls/grand-archivist.png", ink: "light" },
  /** High / Royal tiers reuse the grand scroll until dedicated parchment ships. */
  5: { src: "/quiz-scrolls/grand-archivist.png", ink: "light" },
  6: { src: "/quiz-scrolls/grand-archivist.png", ink: "light" },
};

export function scrollForLevel(levelId: number): LevelScroll {
  return SCROLLS[levelId] ?? SCROLLS[0];
}

/** High-contrast text + panel classes for parchment / dark scrolls. */
export interface ScrollPalette {
  heading: string;
  muted: string;
  label: string;
  accent: string;
  body: string;
  box: string;
  strong: string;
  youRow: string;
  peerRow: string;
}

export function scrollPalette(ink: ScrollInk): ScrollPalette {
  if (ink === "dark") {
    return {
      heading: "text-[#1a1208]",
      muted: "text-[#3d2810]",
      label: "text-[#4a3014]",
      accent: "text-[#5c3a10]",
      body: "text-[#2a1c0c]",
      strong: "text-[#1a1208]",
      box: "border-[#5c3d12]/40 bg-[#f5ead2]/90",
      youRow: "border-[#a8841a]/80 bg-[#c9a227]/30",
      peerRow: "border-[#5c3d12]/35 bg-[#efe2c4]/80",
    };
  }
  return {
    heading: "text-[#f8efd8]",
    muted: "text-[#e8d9b0]",
    label: "text-[#f0e2bc]",
    accent: "text-amber-200",
    body: "text-[#f3e6c8]",
    strong: "text-[#f8efd8]",
    box: "border-white/20 bg-black/45",
    youRow: "border-amber-300/50 bg-amber-300/20",
    peerRow: "border-white/15 bg-black/35",
  };
}
