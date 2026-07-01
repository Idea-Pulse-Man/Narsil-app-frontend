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
 * ngrok blocks <img src="..."> with an HTML warning page. Fetch with the bypass
 * header and serve a blob URL instead.
 */
export function resolveNgrokImageSrc(src: string): Promise<string> {
  if (!isNgrokUrl(src)) {
    return Promise.resolve(src);
  }

  return ngrokFetch(src)
    .then((res) => {
      if (!res.ok) throw new Error(`Image fetch failed: ${res.status}`);
      return res.blob();
    })
    .then((blob) => URL.createObjectURL(blob));
}
