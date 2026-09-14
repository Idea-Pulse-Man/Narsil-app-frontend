import { describe, expect, it } from "vitest";
import type { Artwork } from "@/data";
import {
  diversifyFeed,
  orderSessionFeed,
  shufflePreRankedBatches,
} from "./feed-utils";

function art(id: string, extra: Partial<Artwork> = {}): Artwork {
  return {
    id,
    title: id,
    image: extra.image ?? `https://example.com/${id}.jpg`,
    artistId: extra.artistId ?? "a1",
    tags: extra.tags ?? [],
    ...extra,
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

describe("shufflePreRankedBatches", () => {
  it("keeps items in their popularity window but changes order by seed", () => {
    const pool = Array.from({ length: 6 }, (_, i) => art(String(i)));
    const a = shufflePreRankedBatches(pool, 1, [6]);
    const b = shufflePreRankedBatches(pool, 2, [6]);
    expect(a.map((item) => item.id).sort()).toEqual(pool.map((item) => item.id));
    expect(a.map((item) => item.id).join()).not.toBe(
      b.map((item) => item.id).join(),
    );
  });
});

describe("diversifyFeed", () => {
  it("does not place two cards with the same image back to back", () => {
    const shared = "https://example.com/same.jpg";
    const pool = [
      art("a", { artistId: "one", image: shared }),
      art("b", { artistId: "two", image: shared }),
      art("c", { artistId: "three", image: "https://example.com/c.jpg" }),
    ];
    const mixed = diversifyFeed(pool);
    for (let i = 0; i < mixed.length - 1; i++) {
      expect(mixed[i].image === mixed[i + 1].image).toBe(false);
    }
  });
});
