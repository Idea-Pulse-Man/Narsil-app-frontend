import { describe, expect, it } from "vitest";
import type { Artwork, FeedItem, FypArtistCard } from "@/data";
import {
  diversifyFeed,
  interleaveStorySlides,
  orderSessionFeed,
  shufflePreRankedBatches,
} from "./feed-utils";

function art(id: string, extra: Partial<Artwork> = {}): Artwork {
  return {
    id,
    title: id,
    year: "",
    image: extra.image ?? `https://example.com/${id}.jpg`,
    artistId: extra.artistId ?? "a1",
    tags: extra.tags ?? [],
    ...extra,
  } as Artwork;
}

function card(artistId: string, extra: Partial<FypArtistCard> = {}): FypArtistCard {
  return { artistId, active: true, ...extra } as FypArtistCard;
}

function storyBackdrops(items: FeedItem[]): string[] {
  return items.flatMap((item) =>
    item.kind === "artwork" ? [] : [item.backdropArtworkId],
  );
}

function cardIds(items: FeedItem[]): string[] {
  return items.flatMap((item) =>
    item.kind === "artwork" ? [item.artwork.id] : [],
  );
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

describe("interleaveStorySlides", () => {
  const empires = ["Egyptian", "Greek", "Roman"];
  const pool = Array.from({ length: 90 }, (_, i) =>
    art(`w${i}`, { artistId: `a${i % 6}`, empire: empires[i % 3] }),
  );
  const cards = { a0: card("a0"), a1: card("a1"), a2: card("a2") };

  it("shows every work once — as a card or behind a story, never both", () => {
    for (let seed = 1; seed <= 10; seed++) {
      const items = interleaveStorySlides(pool, { seed, fypArtistCardMap: cards });
      const backdrops = storyBackdrops(items);
      expect(backdrops.length).toBeGreaterThan(0);
      expect([...cardIds(items), ...backdrops].sort()).toEqual(
        pool.map((a) => a.id).sort(),
      );
    }
  });

  it("uses the curated card backdrop when it isn't a feed card", () => {
    const items = interleaveStorySlides(
      pool.map((a) => ({ ...a, empire: undefined })),
      { seed: 1, fypArtistCardMap: { a0: card("a0", { backdropArtworkId: "elsewhere" }) } },
    );
    expect(storyBackdrops(items)).toEqual(["elsewhere"]);
  });

  it("keeps a pinned backdrop while that work is still ahead", () => {
    const noEras = pool.map((a) => ({ ...a, empire: undefined }));
    const pins = new Map([["artist-story-a0", "w84"]]);
    const items = interleaveStorySlides(noEras, {
      seed: 1,
      fypArtistCardMap: { a0: card("a0") },
      backdropPins: pins,
    });
    expect(storyBackdrops(items)).toEqual(["w84"]);
    expect(cardIds(items)).not.toContain("w84");
  });
});
