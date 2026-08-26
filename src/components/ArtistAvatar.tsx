import { memo, useEffect, useRef, useState } from "react";
import { useInView } from "@/hooks/useInView";
import { sizedAvatarUrl } from "@/lib/imageUrl";

interface ArtistAvatarProps {
  /** Preferred picture URL (e.g. a curated local portrait). Tried first. */
  src?: string;
  /** Artist name — used for the initials monogram fallback. */
  name?: string;
  /** Fallback shown while loading, on error, or when there is no picture. */
  initials: string;
  /**
   * Whether to resolve an online portrait from `name` when there's no working
   * `src`. Off for entities with no likeness (anonymous/ancient makers, fictional
   * freelancers) so they show a monogram instead of an artwork or a stranger.
   * Defaults to true.
   */
  lookup?: boolean;
  /** Display size in CSS px — requests a right-sized download. Default 48. */
  size?: number;
  /** Load immediately (above the fold). Skips viewport deferral. */
  priority?: boolean;
  /** Sizing + shape applied to the wrapper (e.g. "h-11 w-11 rounded-full"). */
  className?: string;
  /** Background + text styles for the initials fallback layer. */
  fallbackClassName?: string;
  /** Inline styles for the wrapper (e.g. a per-artist accent background). */
  style?: React.CSSProperties;
}

/** Deterministic, pleasant gradient derived from the artist name. */
function monogramBackground(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `linear-gradient(150deg, hsl(${hue} 52% 42%), hsl(${(hue + 40) % 360} 58% 24%))`;
}

function ArtistAvatar({
  src,
  name,
  initials,
  lookup: _lookup = true,
  size = 48,
  priority = false,
  className = "",
  fallbackClassName = "bg-white/12 text-white",
  style,
}: ArtistAvatarProps) {
  const [srcOk, setSrcOk] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const { ref, inView } = useInView({ enabled: !priority, rootMargin: "140px" });

  useEffect(() => setSrcOk(true), [src]);

  const shouldLoad = priority || inView;
  const imageUrl =
    src && srcOk && shouldLoad ? sizedAvatarUrl(src, size) : undefined;

  useEffect(() => {
    setLoaded(false);
    const check = () => {
      const img = imgRef.current;
      if (img && img.complete && img.naturalWidth > 0) setLoaded(true);
    };
    check();
    const frame = requestAnimationFrame(check);
    return () => cancelAnimationFrame(frame);
  }, [imageUrl]);

  const autoStyle: React.CSSProperties | undefined = name
    ? { background: monogramBackground(name) }
    : undefined;

  return (
    <span
      ref={ref}
      style={{ ...autoStyle, ...style }}
      className={`relative flex items-center justify-center overflow-hidden ${fallbackClassName} ${className}`}
    >
      <span aria-hidden className="select-none">
        {initials}
      </span>
      {imageUrl && (
        <img
          ref={imgRef}
          src={imageUrl}
          alt=""
          aria-hidden
          decoding="async"
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          onLoad={() => setLoaded(true)}
          onError={() => setSrcOk(false)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${
            loaded ? "opacity-100" : "opacity-0"
          }`}
        />
      )}
    </span>
  );
}

export default memo(ArtistAvatar);
