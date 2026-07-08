import { API_URL } from "./api";

/**
 * Extract the S3 object key from a public bucket URL, or null when the URL is
 * not one of our museum images.
 */
export function s3ObjectKey(src: string): string | null {
  try {
    const url = new URL(src);
    if (!url.hostname.includes("amazonaws.com")) return null;
    const key = url.pathname.replace(/^\/+/, "");
    return key.startsWith("artworks/") ? key : null;
  } catch {
    return null;
  }
}

/** Same-origin proxy URL for a public S3 museum image (CORS-safe for fetch). */
export function proxiedS3Url(key: string, cssPx?: number): string {
  const w = cssPx
    ? Math.min(640, Math.max(32, Math.round(cssPx * 2)))
    : undefined;
  const base = `${API_URL}/api/asset/${key}`;
  return w ? `${base}?w=${w}` : base;
}

/** Rewrite a stored S3 URL to the backend asset proxy (full size). */
export function museumImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  const key = s3ObjectKey(url);
  if (key) return proxiedS3Url(key);
  return url;
}

function isProxiedAsset(src: string): boolean {
  return src.includes("/api/asset/");
}

/**
 * Build a display-sized image URL when the host supports width parameters.
 * Wikimedia Commons honours `?width=`; museum S3 images are proxied through
 * our backend so thumbnails load reliably without third-party CDNs or CORS
 * failures.
 */
export function sizedImageUrl(src: string, cssPx: number): string {
  const w = Math.min(640, Math.max(32, Math.round(cssPx * 2)));

  if (isProxiedAsset(src)) {
    const url = new URL(src);
    url.searchParams.set("w", String(w));
    return url.toString();
  }

  if (src.includes("commons.wikimedia.org/wiki/Special:FilePath")) {
    if (/[?&]width=\d+/.test(src)) {
      return src.replace(/([?&]width=)\d+/, `$1${w}`);
    }
    const sep = src.includes("?") ? "&" : "?";
    return `${src}${sep}width=${w}`;
  }

  const key = s3ObjectKey(src);
  if (key) return proxiedS3Url(key, cssPx);

  return src;
}

/** Avatar-sized variant — caps width so portrait grids don't pull huge files. */
export function sizedAvatarUrl(src: string, cssPx: number): string {
  const w = Math.min(160, Math.max(32, Math.round(cssPx * 2)));
  return sizedImageUrl(src, w / 2);
}

/**
 * URL suitable for client-side `fetch()` (downloads). S3 museum images are
 * routed through the backend proxy; other hosts are returned unchanged.
 */
export function fetchableImageUrl(src: string): string {
  if (isProxiedAsset(src)) {
    const url = new URL(src);
    url.searchParams.delete("w");
    return url.toString();
  }
  const key = s3ObjectKey(src);
  if (key) return proxiedS3Url(key);
  return fullResUrl(src);
}

function fullResUrl(src: string): string {
  if (src.includes("commons.wikimedia.org/wiki/Special:FilePath")) {
    return src.replace(/([?&])width=\d+/g, "$1").replace(/[?&]$/, "");
  }
  return src;
}
