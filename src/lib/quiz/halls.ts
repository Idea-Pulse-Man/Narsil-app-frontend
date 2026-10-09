/**
 * The Royal Assessment halls: today's board, the monthly board, and the
 * Discover trials board, each with its representative painting.
 */

import { levelTitle } from "./levels";

export type HallKind = "daily" | "monthly" | "discover";

/**
 * Representative art per hall (public-domain paintings, `public/quiz-halls/`).
 * `focus` is the object-position that keeps the subject in a short banner.
 */
export const HALL_ART: Record<HallKind, { src: string; focus: string; credit: string }> = {
  daily: {
    src: "/quiz-halls/daily.jpg",
    focus: "50% 72%",
    credit: "Velázquez, Las Meninas",
  },
  monthly: {
    src: "/quiz-halls/monthly.jpg",
    focus: "50% 62%",
    credit: "Limbourg brothers, Très Riches Heures · January",
  },
  discover: {
    src: "/quiz-halls/discover.jpg",
    focus: "50% 45%",
    credit: "Raphael, The School of Athens",
  },
};

export const HALL_KINDS: HallKind[] = ["daily", "monthly", "discover"];

export function monthName(date = new Date()): string {
  return date.toLocaleString("en", { month: "long" });
}

/** Title + one-line description for a hall, in the member's level. */
export function hallCopy(kind: HallKind, levelId: number) {
  const title = levelTitle(levelId);
  switch (kind) {
    case "daily":
      return {
        name: `Hall of ${title}s`,
        subtitle: "Today · same level only",
        teaser: `Today’s ${title}s, ranked`,
        unit: "pts today",
        empty: `The Hall is quiet. Finish today’s assessment to take a place among ${title}s.`,
      };
    case "monthly":
      return {
        name: "Monthly Hall",
        subtitle: `${monthName()} · all levels · every daily summed`,
        teaser: `${monthName()} · all levels, every daily summed`,
        unit: `pts in ${monthName()}`,
        empty: "No one has played this month yet. Finish today’s assessment to open the board.",
      };
    case "discover":
      return {
        name: "Discover Hall",
        subtitle: "Best Discover trials · all members",
        teaser: "Apprentice, Scholar & Master trials",
        unit: "correct answers",
        empty: "No one has finished a trial at this level yet. Play one in Study to open the board.",
      };
  }
}
