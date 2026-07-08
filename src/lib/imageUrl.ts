/**
 * Build a display-sized image URL when the host supports width parameters.
 * Wikimedia Commons honours `?width=`; S3 and other static hosts are returned as-is.
 */
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
  if (/^https?:\/\/[^/]*\.amazonaws\.com\//.test(src)) {
    return `https://wsrv.nl/?url=${encodeURIComponent(src)}&w=${w}&output=webp&we`;
  }

  return src;
}

/** Avatar-sized variant — caps width so portrait grids don't pull huge files. */
export function sizedAvatarUrl(src: string, cssPx: number): string {
  const w = Math.min(160, Math.max(32, Math.round(cssPx * 2)));
  return sizedImageUrl(src, w / 2);
}
