import { describe, expect, it, beforeEach } from "vitest";
import {
  TOPIC_RETRY_WAITS_MS,
  clearTopicCooldown,
  formatWaitMs,
  getTopicCooldown,
  recordTopicFail,
  resetCooldownsForTests,
  waitMsForFailCount,
} from "./cooldowns";

const topic = {
  kind: "age" as const,
  id: "ancient-egypt",
  title: "Ancient Egypt",
};

describe("topic retry cooldowns", () => {
  beforeEach(() => {
    resetCooldownsForTests();
  });

  it("escalates 30s → 5m → 30m → 1h → 6h → 24h", () => {
    expect(TOPIC_RETRY_WAITS_MS).toEqual([
      30_000,
      5 * 60_000,
      30 * 60_000,
      60 * 60_000,
      6 * 60 * 60_000,
      24 * 60 * 60_000,
    ]);
    expect(waitMsForFailCount(1)).toBe(30_000);
    expect(waitMsForFailCount(2)).toBe(5 * 60_000);
    expect(waitMsForFailCount(6)).toBe(24 * 60 * 60_000);
    expect(waitMsForFailCount(99)).toBe(24 * 60 * 60_000);
    expect(formatWaitMs(30_000)).toBe("30s");
    expect(formatWaitMs(5 * 60_000)).toBe("5 min");
  });

  it("locks after a fail and clears after a perfect run", () => {
    const now = Date.parse("2026-09-14T12:00:00.000Z");
    const fail = recordTopicFail(topic, "apprentice", now);
    expect(fail.failCount).toBe(1);
    expect(getTopicCooldown(topic, "apprentice", now)?.remainingMs).toBe(30_000);
    expect(
      getTopicCooldown(topic, "apprentice", now + 31_000),
    ).toBeNull();

    recordTopicFail(topic, "apprentice", now + 40_000);
    expect(
      getTopicCooldown(topic, "apprentice", now + 40_000)?.failCount,
    ).toBe(2);

    clearTopicCooldown(topic, "apprentice");
    expect(getTopicCooldown(topic, "apprentice", now + 40_000)).toBeNull();
  });
});
