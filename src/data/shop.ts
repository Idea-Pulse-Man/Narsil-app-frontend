import { useEffect, useSyncExternalStore } from "react";
import { artworks } from "./artworks";
import { API_URL } from "@/lib/api";
import { ngrokFetch } from "@/lib/ngrok";

/**
 * Print pricing (canvas + poster). The backend's
 * `narsil-museum-backend/src/services/pricing.ts` is the only place prices
 * are set: checkout charges from it, and the app loads the same tables from
 * GET /api/prices (see `useCanvasPrices`). The values below are just the
 * offline fallback until that answer arrives — they are overwritten in place.
 *
 * Both products come in the same three sizes. Shipping is absorbed; there is
 * no subscriber discount. An artist's own work is sold as canvas only, and
 * its Small canvas has its own price (ARTIST_ORIGINAL_PRICES).
 */
export type CanvasSize = "Small" | "Medium" | "Large";
export type PrintProduct = "canvas" | "poster";

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

export const POSTER_SIZES: CanvasOption[] = [
  { size: "Small", dimensions: '12 × 16"', price: 29 },
  { size: "Medium", dimensions: '18 × 24"', price: 35 },
  { size: "Large", dimensions: '24 × 36"', price: 45 },
];

/** Sizes per product (the arrays above, updated in place from the server). */
export const PRODUCT_SIZES: Record<PrintProduct, CanvasOption[]> = {
  canvas: CANVAS_SIZES,
  poster: POSTER_SIZES,
};

export const PRODUCT_LABELS: Record<PrintProduct, string> = {
  canvas: "Canvas",
  poster: "Poster",
};

/** Canvas base prices that differ for an artist's own work. */
export const ARTIST_ORIGINAL_PRICES: Partial<Record<CanvasSize, number>> = {
  Small: 69,
};

/** Which products an artwork of this origin can be ordered as. */
export function productsFor(origin?: string): PrintProduct[] {
  return origin === "artist-original" ? ["canvas"] : ["canvas", "poster"];
}

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

type RemoteSizes = { size?: string; dimensions?: string; price?: number }[];

export interface PriceResponse {
  /** Canvas sizes (every server version sends this). */
  sizes?: RemoteSizes;
  offsets?: number[];
  products?: Partial<Record<PrintProduct, { sizes?: RemoteSizes }>>;
  artistOriginal?: { canvas?: Partial<Record<CanvasSize, number>> };
}

/** Merge one remote size table over a local one; null when incomplete. */
function mergeSizes(local: CanvasOption[], remote?: RemoteSizes): CanvasOption[] | null {
  const merged = local.map((option) => {
    const r = remote?.find((s) => s.size === option.size);
    return r && typeof r.price === "number" && r.price > 0
      ? { ...option, price: r.price, dimensions: r.dimensions || option.dimensions }
      : null;
  });
  return merged.some((m) => m === null) ? null : (merged as CanvasOption[]);
}

/** Overwrite the fallback tables with the server's, if the answer is sane. */
export function applyServerPrices(body: PriceResponse): boolean {
  const canvas = mergeSizes(CANVAS_SIZES, body.products?.canvas?.sizes ?? body.sizes);
  const offsets = body.offsets;
  if (
    !canvas ||
    !Array.isArray(offsets) ||
    offsets.length === 0 ||
    offsets.some((o) => typeof o !== "number" || o < 0)
  ) {
    console.warn("Canvas prices: unexpected /api/prices answer; keeping fallback.");
    return false;
  }
  CANVAS_SIZES.splice(0, CANVAS_SIZES.length, ...canvas);
  PRICE_OFFSETS.splice(0, PRICE_OFFSETS.length, ...offsets);

  // Older servers don't send posters / artist prices — keep the fallback then.
  const poster = mergeSizes(POSTER_SIZES, body.products?.poster?.sizes);
  if (poster) POSTER_SIZES.splice(0, POSTER_SIZES.length, ...poster);
  const special = body.artistOriginal?.canvas;
  if (special && typeof special === "object") {
    for (const key of Object.keys(ARTIST_ORIGINAL_PRICES) as CanvasSize[]) {
      delete ARTIST_ORIGINAL_PRICES[key];
    }
    for (const [key, value] of Object.entries(special)) {
      if (typeof value === "number" && value > 0) {
        ARTIST_ORIGINAL_PRICES[key as CanvasSize] = value;
      }
    }
  }
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
 * shows a print price; the returned version changes whenever the table
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

/** Base price for a product + size, before the per-artwork offset. */
export function basePrice(
  product: PrintProduct,
  size: CanvasSize,
  origin?: string,
): number {
  if (origin === "artist-original" && product === "canvas") {
    const special = ARTIST_ORIGINAL_PRICES[size];
    if (special) return special;
  }
  const table = PRODUCT_SIZES[product];
  return (table.find((s) => s.size === size) ?? table[0]).price;
}

function offsetFor(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i += 1) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return PRICE_OFFSETS[h % PRICE_OFFSETS.length];
}

/**
 * Price of one size, given the artwork's "from" price (which carries its
 * per-artwork offset). Product and origin default to a museum canvas.
 */
export const priceForSize = (
  basePriceFrom: number,
  size: CanvasSize,
  product: PrintProduct = "canvas",
  origin?: string,
): number => {
  const offset = basePriceFrom - basePrice(product, "Small", origin);
  return basePrice(product, size, origin) + offset;
};

/**
 * Deterministic per-artwork "from" price (Small size) so any surface (Buy
 * grid, Saved cards) shows a stable starting price for the same artwork.
 */
export const priceFromId = (
  id: string,
  product: PrintProduct = "canvas",
  origin?: string,
): number => basePrice(product, "Small", origin) + offsetFor(id);
