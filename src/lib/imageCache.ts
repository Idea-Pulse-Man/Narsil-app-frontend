/**
 * Persist the first few feed images so a return visit can paint the opening
 * card from disk instead of S3.
 *
 * Two layers:
 *  1. `new Image()` warms the HTTP cache (S3 objects are immutable for a year).
 *  2. Cache API stores the bytes when a CORS-safe fetch succeeds — used as a
 *     blob URL next launch if the HTTP cache was evicted (common in WKWebView).
 *
 * S3 is fetched via wsrv.nl for (2): the bucket often lacks CORS for Capacitor
 * (`capacitor://localhost` / `https://localhost`) and Vercel, and a direct
 * `fetch` would spam the console even when caught.
 */

import { corsFetchImageUrl, displayImageUrl } from "./imageUrl";

const CACHE_NAME = "narsil-feed-images-v1";
const MAX_CACHED = 4;

const blobUrls = new Map<string, string>();
/** Original artwork URLs whose bytes are in the HTTP or Cache API store. */
const warmedUrls = new Set<string>();

/** Mark an artwork URL as fetched so grids can sort it first and skip resize hops. */
export function markImageWarmed(url: string): void {
  if (url) warmedUrls.add(url);
}

export function isImageWarmed(url: string): boolean {
  return Boolean(url && warmedUrls.has(url));
}

function canUseCacheApi(): boolean {
  return typeof caches !== "undefined";
}

async function persist(url: string): Promise<void> {
  if (!canUseCacheApi()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    if (await cache.match(url)) return;
    const res = await fetch(corsFetchImageUrl(url), {
      mode: "cors",
      credentials: "omit",
    });
    if (res.ok) await cache.put(url, res);
  } catch {
    /* Network or quota — HTTP cache from the Image() warm is enough. */
  }
}

function warmHttpCache(url: string): void {
  const img = new Image();
  img.decoding = "async";
  img.onload = () => markImageWarmed(url);
  img.src = displayImageUrl(url);
}

/** Download and remember the first feed images. Safe to call repeatedly. */
export function warmFeedImages(urls: string[], limit = MAX_CACHED): void {
  const unique = [...new Set(urls.filter(Boolean))].slice(0, limit);
  for (const url of unique) {
    warmHttpCache(url);
    void persist(url);
  }
}

/**
 * Return a blob URL if this image was cached on a previous launch; otherwise
 * the original `src` (which may still hit the HTTP cache).
 */
export async function resolveCachedImage(src: string): Promise<string> {
  if (!src || src.startsWith("blob:")) return src;
  const existing = blobUrls.get(src);
  if (existing) return existing;
  if (!canUseCacheApi()) return src;

  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(src);
    if (!hit) return src;
    markImageWarmed(src);
    const blob = await hit.blob();
    const objectUrl = URL.createObjectURL(blob);
    blobUrls.set(src, objectUrl);
    return objectUrl;
  } catch {
    return src;
  }
}

/**
 * Resolve once every URL has loaded (or failed), or after `timeoutMs` —
 * whichever comes first. Used to hold a loader until the first quiz artworks
 * are in the HTTP cache, without ever stranding the user on a slow network.
 */
export function preloadImages(urls: string[], timeoutMs = 8000): Promise<void> {
  const unique = [...new Set(urls.filter(Boolean))];
  if (unique.length === 0) return Promise.resolve();
  const loads = unique.map(
    (url) =>
      new Promise<void>((resolve) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = img.onerror = () => resolve();
        img.src = url;
      }),
  );
  return Promise.race([
    Promise.all(loads).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}
