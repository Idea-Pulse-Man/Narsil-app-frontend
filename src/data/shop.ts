import { useEffect, useSyncExternalStore } from "react";
import { artworks } from "./artworks";
import { API_URL } from "@/lib/api";
import { ngrokFetch } from "@/lib/ngrok";

/**
 * Canvas print pricing. The backend's
 * `narsil-museum-backend/src/services/pricing.ts` is the only place prices
 * are set: checkout charges from it, and the app loads the same table from
 * GET /api/prices (see `useCanvasPrices`). The values below are just the
 * offline fallback until that answer arrives — they are overwritten in place.
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

/** Per-artwork price steps on top of every size's base (server: PRICE_OFFSETS). */
export const PRICE_OFFSETS: number[] = [0, 5, 10];

// ── Live prices from the backend ─────────────────────────────────────────────

let priceVersion = 0;
let priceRequest: Promise<void> | null = null;
const priceListeners = new Set<() => void>();

export interface PriceResponse {
  sizes?: { size?: string; dimensions?: string; price?: number }[];
  offsets?: number[];
}

/** Overwrite the fallback table with the server's, if the answer is sane. */
export function applyServerPrices(body: PriceResponse): boolean {
  const sizes = CANVAS_SIZES.map((local) => {
    const remote = body.sizes?.find((s) => s.size === local.size);
    return remote && typeof remote.price === "number" && remote.price > 0
      ? { ...local, price: remote.price, dimensions: remote.dimensions || local.dimensions }
      : null;
  });
  const offsets = body.offsets;
  if (
    sizes.some((s) => s === null) ||
    !Array.isArray(offsets) ||
    offsets.length === 0 ||
    offsets.some((o) => typeof o !== "number" || o < 0)
  ) {
    console.warn("Canvas prices: unexpected /api/prices answer; keeping fallback.");
    return false;
  }
  CANVAS_SIZES.splice(0, CANVAS_SIZES.length, ...(sizes as CanvasOption[]));
  PRICE_OFFSETS.splice(0, PRICE_OFFSETS.length, ...offsets);
  return true;
}

/** Fetch the price table once per app session (retried after a failure). */
function loadCanvasPrices(): Promise<void> {
  priceRequest ??= ngrokFetch(`${API_URL}/api/prices`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if (applyServerPrices((await res.json()) as PriceResponse)) {
        priceVersion += 1;
        priceListeners.forEach((notify) => notify());
      }
    })
    .catch((err) => {
      console.warn("Canvas prices: using fallback table.", err);
      priceRequest = null;
    });
  return priceRequest;
}

/**
 * Subscribe a component to the live price table: loads it from the backend
 * on first use and re-renders when it lands. Call it in any component that
 * shows a canvas price; the returned version changes whenever the table
 * does, so list it in the deps of any memo that computes prices.
 */
export function useCanvasPrices(): number {
  const version = useSyncExternalStore(
    (notify) => {
      priceListeners.add(notify);
      return () => priceListeners.delete(notify);
    },
    () => priceVersion,
  );
  useEffect(() => {
    void loadCanvasPrices();
  }, []);
  return version;
}

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
  return CANVAS_SIZES[0].price + PRICE_OFFSETS[h % PRICE_OFFSETS.length];
};
