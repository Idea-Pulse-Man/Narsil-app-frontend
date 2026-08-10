/**
 * Narsil navigation model.
 *
 * Eight screens are reachable through two persistent bars (see MobileShell):
 *  - TOP tabs (content browsing): Discover · For You · The Gallery · Search
 *  - BOTTOM bar (app sections):   The Vault · Create · Member
 *
 * Screen ids stay stable; labels are lore copy from worldCopy.
 * A single `Screen` is active at a time; whichever bar owns it highlights it.
 */
import { WORLD } from "@/data/worldCopy";

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
  { id: "buy", label: WORLD.gallery },
  { id: "search", label: "Search" },
];

export const BOTTOM_TABS: { id: Screen; label: string }[] = [
  { id: "saved", label: WORLD.vault },
  { id: "create", label: "Create" },
  { id: "you", label: WORLD.member },
];

/** The immersive feed is the only screen rendered full-bleed behind the chrome. */
export const isFeedScreen = (s: Screen) => s === "for-you";
