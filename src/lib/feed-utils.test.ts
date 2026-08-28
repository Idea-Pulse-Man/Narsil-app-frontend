import { describe, expect, it } from "vitest";
import type { Artwork } from "@/data";
import { orderSessionFeed } from "./feed-utils";

function art(id: string): Artwork {
  return {
    id,
    title: id,
    image: `https://example.com/${id}.jpg`,
    artistId: "a1",
  } as Artwork;
}

describe("orderSessionFeed", () => {
  it("promotes unseen works without re-sorting the pool", () => {
    const pool = [art("1"), art("2"), art("3"), art("4")];
    const ordered = orderSessionFeed(pool, {
      seen: new Set(["2", "4"]),
      limit: 4,
    });
    expect(ordered.map((item) => item.id)).toEqual(["1", "3", "2", "4"]);
  });

  it("respects the feed cap", () => {
    const pool = [art("1"), art("2"), art("3")];
    expect(orderSessionFeed(pool, { limit: 2 }).map((item) => item.id)).toEqual([
      "1",
      "2",
    ]);
  });
});
