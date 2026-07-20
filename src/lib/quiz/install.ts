/**
 * A stable per-install id, used to personalize the daily quiz.
 *
 * The daily quiz is seeded so it's the same all day (that's what makes resume /
 * review / anti-cheese work). Seeding it with the *date alone* means every user
 * sees the identical quiz. Folding this id into the seed instead gives each
 * install its own daily set drawn from the same large catalog — different per
 * user, still deterministic per day.
 *
 * Generated once and cached in localStorage; works offline and for guests. (A
 * signed-in, cross-device "same daily everywhere" would key off the Supabase
 * user id instead — a Phase-2 concern that also needs streak sync.)
 */

import type { User } from "@supabase/supabase-js";
import { STORAGE_KEYS, readJSON, writeJSON } from "@/lib/storage";

/** Best-effort random id — crypto UUID when available, else a random string. */
function randomId(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `q-${Math.random().toString(36).slice(2)}${Math.random()
    .toString(36)
    .slice(2)}`;
}

/**
 * The persistent per-install id. Falls back to a fixed string during SSR (no
 * window) so the seed is at least stable there.
 */
export function getQuizInstallId(): string {
  if (typeof window === "undefined") return "ssr";
  const existing = readJSON<string | null>(STORAGE_KEYS.quizInstallId, null);
  if (existing) return existing;
  const id = randomId();
  writeJSON(STORAGE_KEYS.quizInstallId, id);
  return id;
}

/**
 * The seed salt personalizing a user's daily quiz.
 *
 * A signed-in (non-anonymous) account uses its stable Supabase user id, so the
 * same person gets the *same* daily on every device — but still different from
 * other users. Guests and anonymous sessions fall back to the per-install id
 * (anonymous ids are per-device anyway, and this stays stable even before the
 * anonymous session finishes initializing).
 */
export function quizSalt(user: User | null | undefined): string {
  if (user && user.is_anonymous !== true && user.id) return user.id;
  return getQuizInstallId();
}
