/**
 * Build a display-sized image URL when the host supports width parameters.
 * Wikimedia `Special:FilePath` is a slow HTML redirect (often several seconds
 * before the bytes start), so those URLs are rewritten to `thumb.php`, which
 * returns the image directly. S3 has no native resize, so grids go through
 * wsrv.nl. The For You feed uses the staged S3 file (~843px) directly — those
 * objects are immutable and cache for a year.
 */

const WIKIMEDIA_FILE = /commons\.wikimedia\.org\/wiki\/Special:FilePath\/([^?#]+)/;

function wikimediaFile(src: string): string | null {
  const match = src.match(WIKIMEDIA_FILE);
  return match ? match[1] : null;
}

function filepathWidth(src: string): number | null {
  const match = src.match(/[?&]width=(\d+)/);
  return match ? Number(match[1]) : null;
}

/** Direct Commons thumbnail. `file` is the already-encoded Special:FilePath segment. */
function wikimediaThumbUrl(file: string, width: number): string {
  const w = Math.min(1280, Math.max(24, Math.round(width)));
  return `https://commons.wikimedia.org/w/thumb.php?f=${file}&w=${w}`;
}

/**
 * URL the `<img>` should actually request. Wikimedia file-path links become
 * a direct thumbnail; everything else is unchanged. Pass `cssPx` to cap the
 * thumbnail to a slot (quiz card) instead of the URL's stored width.
 */
export function displayImageUrl(src: string, cssPx?: number): string {
  if (!src || src.startsWith("blob:")) return src;
  const file = wikimediaFile(src);
  if (!file) return src;
  const w = cssPx
    ? Math.min(960, Math.max(64, Math.round(cssPx * 2)))
    : (filepathWidth(src) ?? 843);
  return wikimediaThumbUrl(file, w);
}

export function isS3Url(src: string): boolean {
  return (
    /^https?:\/\/[^/]*\.amazonaws\.com\//.test(src) ||
    /^https?:\/\/[^/]*\.cloudfront\.net\//.test(src)
  );
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

  const file = wikimediaFile(src);
  if (file) return wikimediaThumbUrl(file, w);

  if (src.includes("/w/thumb.php") && /[?&]w=\d+/.test(src)) {
    return src.replace(/([?&]w=)\d+/, `$1${w}`);
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

  const file = wikimediaFile(src);
  if (file) return wikimediaThumbUrl(file, 32);

  if (/[?&]width=\d+/.test(src)) {
    return src.replace(/([?&]width=)\d+/, "$124");
  }
  if (src.includes("/w/thumb.php") && /[?&]w=\d+/.test(src)) {
    return src.replace(/([?&]w=)\d+/, "$132");
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
