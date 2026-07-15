/**
 * Narsil navigation model.
 *
 * Eight screens are reachable through two persistent bars (see MobileShell):
 *  - TOP tabs (content browsing): Discover · For You · Buy · Search
 *  - BOTTOM bar (app sections):   Saved · Create · You
 *
 * A single `Screen` is active at a time; whichever bar owns it highlights it.
 */
export type Screen =
  | "discover"
  | "for-you"
  | "buy"
  | "search"
  | "create"
  | "saved"
  | "you";

export const TOP_TABS: { id: Screen; label: string }[] = [
  { id: "discover", label: "Discover" },
  { id: "for-you", label: "For You" },
  { id: "buy", label: "Buy" },
  { id: "search", label: "Search" },
];

export const BOTTOM_TABS: { id: Screen; label: string }[] = [
  { id: "saved", label: "Saved" },
  { id: "create", label: "Create" },
  { id: "you", label: "You" },
];

/** The immersive feed is the only screen rendered full-bleed behind the chrome. */
export const isFeedScreen = (s: Screen) => s === "for-you";
