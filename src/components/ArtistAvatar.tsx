import { useEffect, useState } from "react";
import { useArtistPhoto } from "@/lib/artistPhoto";

interface ArtistAvatarProps {
  /** Preferred picture URL (e.g. a curated local portrait). Tried first. */
  src?: string;
  /**
   * Artist name. When there is no working `src`, the avatar resolves a portrait
   * from Wikipedia by this name. Also used as the final photo source.
   */
  name?: string;
  /** Fallback shown while loading, on error, or when there is no picture. */
  initials: string;
  /** Sizing + shape applied to the wrapper (e.g. "h-11 w-11 rounded-full"). */
  className?: string;
  /** Background + text styles for the initials fallback layer. */
  fallbackClassName?: string;
  /** Inline styles for the wrapper (e.g. a per-artist accent background). */
  style?: React.CSSProperties;
}

/** Deterministic, pleasant gradient derived from the artist name, so the
 * initials fallback looks like an intentional avatar rather than a flat blank. */
function monogramBackground(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(150deg, hsl(${hue} 52% 42%), hsl(${(hue + 40) % 360} 58% 24%))`;
}

/**
 * Circular artist profile picture with a graceful fallback chain:
 *   1. `src` (a curated portrait), if it loads
 *   2. a Wikipedia portrait resolved from `name`, if available
 *   3. a deterministic colored monogram (initials)
 *
 * The initials always render underneath, so a slow or broken image never leaves
 * an empty/broken circle — it simply reveals the layer beneath it.
 */
export default function ArtistAvatar({
  src,
  name,
  initials,
  className = "",
  fallbackClassName = "bg-white/12 text-white",
  style,
}: ArtistAvatarProps) {
  const [srcOk, setSrcOk] = useState(true);
  const [photoOk, setPhotoOk] = useState(true);

  useEffect(() => setSrcOk(true), [src]);

  const usePreferred = !!src && srcOk;
  // Only fetch a Wikipedia photo when the preferred src is missing or failed.
  const photo = useArtistPhoto(usePreferred ? undefined : name);

  useEffect(() => setPhotoOk(true), [photo]);

  let imageUrl: string | undefined;
  let onError: (() => void) | undefined;
  if (usePreferred) {
    imageUrl = src;
    onError = () => setSrcOk(false);
  } else if (photo && photoOk) {
    imageUrl = photo;
    onError = () => setPhotoOk(false);
  }

  const autoStyle: React.CSSProperties | undefined = name
    ? { background: monogramBackground(name) }
    : undefined;

  return (
    <span
      style={{ ...autoStyle, ...style }}
      className={`relative flex items-center justify-center overflow-hidden ${fallbackClassName} ${className}`}
    >
      <span aria-hidden className="select-none">
        {initials}
      </span>
      {imageUrl && (
        <img
          src={imageUrl}
          alt=""
          aria-hidden
          decoding="async"
          loading="lazy"
          onError={onError}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}
    </span>
  );
}
