import { describe, expect, it } from "vitest";
import {
  assessmentBadgeId,
  highestDiscoverRank,
  isStudyBadgeEarned,
  listAssessmentBadges,
  listDiscoverStudyBadges,
  sanitizeSelectedBadgeId,
} from "./studyBadges";

describe("study badges", () => {
  it("lists seven Assessment ranks", () => {
    const list = listAssessmentBadges();
    expect(list).toHaveLength(7);
    expect(list[0]?.id).toBe(assessmentBadgeId(0));
    expect(list[6]?.title).toBe("Royal Archivist");
  });

  it("unlocks Assessment ranks up to the current person level", () => {
    const scholar = listAssessmentBadges()[1]!;
    expect(isStudyBadgeEarned(scholar, 0, {})).toBe(false);
    expect(isStudyBadgeEarned(scholar, 1, {})).toBe(true);
  });

  it("unlocks Discover seals only when the trial badge exists", () => {
    const catalog = listDiscoverStudyBadges(["Roman"]);
    const egypt = catalog.find((b) => b.id === "age:ancient-egypt:apprentice");
    expect(egypt).toBeDefined();
    expect(isStudyBadgeEarned(egypt!, 6, {})).toBe(false);
    expect(
      isStudyBadgeEarned(egypt!, 0, {
        "age:ancient-egypt:apprentice": {
          id: "age:ancient-egypt:apprentice",
          unlockedAt: "2026-01-01",
        },
      }),
    ).toBe(true);
  });

  it("reports the highest Discover rank earned", () => {
    expect(highestDiscoverRank({})).toBeNull();
    expect(
      highestDiscoverRank({
        "age:ancient-egypt:apprentice": {
          id: "age:ancient-egypt:apprentice",
          unlockedAt: "2026-01-01",
        },
        "age:ancient-egypt:master": {
          id: "age:ancient-egypt:master",
          unlockedAt: "2026-01-02",
        },
      }),
    ).toBe("master");
  });

  it("clears a worn badge that is not earned", () => {
    const catalog = listAssessmentBadges();
    expect(
      sanitizeSelectedBadgeId(assessmentBadgeId(3), 0, {}, catalog),
    ).toBeNull();
    expect(
      sanitizeSelectedBadgeId(assessmentBadgeId(0), 0, {}, catalog),
    ).toBe(assessmentBadgeId(0));
  });
});
