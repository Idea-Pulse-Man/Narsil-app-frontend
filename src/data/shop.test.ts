import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyServerPrices,
  CANVAS_SIZES,
  PRICE_OFFSETS,
  priceForSize,
  priceFromId,
} from "./shop";

const FALLBACK = CANVAS_SIZES.map((s) => ({ ...s }));
const FALLBACK_OFFSETS = [...PRICE_OFFSETS];

afterEach(() => {
  CANVAS_SIZES.splice(0, CANVAS_SIZES.length, ...FALLBACK.map((s) => ({ ...s })));
  PRICE_OFFSETS.splice(0, PRICE_OFFSETS.length, ...FALLBACK_OFFSETS);
  vi.restoreAllMocks();
});

describe("live canvas prices", () => {
  it("replaces the fallback table with the server's", () => {
    const ok = applyServerPrices({
      sizes: [
        { size: "Small", dimensions: '12 × 16"', price: 65 },
        { size: "Medium", dimensions: '18 × 24"', price: 95 },
        { size: "Large", dimensions: '24 × 36"', price: 139 },
      ],
      offsets: [0, 4],
    });
    expect(ok).toBe(true);
    expect(CANVAS_SIZES.map((s) => s.price)).toEqual([65, 95, 139]);
    const from = priceFromId("met-436535");
    expect([65, 69]).toContain(from);
    expect(priceForSize(from, "Large")).toBe(139 + (from - 65));
  });

  it("keeps the fallback when the answer is incomplete", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ok = applyServerPrices({
      sizes: [{ size: "Small", dimensions: '12 × 16"', price: 65 }],
      offsets: [0, 5, 10],
    });
    expect(ok).toBe(false);
    expect(CANVAS_SIZES).toEqual(FALLBACK);
  });

  it("keeps the fallback when a price is not a positive number", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const ok = applyServerPrices({
      sizes: [
        { size: "Small", price: 0 },
        { size: "Medium", price: 89 },
        { size: "Large", price: 129 },
      ],
      offsets: [0, 5, 10],
    });
    expect(ok).toBe(false);
    expect(CANVAS_SIZES).toEqual(FALLBACK);
  });
});
