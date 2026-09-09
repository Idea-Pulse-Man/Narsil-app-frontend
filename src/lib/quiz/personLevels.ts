/**
 * Client circular frames for person levels 1–7 (internal levelId 0–6).
 * Separate from quiz badge seals (Apprentice / Scholar / Master).
 */

import { MAX_LEVEL_ID, personLevelNumber } from "./levels";

export function personLevelFrameSrc(levelId: number): string {
  const n = personLevelNumber(levelId);
  return `/person-levels/level-${n}.png`;
}

/** Clamp any stored level id into the supported person ladder. */
export function clampLevelId(levelId: number): number {
  if (!Number.isFinite(levelId)) return 0;
  return Math.max(0, Math.min(MAX_LEVEL_ID, Math.floor(levelId)));
}
