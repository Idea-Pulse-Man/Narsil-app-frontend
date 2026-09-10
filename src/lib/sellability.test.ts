import { describe, expect, it } from "vitest";
import {
  SELLABLE_ARTWORK_ID_PREFIXES,
  sellableArtworkOrFilter,
} from "./sellability";

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
