import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
} from "react";
import { isNgrokUrl, resolveNgrokImageSrc } from "@/lib/ngrok";

interface ZoomableImageProps {
  src: string;
  alt: string;
  accent: string;
  /** Single tap on the image (only fires when not zoomed / not a pan). */
  onTap?: () => void;
  /** Reports whether the image is currently zoomed in (scale > 1). */
  onZoomChange?: (zoomed: boolean) => void;
  /**
   * Live vertical offset of a swipe-down-to-dismiss drag, in px (0 when idle).
   * Only fires while the image sits at fit scale — once zoomed, a vertical drag
   * pans the artwork instead.
   */
  onDismissDrag?: (dy: number) => void;
  /** Fired when the dismiss drag ends: true if it passed the close threshold. */
  onDismissEnd?: (dismissed: boolean) => void;
  className?: string;
}

export interface ZoomableImageHandle {
  reset: () => void;
}

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;

/** Drag must clear this before it starts pulling the viewer down (px). */
const DISMISS_START = 10;
/** Release beyond this distance closes the viewer (px). */
const DISMISS_DISTANCE = 120;
/** …or a shorter drag flicked at this speed (px/ms). */
const DISMISS_VELOCITY = 0.55;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * A pinch / drag / double-tap / wheel zoomable image "canvas" for inspecting an
 * artwork up close. Gestures are handled with pointer events so it works with
 * touch and mouse alike. Translation is clamped to the container so the artwork
 * can't be flung off-screen.
 */
const ZoomableImage = forwardRef<ZoomableImageHandle, ZoomableImageProps>(
  function ZoomableImage(
    {
      src,
      alt,
      accent,
      onTap,
      onZoomChange,
      onDismissDrag,
      onDismissEnd,
      className = "",
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);

    const [displaySrc, setDisplaySrc] = useState(src);
    const [loaded, setLoaded] = useState(false);
    const [scale, setScale] = useState(1);
    const [tx, setTx] = useState(0);
    const [ty, setTy] = useState(0);

    // Live transform values kept in a ref so pointer handlers stay stable and
    // always read the freshest state without re-subscribing.
    const t = useRef({ scale: 1, tx: 0, ty: 0 });
    const pointers = useRef(new Map<number, { x: number; y: number }>());
    const pinch = useRef<{ dist: number; mid: { x: number; y: number } } | null>(
      null
    );
    const pan = useRef<{ x: number; y: number } | null>(null);
    const moved = useRef(false);
    const lastTap = useRef(0);
    // Swipe-down-to-dismiss: tracked from the first touch so we can tell a
    // vertical pull-to-close apart from a horizontal drag or a pinch.
    const dismiss = useRef<{
      startX: number;
      startY: number;
      dy: number;
      lastY: number;
      lastT: number;
      velocity: number;
      active: boolean;
    } | null>(null);

    const cancelDismiss = useCallback(() => {
      if (dismiss.current?.active) onDismissDrag?.(0);
      dismiss.current = null;
    }, [onDismissDrag]);

    // Resolve ngrok-hosted images to a blob URL (mirrors BlurImage behaviour).
    useEffect(() => {
      let blobUrl: string | null = null;
      let active = true;

      setLoaded(false);
      if (!isNgrokUrl(src)) {
        setDisplaySrc(src);
        return;
      }

      setDisplaySrc(src);
      resolveNgrokImageSrc(src)
        .then((resolved) => {
          if (!active) {
            if (resolved.startsWith("blob:")) URL.revokeObjectURL(resolved);
            return;
          }
          blobUrl = resolved.startsWith("blob:") ? resolved : null;
          setDisplaySrc(resolved);
        })
        .catch(() => {
          if (active) setDisplaySrc(src);
        });

      return () => {
        active = false;
        if (blobUrl) URL.revokeObjectURL(blobUrl);
      };
    }, [src]);

    const clampTranslate = useCallback(
      (nx: number, ny: number, s: number) => {
        const el = containerRef.current;
        if (!el) return { x: nx, y: ny };
        const maxX = (el.clientWidth * (s - 1)) / 2;
        const maxY = (el.clientHeight * (s - 1)) / 2;
        return { x: clamp(nx, -maxX, maxX), y: clamp(ny, -maxY, maxY) };
      },
      []
    );

    const apply = useCallback(
      (s: number, nx: number, ny: number) => {
        const nextScale = clamp(s, MIN_SCALE, MAX_SCALE);
        const clamped = clampTranslate(nx, ny, nextScale);
        const wasZoomed = t.current.scale > 1.001;
        t.current = { scale: nextScale, tx: clamped.x, ty: clamped.y };
        setScale(nextScale);
        setTx(clamped.x);
        setTy(clamped.y);
        const isZoomed = nextScale > 1.001;
        if (isZoomed !== wasZoomed) onZoomChange?.(isZoomed);
      },
      [clampTranslate, onZoomChange]
    );

    const reset = useCallback(() => apply(1, 0, 0), [apply]);

    useImperativeHandle(ref, () => ({ reset }), [reset]);

    // Reset the transform whenever a new artwork is shown.
    useEffect(() => {
      apply(1, 0, 0);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [src]);

    const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
      Math.hypot(a.x - b.x, a.y - b.y);

    const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
    });

    const onPointerDown = useCallback(
      (e: React.PointerEvent) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        moved.current = false;

        const pts = [...pointers.current.values()];
        if (pts.length === 2) {
          pinch.current = {
            dist: distance(pts[0], pts[1]),
            mid: midpoint(pts[0], pts[1]),
          };
          pan.current = null;
          // A second finger means pinch, never dismiss — snap the viewer back.
          cancelDismiss();
        } else if (pts.length === 1) {
          pan.current = { x: e.clientX, y: e.clientY };
          dismiss.current = {
            startX: e.clientX,
            startY: e.clientY,
            dy: 0,
            lastY: e.clientY,
            lastT: Date.now(),
            velocity: 0,
            active: false,
          };
        }
      },
      [cancelDismiss]
    );

    const onPointerMove = useCallback(
      (e: React.PointerEvent) => {
        if (!pointers.current.has(e.pointerId)) return;
        pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const pts = [...pointers.current.values()];

        if (pts.length === 2 && pinch.current) {
          const dist = distance(pts[0], pts[1]);
          const mid = midpoint(pts[0], pts[1]);
          const factor = dist / (pinch.current.dist || dist);
          const dx = mid.x - pinch.current.mid.x;
          const dy = mid.y - pinch.current.mid.y;
          apply(
            t.current.scale * factor,
            t.current.tx + dx,
            t.current.ty + dy
          );
          pinch.current = { dist, mid };
          moved.current = true;
        } else if (pts.length === 1 && pan.current && t.current.scale > 1.001) {
          const dx = e.clientX - pan.current.x;
          const dy = e.clientY - pan.current.y;
          if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved.current = true;
          apply(t.current.scale, t.current.tx + dx, t.current.ty + dy);
          pan.current = { x: e.clientX, y: e.clientY };
        } else if (pts.length === 1 && dismiss.current && onDismissDrag) {
          // Not zoomed: a downward, vertically-dominant drag pulls to dismiss.
          const d = dismiss.current;
          const dx = e.clientX - d.startX;
          const dy = e.clientY - d.startY;

          if (!d.active) {
            if (dy > DISMISS_START && dy > Math.abs(dx)) d.active = true;
            else if (Math.abs(dx) > DISMISS_START || dy < -DISMISS_START) {
              // Committed to a horizontal swipe or an upward drag instead.
              dismiss.current = null;
              return;
            } else return;
          }

          const now = Date.now();
          const dt = now - d.lastT;
          if (dt > 0) d.velocity = (e.clientY - d.lastY) / dt;
          d.lastY = e.clientY;
          d.lastT = now;
          d.dy = Math.max(0, dy);
          moved.current = true;
          onDismissDrag(d.dy);
        }
      },
      [apply, onDismissDrag]
    );

    const endPointer = useCallback(
      (e: React.PointerEvent) => {
        pointers.current.delete(e.pointerId);
        const remaining = pointers.current.size;

        if (remaining < 2) pinch.current = null;
        if (remaining === 1) {
          const [p] = [...pointers.current.values()];
          pan.current = { x: p.x, y: p.y };
          // Fingers left over from a pinch shouldn't turn into a dismiss.
          dismiss.current = null;
        }
        if (remaining === 0) {
          pan.current = null;

          const d = dismiss.current;
          dismiss.current = null;
          if (d?.active) {
            const dismissed =
              e.type !== "pointercancel" &&
              (d.dy > DISMISS_DISTANCE ||
                (d.velocity > DISMISS_VELOCITY && d.dy > 40));
            if (!dismissed) onDismissDrag?.(0);
            onDismissEnd?.(dismissed);
            return;
          }

          // Tap detection — only when the pointer didn't meaningfully move.
          if (!moved.current) {
            const now = Date.now();
            if (now - lastTap.current < 280) {
              // Double tap: toggle between fit and a comfortable zoom.
              lastTap.current = 0;
              if (t.current.scale > 1.001) apply(1, 0, 0);
              else apply(DOUBLE_TAP_SCALE, 0, 0);
            } else {
              lastTap.current = now;
              const captured = t.current.scale;
              // Defer single-tap so a following tap can cancel it (double-tap).
              window.setTimeout(() => {
                if (lastTap.current !== now) return;
                if (captured <= 1.001) onTap?.();
              }, 280);
            }
          }
        }
      },
      [apply, onTap, onDismissDrag, onDismissEnd]
    );

    const onWheel = useCallback(
      (e: React.WheelEvent) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        apply(t.current.scale * factor, t.current.tx, t.current.ty);
      },
      [apply]
    );

    const zoomed = scale > 1.001;

    return (
      <div
        ref={containerRef}
        className={`relative h-full w-full touch-none select-none overflow-hidden ${className}`}
        style={{ backgroundColor: accent }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onWheel={onWheel}
      >
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
          </div>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={displaySrc}
          alt={alt}
          draggable={false}
          decoding="async"
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 h-full w-full object-contain will-change-transform"
          style={{
            transform: `translate3d(${tx}px, ${ty}px, 0) scale(${scale})`,
            transition: pinch.current || pan.current ? "none" : "transform 0.22s ease-out",
            cursor: zoomed ? "grab" : "zoom-in",
            opacity: loaded ? 1 : 0,
          }}
        />
      </div>
    );
  }
);

export default ZoomableImage;
