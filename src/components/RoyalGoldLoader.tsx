import { useEffect, useRef } from "react";

/**
 * Startup progress (0–92%) as a function of time since navigation start.
 * It eases toward 92% and holds there — the screen unmounts when the work is
 * actually done, so the bar never claims 100% early. The boot script in
 * `index.html` runs the same formula, so the bar continues smoothly from the
 * static splash into React instead of restarting.
 */
function bootProgress(nowMs = performance.now()): number {
  return 92 * (1 - Math.exp(-nowMs / 2600));
}

interface RoyalGoldLoaderProps {
  /** Status line under the bar, left of the percentage. */
  label?: string;
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
}: RoyalGoldLoaderProps) {
  const fillRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);

  // Drive the bar from a rAF loop that writes styles directly — no React
  // re-render per frame.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const p = bootProgress();
      if (fillRef.current) fillRef.current.style.width = `${p}%`;
      if (pctRef.current) pctRef.current.textContent = `${Math.floor(p)}%`;
      frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div role="status" aria-label={label} className="royal-splash z-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/branding/narsil-app-icon.png"
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
