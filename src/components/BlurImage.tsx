import { useCallback, useEffect, useRef, useState, type Ref } from "react";
import { sizedImageUrl, previewImageUrl, corsFetchImageUrl, isS3Url } from "@/lib/imageUrl";
import { resolveCachedImage, isImageWarmed, markImageWarmed } from "@/lib/imageCache";
import { isNgrokUrl, resolveNgrokImageSrc } from "@/lib/ngrok";
import { useInView } from "@/hooks/useInView";

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
   * Enables the animated Fill / Fit zoom transition (used by the main feed).
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
  /** When false, do not attach a src (pause downloads on a hidden tab). */
  load?: boolean;
}

const ZOOM_MS = 320;

/** How many times an image retries before giving up. */
const MAX_IMAGE_ATTEMPTS = 3;

function Shimmer() {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-black/20" />
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/15 to-transparent" />
    </div>
  );
}

/**
 * Blur-up image with an optional animated Fill / Fit transition.
 *
 * `object-fit` can't be tweened, so in `zoomable` mode we layer two copies of
 * the artwork — a `cover` layer and a `contain` layer — and cross-fade between
 * them. Native `<img>` tags (not motion.img) stay at full opacity on the active
 * layer from first paint so WebView actually decodes the file instead of
 * leaving a black feed card.
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
  load = true,
}: BlurImageProps) {
  const [displaySrc, setDisplaySrc] = useState(src);
  const [loaded, setLoaded] = useState(false);
  const [coverRatio, setCoverRatio] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);
  const mainImgRef = useRef<HTMLImageElement>(null);
  const coverRef = useRef<HTMLImageElement>(null);
  const containRef = useRef<HTMLImageElement>(null);
  const isContain = fit === "contain";
  const isThumb = !zoomable && !!thumbWidth;
  // Don't start the download until the tile is near the viewport — native
  // loading="lazy" is unreliable in WKWebView, so we gate the src ourselves.
  const { ref: inViewRef, inView } = useInView({
    enabled: !priority && isThumb,
    rootMargin: "160px",
  });
  const shouldLoad = load && (priority || !isThumb || inView);
  const renderSrc =
    isThumb && !displaySrc.startsWith("blob:")
      ? sizedImageUrl(displaySrc, thumbWidth)
      : displaySrc;
  const previewSrc = isThumb ? null : previewImageUrl(src);

  // Retry a timed-out S3/CDN request instead of leaving the card black:
  //  • attempt 0 — display URL (staged S3, blob cache, or resized thumb)
  //  • attempt ≥1 — wsrv.nl proxy for S3 (cache-busted)
  const [attempt, setAttempt] = useState(0);
  const errorAttempt = useRef(-1);
  useEffect(() => {
    setAttempt(0);
    errorAttempt.current = -1;
  }, [renderSrc]);
  const attemptSrc = (() => {
    if (attempt === 0) return renderSrc;
    const base =
      renderSrc.startsWith("blob:") || isS3Url(src)
        ? isS3Url(src)
          ? corsFetchImageUrl(src, isThumb ? Math.max(48, thumbWidth ?? 160) : 843)
          : src
        : renderSrc;
    return `${base}${base.includes("?") ? "&" : "?"}retry=${attempt}`;
  })();
  const handleError = useCallback(() => {
    setLoaded(false);
    setAttempt((a) => {
      if (a >= MAX_IMAGE_ATTEMPTS) return a;
      if (errorAttempt.current === a) return a;
      errorAttempt.current = a;
      return a + 1;
    });
  }, []);

  useEffect(() => {
    let active = true;
    setDisplaySrc(src);

    if (!shouldLoad) {
      return () => {
        active = false;
      };
    }

    if (!isImageWarmed(src)) setLoaded(false);

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

    if (isThumb && !isImageWarmed(src)) {
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
  }, [src, shouldLoad, isThumb]);

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
    markImageWarmed(src);
    setLoaded(true);
    if (zoomable) measure();
  }, [measure, zoomable, src]);

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

  useEffect(() => {
    if (!isImageWarmed(src)) setLoaded(false);
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      syncLoadedFromCache();
      inner = requestAnimationFrame(() => syncLoadedFromCache());
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [renderSrc, syncLoadedFromCache, src]);

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

  const imgLoading = priority ? "eager" : "lazy";
  const imgPriority = priority ? "high" : "auto";
  const imgDecoding = priority ? "sync" : "async";

  if (!zoomable) {
    return (
      <div
        ref={inViewRef as Ref<HTMLDivElement>}
        className={`relative h-full w-full overflow-hidden ${className}`}
        style={{ backgroundColor: accent }}
      >
        {!loaded && <Shimmer />}
        {previewSrc ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={previewSrc}
            alt=""
            aria-hidden
            decoding="async"
            className={`absolute inset-0 h-full w-full scale-105 blur-xl ${
              isContain ? "object-contain" : "object-cover"
            } ${loaded ? "opacity-0" : "opacity-100"}`}
          />
        ) : null}
        {shouldLoad ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            ref={mainImgRef}
            src={attemptSrc}
            alt={alt}
            draggable={false}
            loading={imgLoading}
            fetchPriority={imgPriority}
            decoding={imgDecoding}
            onLoad={markLoaded}
            onError={handleError}
            className={`relative h-full w-full ${
              isContain ? "object-contain" : "object-cover"
            }`}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${className}`}
      style={{ backgroundColor: accent }}
    >
      {!loaded && <Shimmer />}

      {previewSrc ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={previewSrc}
          alt=""
          aria-hidden
          decoding="async"
          className={`absolute inset-0 h-full w-full scale-110 object-cover blur-2xl transition-opacity ${
            isContain && !loaded ? "opacity-60" : "opacity-0"
          }`}
          style={{ transitionDuration: `${ZOOM_MS}ms` }}
        />
      ) : null}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={containRef}
        src={attemptSrc}
        alt=""
        aria-hidden
        draggable={false}
        loading={imgLoading}
        fetchPriority={imgPriority}
        decoding={imgDecoding}
        onLoad={markLoaded}
        onError={handleError}
        className="absolute inset-0 z-[1] h-full w-full object-contain"
        style={{
          opacity: isContain ? 1 : 0,
          transform: `scale(${isContain ? 1 : coverRatio})`,
          transition: `opacity ${ZOOM_MS}ms cubic-bezier(0.22, 1, 0.36, 1), transform ${ZOOM_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        }}
      />

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={coverRef}
        src={attemptSrc}
        alt={alt}
        draggable={false}
        loading={imgLoading}
        fetchPriority={imgPriority}
        decoding={imgDecoding}
        onLoad={markLoaded}
        onError={handleError}
        className="absolute inset-0 z-[1] h-full w-full object-cover"
        style={{
          opacity: isContain ? 0 : 1,
          transition: `opacity ${ZOOM_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`,
        }}
      />
    </div>
  );
}
