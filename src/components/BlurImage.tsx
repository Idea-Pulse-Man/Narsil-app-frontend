import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { sizedImageUrl, previewImageUrl } from "@/lib/imageUrl";
import { resolveCachedImage } from "@/lib/imageCache";
import { isNgrokUrl, resolveNgrokImageSrc } from "@/lib/ngrok";

interface BlurImageProps {
  src: string;
  alt: string;
  accent: string;
  className?: string;
  priority?: boolean;
  /**
   * "cover" fills the frame (default), "contain" shows the full artwork without
   * cropping. Only animated when `zoomable` is set.
   */
  fit?: "cover" | "contain";
  /**
   * Enables the animated Fill ↔ Fit zoom transition (used by the main feed).
   * Grids and thumbnails leave this off for a single lightweight image.
   */
  zoomable?: boolean;
  /**
   * Bumped by the parent to re-check whether the full image is already cached
   * (e.g. after the tutorial resets UI state without changing `src`).
   */
  syncToken?: number;
  /** When set, requests a smaller source image for grids and thumbnails. */
  thumbWidth?: number;
}

const ZOOM_TRANSITION = {
  duration: 0.32,
  ease: [0.22, 1, 0.36, 1] as const,
};

/** How many times a thumbnail retries (with a direct-URL fallback) before giving up. */
const MAX_IMAGE_ATTEMPTS = 3;

function Shimmer() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-black/20" />
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/10 to-transparent" />
    </div>
  );
}

/**
 * Blur-up image with an optional animated Fill / Fit transition.
 *
 * `object-fit` can't be tweened, so in `zoomable` mode we layer two crisp copies
 * of the artwork — a `cover` layer and a `contain` layer — and cross-fade
 * between them while the `contain` layer zooms from the cover framing down to
 * its full size. The net effect reads as the artwork smoothly zooming out
 * (Fill → Fit) or in (Fit → Fill), while both resting states stay sharp.
 */
export default function BlurImage({
  src,
  alt,
  accent,
  className = "",
  priority = false,
  fit = "cover",
  zoomable = false,
  syncToken,
  thumbWidth,
}: BlurImageProps) {
  const [displaySrc, setDisplaySrc] = useState(src);
  const [loaded, setLoaded] = useState(false);
  const [coverRatio, setCoverRatio] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const mainImgRef = useRef<HTMLImageElement>(null);
  const coverRef = useRef<HTMLImageElement>(null);
  const containRef = useRef<HTMLImageElement>(null);
  const isContain = fit === "contain";
  const renderSrc =
    !zoomable && thumbWidth && !displaySrc.startsWith("blob:")
      ? sizedImageUrl(displaySrc, thumbWidth)
      : displaySrc;
  // Preview from the original URL so a blob/cache hit still has a tiny stand-in.
  const previewSrc = previewImageUrl(src);

  // A single S3/CDN request can transiently time out (net::ERR_TIMED_OUT). Retry
  // the tile a few times instead of leaving it stuck on the accent placeholder:
  //  • attempt 0 — the (possibly CDN-resized) thumbnail
  //  • attempt ≥1 — fall back to the direct, unresized URL (cache-busted so the
  //    browser actually re-fetches), in case the resized/proxied variant is the
  //    thing failing.
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setAttempt(0);
  }, [renderSrc]);
  const attemptSrc =
    attempt === 0
      ? renderSrc
      : `${displaySrc}${displaySrc.includes("?") ? "&" : "?"}retry=${attempt}`;
  const handleError = useCallback(() => {
    setAttempt((a) => (a < MAX_IMAGE_ATTEMPTS ? a + 1 : a));
  }, []);

  useEffect(() => {
    let active = true;
    setDisplaySrc(src);
    setLoaded(false);

    if (isNgrokUrl(src)) {
      resolveNgrokImageSrc(src)
        .then((resolved) => {
          if (active) setDisplaySrc(resolved);
        })
        .catch(() => {
          if (active) setDisplaySrc(src);
        });
      return () => {
        active = false;
      };
    }

    void resolveCachedImage(src).then((resolved) => {
      if (active) setDisplaySrc(resolved);
    });

    return () => {
      active = false;
    };
  }, [src]);

  // Ratio between the cover and contain renderings of this image. The contain
  // layer starts at this scale (matching the cover framing) and animates to 1.
  const measure = useCallback(() => {
    const el = containerRef.current;
    const img = coverRef.current;
    if (!el || !img || !img.naturalWidth || !img.naturalHeight) return;
    const a = el.clientWidth / img.naturalWidth;
    const b = el.clientHeight / img.naturalHeight;
    const ratio = Math.max(a, b) / Math.min(a, b);
    setCoverRatio(Number.isFinite(ratio) && ratio > 0 ? ratio : 1);
  }, []);

  const markLoaded = useCallback(() => {
    setLoaded(true);
    if (zoomable) measure();
  }, [measure, zoomable]);

  const syncLoadedFromCache = useCallback(() => {
    for (const img of [mainImgRef.current, coverRef.current, containRef.current]) {
      if (img?.complete && img.naturalWidth > 0) {
        markLoaded();
        return;
      }
    }
  }, [markLoaded]);

  useEffect(() => {
    if (!zoomable) return;
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, zoomable]);

  // Cached images may finish before onLoad is attached — especially after the
  // tutorial resets state while the same URL is already in memory.
  useEffect(() => {
    setLoaded(false);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      syncLoadedFromCache();
      inner = requestAnimationFrame(() => syncLoadedFromCache());
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [renderSrc, syncLoadedFromCache]);

  useEffect(() => {
    if (loaded) return;
    const frame = requestAnimationFrame(() => syncLoadedFromCache());
    return () => cancelAnimationFrame(frame);
  }, [fit, loaded, syncLoadedFromCache]);

  useEffect(() => {
    if (syncToken === undefined) return;
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      syncLoadedFromCache();
      inner = requestAnimationFrame(() => syncLoadedFromCache());
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [syncToken, syncLoadedFromCache]);

  // Lightweight path for grids / thumbnails — a single image, no extra layers.
  if (!zoomable) {
    return (
      <div
        ref={containerRef}
        className={`relative h-full w-full overflow-hidden ${className}`}
        style={{ backgroundColor: accent }}
      >
        {previewSrc ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={previewSrc}
            alt=""
            aria-hidden
            decoding="async"
            className={`absolute inset-0 h-full w-full scale-105 blur-xl transition-opacity duration-500 ${
              isContain ? "object-contain" : "object-cover"
            } ${loaded ? "opacity-0" : "opacity-100"}`}
          />
        ) : (
          !loaded && <Shimmer />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={mainImgRef}
          src={attemptSrc}
          alt={alt}
          draggable={false}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          onLoad={markLoaded}
          onError={handleError}
          className={`relative h-full w-full transition-all duration-500 ease-out ${
            isContain ? "object-contain" : "object-cover"
          } ${
            loaded ? "scale-100 opacity-100 blur-0" : "scale-105 opacity-0 blur-xl"
          }`}
        />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{ backgroundColor: accent }}
    >
      {/* Soft blurred backdrop, revealed in Fit Art mode. Uses the tiny preview
          (blur hides the low resolution) so it appears instantly. */}
      <motion.img
        src={previewSrc ?? displaySrc}
        alt=""
        aria-hidden
        draggable={false}
        className="absolute inset-0 h-full w-full scale-110 object-cover blur-2xl will-change-[opacity]"
        initial={false}
        animate={{ opacity: isContain ? 0.45 : 0 }}
        transition={ZOOM_TRANSITION}
      />
      <motion.div
        className="absolute inset-0 bg-black/40"
        initial={false}
        animate={{ opacity: isContain ? 1 : 0 }}
        transition={ZOOM_TRANSITION}
      />

      {/* Instant low-res placeholder while the crisp layers stream in. */}
      {previewSrc ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={previewSrc}
          alt=""
          aria-hidden
          decoding="async"
          className={`absolute inset-0 h-full w-full blur-xl transition-opacity duration-500 ${
            isContain ? "object-contain" : "object-cover"
          } ${loaded ? "opacity-0" : "opacity-100"}`}
        />
      ) : (
        !loaded && <Shimmer />
      )}

      {/* Contain layer — full artwork. Zooms from the cover framing to 1. */}
      <motion.img
        ref={containRef}
        src={displaySrc}
        alt=""
        aria-hidden
        draggable={false}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        onLoad={markLoaded}
        className="absolute inset-0 h-full w-full object-contain will-change-transform"
        initial={false}
        animate={{
          opacity: loaded && isContain ? 1 : 0,
          scale: isContain ? 1 : coverRatio,
        }}
        transition={ZOOM_TRANSITION}
      />

      {/* Cover layer — crisp default framing. */}
      <motion.img
        ref={coverRef}
        src={displaySrc}
        alt={alt}
        draggable={false}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        onLoad={markLoaded}
        className="relative h-full w-full object-cover will-change-transform"
        initial={false}
        animate={{
          opacity: loaded && !isContain ? 1 : 0,
          filter: loaded ? "blur(0px)" : "blur(12px)",
        }}
        transition={{
          opacity: ZOOM_TRANSITION,
          filter: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
        }}
      />
    </div>
  );
}
