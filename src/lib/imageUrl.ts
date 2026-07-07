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

  return src;
}

/** Avatar-sized variant — caps width so portrait grids don't pull huge files. */
export function sizedAvatarUrl(src: string, cssPx: number): string {
  const w = Math.min(160, Math.max(32, Math.round(cssPx * 2)));
  return sizedImageUrl(src, w / 2);
}
