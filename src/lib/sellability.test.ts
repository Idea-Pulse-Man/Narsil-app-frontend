import { describe, expect, it } from "vitest";
import type { Artwork } from "@/data";
import {
  SELLABLE_ARTWORK_ID_PREFIXES,
  isCanvasPrintSuitable,
  isCanvasSellable,
  sellableArtworkOrFilter,
} from "./sellability";

function art(overrides: Partial<Artwork>): Artwork {
  return {
    id: "met-1",
    title: "Landscape",
    artistId: "a1",
    year: "1880",
    period: "Modern",
    medium: "Oil on canvas",
    source: "The Met",
    image: "https://example.com/a.jpg",
    accent: "#000",
    description: "",
    tags: [],
    category: "paintings",
    origin: "public-domain",
    ...overrides,
  };
}

describe("sellableArtworkOrFilter", () => {
  it("includes for_sale and licensed museum prefixes, not Wellcome or Flickr", () => {
    const clause = sellableArtworkOrFilter();
    expect(clause.startsWith("for_sale.eq.true")).toBe(true);
    expect(SELLABLE_ARTWORK_ID_PREFIXES).toEqual(["met", "rijks", "aic", "cma"]);
    for (const prefix of SELLABLE_ARTWORK_ID_PREFIXES) {
      expect(clause).toContain(`id.like.${prefix}-*`);
    }
    expect(clause).not.toContain("wc-");
    expect(clause).not.toContain("flickr-");
  });
});

describe("isCanvasPrintSuitable", () => {
  it("allows paintings and prints", () => {
    expect(isCanvasPrintSuitable(art({}))).toBe(true);
    expect(
      isCanvasPrintSuitable(
        art({
          category: "etching-writing-books",
          medium: "Woodblock print",
          title: "Folio 18 from a Chan...",
        }),
      ),
    ).toBe(true);
  });

  it("allows still-life paintings of objects", () => {
    expect(
      isCanvasPrintSuitable(
        art({ title: "Basket of Apples", medium: "Oil on canvas" }),
      ),
    ).toBe(true);
    expect(
      isCanvasPrintSuitable(
        art({ title: "Van Gogh's Chair", medium: "Oil on canvas" }),
      ),
    ).toBe(true);
    expect(
      isCanvasPrintSuitable(
        art({
          title: "Judith with a sword holding the head of Holofernes",
          medium: "Oil on canvas",
        }),
      ),
    ).toBe(true);
  });

  it("rejects sculpture and pottery categories", () => {
    expect(
      isCanvasPrintSuitable(art({ category: "sculptures", medium: "Marble" })),
    ).toBe(false);
    expect(
      isCanvasPrintSuitable(art({ category: "pottery", medium: "Ceramic" })),
    ).toBe(false);
  });

  it("rejects empire-tagged vessels and sculpture by medium or title", () => {
    expect(
      isCanvasPrintSuitable(
        art({
          category: "greek",
          medium: "Terracotta",
          title: "Covered Pot",
        }),
      ),
    ).toBe(false);
    expect(
      isCanvasPrintSuitable(
        art({
          category: "roman",
          medium: "Marble",
          title: "Portrait Bust",
        }),
      ),
    ).toBe(false);
  });

  it("rejects crafts and 3D museum pieces that cannot ship as canvas", () => {
    expect(
      isCanvasPrintSuitable(
        art({
          title: "Sifting Basket",
          medium: "Black ash and oak",
          tags: ["Basketry", "Basket"],
        }),
      ),
    ).toBe(false);
    expect(
      isCanvasPrintSuitable(
        art({
          title: "Armchair",
          medium: "Mahogany",
          tags: ["Furniture"],
        }),
      ),
    ).toBe(false);
    expect(
      isCanvasPrintSuitable(
        art({
          title: "Necklace",
          medium: "Gold",
          tags: ["Jewelry"],
        }),
      ),
    ).toBe(false);
    expect(
      isCanvasPrintSuitable(
        art({
          title: "Furisode",
          medium: "Silk, metallic thread",
          tags: ["Costumes", "Kimono"],
        }),
      ),
    ).toBe(false);
    expect(
      isCanvasPrintSuitable(
        art({
          title: "Decorative Plaque: Ram-Headed Sphinxes",
          medium: "Ivory",
          tags: ["Ivories"],
        }),
      ),
    ).toBe(false);
    expect(
      isCanvasPrintSuitable(
        art({
          title: "Vajrapani Embroidered Mount with Garuda",
          medium: "Silk embroidery",
          tags: ["Textiles"],
        }),
      ),
    ).toBe(false);
  });
});

describe("isCanvasSellable", () => {
  it("still requires legal allowlist and rejects pots", () => {
    expect(isCanvasSellable(art({ id: "met-99" }))).toBe(true);
    expect(
      isCanvasSellable(
        art({
          id: "met-pot",
          category: "pottery",
          medium: "Silver",
          title: "Covered Pot",
        }),
      ),
    ).toBe(false);
  });
});
