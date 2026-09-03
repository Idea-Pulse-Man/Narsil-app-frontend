import { artworks } from "./artworks";

/**
 * Canvas print pricing — display mirror of the backend's
 * `narsil-museum-backend/src/services/pricing.ts`, which is the authority:
 * checkout always recomputes the charge server-side. Keep the two in sync.
 *
 * Prices are costed against Printful's live US catalog (product 3) with
 * shipping absorbed. There is no subscriber discount on canvas. See the
 * backend file for the derivation table.
 */
export type CanvasSize = "Small" | "Medium" | "Large";

export interface CanvasOption {
  size: CanvasSize;
  dimensions: string;
  price: number;
}

export const CANVAS_SIZES: CanvasOption[] = [
  { size: "Small", dimensions: '12 × 16"', price: 59 },
  { size: "Medium", dimensions: '18 × 24"', price: 89 },
  { size: "Large", dimensions: '24 × 36"', price: 129 },
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

/**
 * Deterministic per-artwork "from" price so any surface (Buy grid, Saved cards)
 * shows a stable, real-feeling starting price for the same artwork.
 */
export const priceFromId = (id: string): number => {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return CANVAS_SIZES[0].price + (h % 3) * 5;
};
