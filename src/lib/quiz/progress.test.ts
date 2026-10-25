import { describe, expect, it } from "vitest";
import { mergeProgress } from "./progress";
import { EMPTY_PROGRESS, type QuizProgress } from "./types";

const progress = (over: Partial<QuizProgress>): QuizProgress => ({
  ...EMPTY_PROGRESS,
  ...over,
});

describe("mergeProgress", () => {
  it("takes points and level from the server even when local is ahead", () => {
    const local = progress({
      lastPlayedDate: "2026-10-24",
      streak: 4,
      totalPoints: 5000,
      levelId: 2,
      totalAnswered: 40,
    });
    const remote = progress({
      lastPlayedDate: "2026-10-23",
      streak: 3,
      totalPoints: 1200,
      levelId: 1,
      totalAnswered: 30,
    });
    const merged = mergeProgress(local, remote);
    expect(merged.totalPoints).toBe(1200);
    expect(merged.levelId).toBe(1);
    // Non-competition fields still follow the more recent play.
    expect(merged.streak).toBe(4);
    expect(merged.totalAnswered).toBe(40);
  });

  it("keeps local progress when signed out", () => {
    const local = progress({ totalPoints: 900 });
    expect(mergeProgress(local, null).totalPoints).toBe(900);
  });
});
