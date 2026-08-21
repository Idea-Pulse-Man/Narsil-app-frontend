/**
 * Persist the first few feed images so a return visit can paint the opening
 * card from disk instead of S3.
 *
 * Two layers:
 *  1. `new Image()` warms the HTTP cache (S3 objects are immutable for a year).
 *  2. Cache API stores the bytes when CORS allows — used as a blob URL next
 *     launch if the HTTP cache was evicted (common in WKWebView).
 */

const CACHE_NAME = "narsil-feed-images-v1";
const MAX_CACHED = 8;

const blobUrls = new Map<string, string>();

function canUseCacheApi(): boolean {
  return typeof caches !== "undefined";
}

async function persist(url: string): Promise<void> {
  if (!canUseCacheApi()) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    if (await cache.match(url)) return;
    const res = await fetch(url, { mode: "cors", credentials: "omit" });
    if (res.ok) await cache.put(url, res);
  } catch {
    /* CORS or quota — HTTP cache from the Image() warm is enough. */
  }
}

function warmHttpCache(url: string): void {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
}

/** Download and remember the first feed images. Safe to call repeatedly. */
export function warmFeedImages(urls: string[]): void {
  const unique = [...new Set(urls.filter(Boolean))].slice(0, MAX_CACHED);
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
    const blob = await hit.blob();
    const objectUrl = URL.createObjectURL(blob);
    blobUrls.set(src, objectUrl);
    return objectUrl;
  } catch {
    return src;
  }
}
