/**
 * Build a display-sized image URL when the host supports width parameters.
 * Wikimedia Commons honours `?width=`; S3 has no native resize, so grids go
 * through wsrv.nl. The For You feed uses the staged S3 file (~843px) directly
 * — those objects are immutable and cache for a year.
 */

function isS3Url(src: string): boolean {
  return /^https?:\/\/[^/]*\.amazonaws\.com\//.test(src);
}

export function sizedImageUrl(src: string, cssPx: number): string {
  const w = Math.min(640, Math.max(32, Math.round(cssPx * 2)));

  if (src.includes("commons.wikimedia.org/wiki/Special:FilePath")) {
    if (/[?&]width=\d+/.test(src)) {
      return src.replace(/([?&]width=)\d+/, `$1${w}`);
    }
    const sep = src.includes("?") ? "&" : "?";
    return `${src}${sep}width=${w}`;
  }

  // S3-hosted museum images are stored full-size and have no native resizing,
  // so grids would download the whole ~843px JPEG per tile (slow, and prone to
  // timeouts when many load at once). Route them through the wsrv.nl image CDN
  // to fetch a small WebP thumbnail instead. If the CDN is ever unreachable,
  // BlurImage's onError falls back to the original S3 URL, so this never makes
  // loading less reliable than before.
  if (isS3Url(src)) {
    return `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=${w}&output=webp&we`;
  }

  if (src.includes("wsrv.nl") && /[?&]w=\d+/.test(src)) {
    return src.replace(/([?&]w=)\d+/, `$1${w}`);
  }

  return src;
}

/**
 * Tiny (~24px) stand-in shown blurred while the full image decodes. Works for
 * Wikimedia (`?width=`), S3 (via wsrv.nl), and already-resized wsrv URLs.
 */
export function previewImageUrl(src: string): string | null {
  if (!src || src.startsWith("blob:")) return null;

  if (/[?&]width=\d+/.test(src)) {
    return src.replace(/([?&]width=)\d+/, "$124");
  }
  if (src.includes("wsrv.nl") && /[?&]w=\d+/.test(src)) {
    return src.replace(/([?&]w=)\d+/, "$124");
  }
  if (isS3Url(src)) {
    return `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=24&output=webp&q=40`;
  }
  return null;
}

/** Avatar-sized variant — caps width so portrait grids don't pull huge files. */
export function sizedAvatarUrl(src: string, cssPx: number): string {
  const w = Math.min(160, Math.max(32, Math.round(cssPx * 2)));
  return sizedImageUrl(src, w / 2);
}
