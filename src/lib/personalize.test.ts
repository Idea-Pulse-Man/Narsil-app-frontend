import { describe, expect, it } from "vitest";
import type { Artwork, Artist } from "@/data";
import { preferenceScore, prioritizeByTaste } from "./personalize";

function art(partial: Partial<Artwork> & Pick<Artwork, "id">): Artwork {
  return {
    title: partial.id,
    image: `https://example.com/${partial.id}.jpg`,
    artistId: "unknown",
    year: "1900",
    period: "Modern",
    medium: "Oil on canvas",
    source: "Test",
    accent: "#000",
    description: "",
    tags: [],
    category: "paintings",
    origin: "public-domain",
    ...partial,
  } as Artwork;
}

const artists: Record<string, Artist> = {
  "live-vg": {
    id: "live-vg",
    name: "Vincent van Gogh",
    initials: "VG",
    profileType: "historical",
    lifespan: "1853 – 1890",
    nationality: "Dutch",
    period: "Post-Impressionism",
    style: "Post-Impressionism",
    knownFor: "Starry Night",
    bio: "Dutch painter.",
    followers: 0,
    likes: 0,
    saves: 0,
  },
  "live-other": {
    id: "live-other",
    name: "Some Other Artist",
    initials: "SO",
    profileType: "historical",
    lifespan: "—",
    nationality: "—",
    period: "—",
    style: "—",
    knownFor: "—",
    bio: "—",
    followers: 0,
    likes: 0,
    saves: 0,
  },
};

describe("preferenceScore / prioritizeByTaste", () => {
  it("matches live catalog artists by name, not only mock ids", () => {
    const vg = art({
      id: "starry",
      artistId: "live-vg",
      period: "Post-Impressionism",
    });
    const other = art({ id: "other", artistId: "live-other" });

    const prefs = {
      artTypes: [],
      periods: [],
      empires: [],
      artists: ["Van Gogh"],
      interests: [],
    };

    expect(preferenceScore(vg, prefs, "strong", { artistMap: artists })).toBeGreaterThanOrEqual(100);
    expect(preferenceScore(other, prefs, "strong", { artistMap: artists })).toBe(0);
  });

  it("ranks favorite artists above period/empire-only matches", () => {
    const pool = [
      art({
        id: "japanese-print",
        artistId: "live-other",
        period: "Edo Period",
        empire: "Japanese",
        category: "japanese-art",
        tags: ["Ukiyo-e"],
      }),
      art({
        id: "van-gogh-work",
        artistId: "live-vg",
        period: "Post-Impressionism",
        category: "paintings",
      }),
      art({ id: "filler", artistId: "live-other", category: "paintings" }),
    ];

    const ranked = prioritizeByTaste(
      pool,
      {
        artTypes: ["Paintings"],
        periods: ["Japanese Art"],
        empires: ["Japanese"],
        artists: ["Van Gogh"],
        interests: [],
      },
      "strong",
      { artistMap: artists },
    );

    expect(ranked[0].id).toBe("van-gogh-work");
    expect(ranked[1].id).toBe("japanese-print");
  });

  it("puts Strong matches ahead of non-matches", () => {
    const pool = [
      art({ id: "popular-unrelated", artistId: "live-other", category: "paintings" }),
      art({
        id: "hokusai-wave",
        artistId: "live-other",
        period: "Edo Period",
        empire: "Japanese",
        category: "japanese-art",
        tags: ["Ukiyo-e"],
      }),
      art({ id: "another-painting", artistId: "live-other", category: "paintings" }),
    ];

    const ranked = prioritizeByTaste(
      pool,
      {
        artTypes: [],
        periods: ["Japanese Art"],
        empires: ["Japanese"],
        artists: [],
        interests: [],
      },
      "strong",
      { artistMap: artists },
    );

    expect(ranked[0].id).toBe("hokusai-wave");
  });

  it("leaves Normal mode unchanged", () => {
    const pool = [
      art({ id: "a" }),
      art({ id: "b", artistId: "live-vg" }),
    ];
    const ranked = prioritizeByTaste(
      pool,
      {
        artTypes: [],
        periods: [],
        empires: [],
        artists: ["Van Gogh"],
        interests: [],
      },
      "normal",
      { artistMap: artists },
    );
    expect(ranked.map((a) => a.id)).toEqual(["a", "b"]);
  });
});
