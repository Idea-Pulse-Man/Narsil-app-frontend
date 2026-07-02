/** True when the URL is served through ngrok (free tier shows a browser warning without this). */
export function isNgrokUrl(url: string): boolean {
  return /ngrok/i.test(url);
}

export const NGROK_HEADERS: HeadersInit = {
  "ngrok-skip-browser-warning": "true",
};

/** fetch() that bypasses ngrok's free-tier browser interstitial when needed. */
export function ngrokFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;

  if (!isNgrokUrl(url)) {
    return fetch(input, init);
  }

  return fetch(input, {
    ...init,
    headers: { ...NGROK_HEADERS, ...init?.headers },
  });
}

/**
 * In-memory cache of resolved blob URLs, keyed by the original ngrok source.
 * We cache the *promise* so concurrent callers for the same image share a single
 * fetch, and repeat visits (e.g. navigating away from For You / Buy and back)
 * reuse the already-decoded blob instead of re-downloading every image.
 *
 * The blob URLs intentionally live for the whole session — callers must NOT
 * revoke them, since the same URL is handed out to every mount of that image.
 */
const blobCache = new Map<string, Promise<string>>();

/**
 * ngrok blocks <img src="..."> with an HTML warning page. Fetch with the bypass
 * header and serve a blob URL instead. Results are cached per session so an
 * image is only downloaded and decoded once.
 */
export function resolveNgrokImageSrc(src: string): Promise<string> {
  if (!isNgrokUrl(src)) {
    return Promise.resolve(src);
  }

  const cached = blobCache.get(src);
  if (cached) return cached;

  const pending = ngrokFetch(src)
    .then((res) => {
      if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
      return res.blob();
    })
    .then((blob) => URL.createObjectURL(blob))
    .catch((err) => {
      // Don't cache failures — allow a later retry to re-fetch.
      blobCache.delete(src);
      throw err;
    });

  blobCache.set(src, pending);
  return pending;
}
