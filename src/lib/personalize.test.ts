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
    expect(ranked[2].id).toBe("filler");
  });

  it("mixes favorite-artist works with other art so the feed is not a streak", () => {
    const pool = [
      ...Array.from({ length: 6 }, (_, i) =>
        art({ id: `vg-${i}`, artistId: "live-vg" }),
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        art({ id: `other-${i}`, artistId: `other-${i}` }),
      ),
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
      "strong",
      { artistMap: artists },
    );

    const firstEight = ranked.slice(0, 8);
    const vgCount = firstEight.filter((a) => a.artistId === "live-vg").length;
    expect(vgCount).toBeGreaterThan(0);
    expect(vgCount).toBeLessThan(8);

    for (let i = 0; i < firstEight.length - 1; i++) {
      const a = firstEight[i].artistId === "live-vg";
      const b = firstEight[i + 1].artistId === "live-vg";
      expect(a && b).toBe(false);
    }
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

  it("rotates which favorite-artist work opens the feed when a seed is given", () => {
    const pool = [
      ...Array.from({ length: 8 }, (_, i) =>
        art({ id: `vg-${i}`, artistId: "live-vg" }),
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        art({ id: `other-${i}`, artistId: "live-other" }),
      ),
    ];
    const prefs = {
      artTypes: [],
      periods: [],
      empires: [],
      artists: ["Van Gogh"],
      interests: [] as string[],
    };

    const unseeded = prioritizeByTaste(pool, prefs, "strong", {
      artistMap: artists,
    });
    expect(unseeded[0].id).toBe("vg-0");

    const firsts = new Set<string>();
    for (const seed of [1, 2, 3, 7, 11, 99]) {
      const ranked = prioritizeByTaste(pool, prefs, "strong", {
        artistMap: artists,
        seed,
      });
      expect(ranked[0].artistId).toBe("live-vg");
      firsts.add(ranked[0].id);
    }
    expect(firsts.size).toBeGreaterThan(1);
  });
});
