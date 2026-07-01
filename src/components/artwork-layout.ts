/** Shared layout tokens for the invisible artwork footer and tutorial cues. */
export const ARTWORK_FOOTER_HEIGHT = "15rem";

export const artworkFooterClass =
  "min-h-[15rem] px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+5rem)]";

/** Positions the step-2 swipe cue directly above the description button. */
export const tutorialFooterHintClass =
  "bottom-[calc(env(safe-area-inset-bottom)+8.5rem)]";

/**
 * Standard padding for scrollable content screens so content clears the top
 * tab bar and the bottom navigation bar. Keeps every page visually consistent.
 */
export const screenScrollClass =
  "h-full overflow-y-auto overscroll-contain scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden";

export const screenContentClass =
  "px-5 pt-[calc(env(safe-area-inset-top)+6.5rem)] pb-[calc(env(safe-area-inset-bottom)+6.5rem)]";
