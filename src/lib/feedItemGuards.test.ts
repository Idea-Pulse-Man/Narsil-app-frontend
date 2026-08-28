import { describe, expect, it } from "vitest";
import type { Artwork, FeedItem, FypArtistCard } from "@/data";
import { isRenderableFeedItem } from "./feedItemGuards";

const card: FypArtistCard = {
  id: "card-1",
  artistId: "a1",
  name: "Monet",
  portraitUrl: "https://example.com/p.jpg",
  bio: "Painter",
  active: true,
  sortOrder: 0,
};

const artwork: Artwork = {
  id: "w1",
  title: "Water Lilies",
  image: "https://example.com/w1.jpg",
  artistId: "a1",
} as Artwork;

describe("isRenderableFeedItem", () => {
  const ctx = {
    getArtist: (id: string) => (id === "a1" ? { id } : undefined),
    getFypArtistCard: (artistId: string) =>
      artistId === "a1" ? card : undefined,
  };

  it("accepts artwork rows with a resolvable artist", () => {
    const item: FeedItem = { kind: "artwork", artwork };
    expect(isRenderableFeedItem(item, ctx)).toBe(true);
  });

  it("rejects artist-story rows without a card", () => {
    expect(
      isRenderableFeedItem(
        { kind: "artist-story", artistId: "missing", backdropArtworkId: "w1" },
        ctx,
      ),
    ).toBe(false);
  });

  it("accepts era-story rows for known eras", () => {
    expect(
      isRenderableFeedItem(
        { kind: "era-story", eraId: "renaissance", backdropArtworkId: "w1" },
        ctx,
      ),
    ).toBe(true);
  });
});
