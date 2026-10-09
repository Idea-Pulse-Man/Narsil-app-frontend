/**
 * Painted backgrounds for Royal Assessment cards (Hall + Study tabs).
 * Public-domain paintings in `public/quiz-halls/` and `public/quiz-study/`,
 * faded into the scroll like an old print.
 */

import type { ScrollInk } from "./scrolls";

export interface CardArtSpec {
  src: string;
  /** object-position that keeps the subject in a short banner. */
  focus: string;
  credit: string;
}

export const STUDY_ART = {
  discover: {
    src: "/quiz-study/discover.jpg",
    focus: "50% 40%",
    credit: "Vermeer, The Geographer",
  },
  badges: {
    src: "/quiz-study/badges.jpg",
    focus: "50% 32%",
    credit: "Holbein, The Ambassadors",
  },
  streak: {
    src: "/quiz-study/streak.jpg",
    focus: "50% 34%",
    credit: "Georges de La Tour, Magdalene with the Smoking Flame",
  },
  practice: {
    src: "/quiz-study/practice.jpg",
    focus: "50% 48%",
    credit: "Vermeer, The Astronomer",
  },
} satisfies Record<string, CardArtSpec>;

/*
 * Sepia, half transparent, and masked out behind the text on the left.
 * The card itself turns translucent so the scroll shows through.
 */
export const CARD_TONE: Record<
  ScrollInk,
  { card: string; art: string; name: string; teaser: string; chevron: string }
> = {
  dark: {
    card: "border-[#5c3d12]/35 bg-[#efe2c4]/40 shadow-[0_3px_10px_rgba(42,28,12,0.15)]",
    art: "opacity-50 mix-blend-multiply [filter:sepia(0.5)_saturate(0.8)]",
    name: "text-[#1a1208]",
    teaser: "text-[#3d2810]",
    chevron: "bg-[#2a1c0c] text-[#f6ead0]",
  },
  light: {
    card: "border-white/20 bg-black/35 shadow-[0_3px_10px_rgba(0,0,0,0.25)]",
    art: "opacity-50 [filter:sepia(0.5)_saturate(0.8)]",
    name: "text-[#f8efd8]",
    teaser: "text-[#e8d9b0]",
    chevron: "bg-[#f6ead0] text-[#2a1c0c]",
  },
};
