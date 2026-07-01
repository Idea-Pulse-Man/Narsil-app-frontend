/**
 * Tiny, SSR-safe localStorage helpers.
 *
 * v1 persists user state (saved/liked/following, preferences, tutorial) on the
 * device only. When Supabase is added (see `src/lib/supabase.ts`), these reads
 * become the offline cache and writes mirror to the `profiles` / `collections`
 * tables.
 */

export const STORAGE_KEYS = {
  saved: "narsil:saved",
  liked: "narsil:liked",
  following: "narsil:following",
  preferences: "narsil:preferences",
  tutorialDone: "narsil:tutorial-done",
} as const;

export function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJSON<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or unavailable — ignore in this mock */
  }
}
