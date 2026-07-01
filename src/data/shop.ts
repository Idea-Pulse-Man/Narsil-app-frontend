import { artworks } from "./artworks";

/**
 * v1 Buy model — canvas prints only. The client wants canvas buying but is
 * unsure about fulfillment, so pricing is illustrative and checkout is a
 * "coming soon" interest capture (no payment, no warehouse). See BuyView.
 */
export type CanvasSize = "Small" | "Medium" | "Large";

export interface CanvasOption {
  size: CanvasSize;
  dimensions: string;
  price: number;
}

export const CANVAS_SIZES: CanvasOption[] = [
  { size: "Small", dimensions: '12 × 16"', price: 59 },
  { size: "Medium", dimensions: '18 × 24"', price: 99 },
  { size: "Large", dimensions: '24 × 36"', price: 149 },
];

export interface CanvasProduct {
  id: string;
  artworkId: string;
  /** Slight per-artwork price variance so the grid feels real. */
  priceFrom: number;
}

export const canvasProducts: CanvasProduct[] = artworks.map((artwork, index) => ({
  id: `canvas-${artwork.id}`,
  artworkId: artwork.id,
  priceFrom: CANVAS_SIZES[0].price + (index % 3) * 5,
}));

export const priceForSize = (basePriceFrom: number, size: CanvasSize): number => {
  const offset = basePriceFrom - CANVAS_SIZES[0].price;
  const option = CANVAS_SIZES.find((s) => s.size === size) ?? CANVAS_SIZES[0];
  return option.price + offset;
};
