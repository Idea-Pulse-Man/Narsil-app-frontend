import { useEffect, useRef } from "react";

/**
 * Startup progress (0–92%) as a function of time since navigation start.
 * It eases toward 92% and holds there until the parent reports `done`, so the
 * bar never claims 100% early. The boot script in `index.html` runs the same
 * formula, so the bar continues smoothly from the static splash into React
 * instead of restarting.
 */
function bootProgress(nowMs = performance.now()): number {
  return 92 * (1 - Math.exp(-nowMs / 2600));
}

/** Once done: run from wherever the bar is to 100%… */
const FINISH_MS = 450;
/** …hold the full bar long enough to register… */
const HOLD_MS = 350;
/** …then fade out to the page underneath. */
const FADE_MS = 300;

interface RoyalGoldLoaderProps {
  /** Status line under the bar, left of the percentage. */
  label?: string;
  /** The work is finished: fill to 100%, hold, fade, then call `onFinished`. */
  done?: boolean;
  /** Called after the fade-out — the parent unmounts the loader here. */
  onFinished?: () => void;
}

/**
 * "Royal Gold" — the app's first loading screen: the Regia et Ars crest over
 * a gilded progress bar with a sweeping glint. Fills its positioned parent.
 *
 * The `royal-*` classes live in `index.html`, shared with the pre-React boot
 * splash so the hand-off between the two is invisible.
 */
export default function RoyalGoldLoader({
  label = "Gilded light",
  done = false,
  onFinished,
}: RoyalGoldLoaderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  // Read by the rAF loop, which is started once and must see the latest props.
  const doneRef = useRef(done);
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    doneRef.current = done;
    onFinishedRef.current = onFinished;
  });

  // Drive the bar from a rAF loop that writes styles directly — no React
  // re-render per frame.
  useEffect(() => {
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finishFrom: { p: number; t: number } | null = null;
    const draw = (p: number) => {
      if (fillRef.current) fillRef.current.style.width = `${p}%`;
      if (pctRef.current) pctRef.current.textContent = `${Math.floor(p)}%`;
    };
    const tick = () => {
      const now = performance.now();
      if (doneRef.current && !finishFrom) {
        finishFrom = { p: bootProgress(now), t: now };
      }
      if (!finishFrom) {
        draw(bootProgress(now));
        frame = requestAnimationFrame(tick);
        return;
      }
      // Ease-out from the current value to 100%.
      const k = Math.min(1, (now - finishFrom.t) / FINISH_MS);
      draw(finishFrom.p + (100 - finishFrom.p) * (1 - (1 - k) ** 3));
      if (k < 1) {
        frame = requestAnimationFrame(tick);
        return;
      }
      timer = setTimeout(() => {
        const root = rootRef.current;
        if (root) {
          root.style.transition = `opacity ${FADE_MS}ms ease`;
          root.style.opacity = "0";
        }
        timer = setTimeout(() => onFinishedRef.current?.(), FADE_MS);
      }, HOLD_MS);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      role="status"
      aria-label={label}
      className="royal-splash z-10"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/branding/regia-et-ars-crest.png"
        alt=""
        draggable={false}
        className="royal-crest"
      />
      <p className="royal-title">Regia et Ars</p>
      <div className="royal-rule" />
      <div className="royal-bar">
        <div className="royal-track">
          <div ref={fillRef} className="royal-fill" />
        </div>
        <div className="royal-status">
          <span>{label}</span>
          <span ref={pctRef} aria-hidden />
        </div>
      </div>
    </div>
  );
}
