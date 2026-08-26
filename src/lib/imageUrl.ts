/**
 * Build a display-sized image URL when the host supports width parameters.
 * Wikimedia Commons honours `?width=`; S3 has no native resize, so grids go
 * through wsrv.nl. The For You feed uses the staged S3 file (~843px) directly
 * — those objects are immutable and cache for a year.
 */

export function isS3Url(src: string): boolean {
  return /^https?:\/\/[^/]*\.amazonaws\.com\//.test(src);
}

function wsrvUrl(src: string, width: number, quality: number): string {
  const w = Math.min(1280, Math.max(24, Math.round(width)));
  const q = Math.min(90, Math.max(35, Math.round(quality)));
  return `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=${w}&output=webp&q=${q}&we`;
}

/**
 * URL that can be `fetch(..., { mode: "cors" })`'d when the source host (e.g.
 * S3) does not send Access-Control-Allow-Origin for our Capacitor / Vercel
 * origins. Display `<img>` can still use the raw S3 URL.
 */
export function corsFetchImageUrl(src: string, cssPx = 843): string {
  if (!isS3Url(src)) return src;
  const w = Math.min(1280, Math.max(32, Math.round(cssPx)));
  return wsrvUrl(src, w, 72);
}

export function sizedImageUrl(src: string, cssPx: number): string {
  // Small list thumbs stay tiny so the first screen of an era (or search)
  // downloads quickly. Larger tiles (profile grid) keep a sharper 2× request.
  const small = cssPx <= 160;
  const w = small
    ? Math.min(192, Math.max(48, Math.round(cssPx * 1.5)))
    : Math.min(640, Math.max(32, Math.round(cssPx * 2)));
  const quality = small ? 55 : 72;

  if (src.includes("commons.wikimedia.org/wiki/Special:FilePath")) {
    if (/[?&]width=\d+/.test(src)) {
      return src.replace(/([?&]width=)\d+/, `$1${w}`);
    }
    const sep = src.includes("?") ? "&" : "?";
    return `${src}${sep}width=${w}`;
  }

  if (isS3Url(src)) {
    return wsrvUrl(src, w, quality);
  }

  if (src.includes("wsrv.nl") && /[?&]w=\d+/.test(src)) {
    return src.replace(/([?&]w=)\d+/, `$1${w}`);
  }

  return src;
}

/**
 * Viewer / zoom canvas: a compressed WebP near device width. Much smaller
 * than the staged ~843px JPEG on first open; pinch-zoom still has enough pixels.
 */
export function viewerImageUrl(src: string): string {
  if (!src || src.startsWith("blob:")) return src;
  if (isS3Url(src)) return wsrvUrl(src, 720, 70);
  return sizedImageUrl(src, 360);
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
    return wsrvUrl(src, 24, 40);
  }
  return null;
}

/** Avatar-sized variant — caps width so portrait grids don't pull huge files. */
export function sizedAvatarUrl(src: string, cssPx: number): string {
  return sizedImageUrl(src, Math.min(80, cssPx));
}
