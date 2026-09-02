import { describe, expect, it } from "vitest";
import type { Artwork, Artist } from "@/data";
import { filterArtworks } from "./searchIndex";

function art(id: string, title: string, artistId = "a1"): Artwork {
  return {
    id,
    title,
    image: `https://example.com/${id}.jpg`,
    artistId,
    description: "",
    period: "Impressionism",
    year: "1880",
    medium: "Oil",
    source: "Museum",
    tags: [],
    category: "paintings",
    origin: "public-domain",
    accent: "#111",
  } as Artwork;
}

describe("filterArtworks", () => {
  const artistMap: Record<string, Artist> = {
    a1: { id: "a1", name: "Monet" } as Artist,
    a2: { id: "a2", name: "Van Gogh" } as Artist,
  };
  const pool = [
    art("1", "Water Lilies"),
    art("2", "Starry Night", "a2"),
    art("3", "Haystacks"),
  ];

  it("filters by text before the full index is ready", () => {
    const found = filterArtworks(pool, { text: "starry" }, artistMap);
    expect(found.map((item) => item.id)).toEqual(["2"]);
  });

  it("matches artist names", () => {
    const found = filterArtworks(pool, { text: "monet" }, artistMap);
    expect(found.map((item) => item.id)).toEqual(["1", "3"]);
  });
});
