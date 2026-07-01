/**
 * Shared contract for the interactive, learn-by-doing tutorial.
 *
 * The tutorial runs directly on the live feed: the real artwork components
 * perform their normal gestures, and report each completed gesture up to the
 * MobileShell state machine, which advances the coach overlay. It is mock-only
 * with no persistence — refreshing the page restarts it.
 */
export type TutorialAction =
  | "scroll"
  | "placard"
  | "artist"
  | "fit"
  | "clean"
  | "actions";

export interface TutorialBridge {
  /** Whether the tutorial is currently running. */
  active: boolean;
  /** The single gesture allowed for the current step (others are blocked). */
  allow: TutorialAction | null;
  /** Report that the user successfully performed a gesture. */
  report: (action: TutorialAction) => void;
  /** Bumped to ask cards to return to a neutral state (close sheets, exit clean). */
  resetToken: number;
}
