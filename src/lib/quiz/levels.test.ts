import { describe, expect, it } from "vitest";
import {
  LEVEL_THRESHOLDS,
  LEVEL_TITLES,
  MAX_LEVEL_ID,
  levelFromPoints,
  levelTitle,
  nextThreshold,
  personLevelNumber,
  thresholdFor,
} from "./levels";
import { personLevelFrameSrc, clampLevelId } from "./personLevels";

describe("person levels (1–7)", () => {
  it("exposes seven thresholds and titles", () => {
    expect(LEVEL_THRESHOLDS).toHaveLength(7);
    expect(LEVEL_TITLES).toHaveLength(7);
    expect(MAX_LEVEL_ID).toBe(6);
    expect(LEVEL_THRESHOLDS).toEqual([
      0, 1000, 3000, 9000, 27000, 81000, 243000,
    ]);
  });

  it("maps points to level ids with the geometric ladder", () => {
    expect(levelFromPoints(0)).toBe(0);
    expect(levelFromPoints(999)).toBe(0);
    expect(levelFromPoints(1000)).toBe(1);
    expect(levelFromPoints(2999)).toBe(1);
    expect(levelFromPoints(3000)).toBe(2);
    expect(levelFromPoints(9000)).toBe(3);
    expect(levelFromPoints(27000)).toBe(4);
    expect(levelFromPoints(81000)).toBe(5);
    expect(levelFromPoints(243000)).toBe(6);
    expect(levelFromPoints(999999)).toBe(6);
  });

  it("displays person level as 1–7", () => {
    expect(personLevelNumber(0)).toBe(1);
    expect(personLevelNumber(6)).toBe(7);
    expect(personLevelNumber(-3)).toBe(1);
    expect(personLevelNumber(99)).toBe(7);
  });

  it("resolves frame art paths for every tier", () => {
    for (let id = 0; id <= MAX_LEVEL_ID; id++) {
      expect(personLevelFrameSrc(id)).toBe(
        `/person-levels/level-${id + 1}.png`,
      );
    }
  });

  it("clamps stored level ids", () => {
    expect(clampLevelId(-1)).toBe(0);
    expect(clampLevelId(3.9)).toBe(3);
    expect(clampLevelId(100)).toBe(6);
  });

  it("reports next threshold until the top", () => {
    expect(nextThreshold(0)).toBe(1000);
    expect(nextThreshold(5)).toBe(243000);
    expect(nextThreshold(6)).toBeNull();
    expect(thresholdFor(6)).toBe(243000);
    expect(levelTitle(6)).toBe("Royal Archivist");
  });
});
