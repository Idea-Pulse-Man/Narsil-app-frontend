import { describe, expect, it } from "vitest";
import { sanitizeRemoteCatalog } from "./catalogValidate";

describe("sanitizeRemoteCatalog", () => {
  it("drops artworks whose artist is missing", () => {
    const result = sanitizeRemoteCatalog({
      artists: [{ id: "a1", name: "Monet", bio: "Painter", initials: "MO" }],
      artworks: [
        {
          id: "w1",
          title: "Water Lilies",
          image: "https://example.com/w1.jpg",
          artistId: "a1",
        },
        {
          id: "w2",
          title: "Orphan",
          image: "https://example.com/w2.jpg",
          artistId: "missing",
        },
      ],
      fypArtistCards: [],
    });

    expect(result?.artworks).toHaveLength(1);
    expect(result?.artworks[0]?.id).toBe("w1");
  });

  it("rejects catalogs with blank artist names or missing images", () => {
    expect(
      sanitizeRemoteCatalog({
        artists: [{ id: "a1", name: "   ", bio: "", initials: "" }],
        artworks: [
          {
            id: "w1",
            title: "Study",
            image: "https://example.com/w1.jpg",
            artistId: "a1",
          },
        ],
        fypArtistCards: [],
      }),
    ).toBeNull();

    expect(
      sanitizeRemoteCatalog({
        artists: [{ id: "a1", name: "Monet", bio: "", initials: "MO" }],
        artworks: [
          {
            id: "w1",
            title: "Study",
            image: "",
            artistId: "a1",
          },
        ],
        fypArtistCards: [],
      }),
    ).toBeNull();
  });

  it("derives initials and normalizes description", () => {
    const result = sanitizeRemoteCatalog({
      artists: [{ id: "a1", name: "Claude Monet", bio: "Bio", initials: "" }],
      artworks: [
        {
          id: "w1",
          title: "Study",
          image: "https://example.com/w1.jpg",
          artistId: "a1",
        },
      ],
      fypArtistCards: [],
    });

    expect(result?.artists[0]?.initials).toBe("CL");
    expect(result?.artworks[0]?.description).toBe("");
  });

  it("keeps museum and AI placard copy", () => {
    const result = sanitizeRemoteCatalog({
      artists: [{ id: "a1", name: "Giordano", bio: "", initials: "GI" }],
      artworks: [
        {
          id: "cma-1",
          title: "The Virgin and Child",
          image: "https://example.com/w1.jpg",
          artistId: "a1",
          description: "A Baroque altarpiece of the Virgin appearing to Saint Francis.",
          aiDescription: "Francis kneels as the Virgin and Child appear in a burst of light.",
        },
      ],
      fypArtistCards: [],
    });

    expect(result?.artworks[0]?.description).toContain("Baroque altarpiece");
    expect(result?.artworks[0]?.aiDescription).toContain("Francis kneels");
  });
});
