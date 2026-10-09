import { useId } from "react";

const CREST_SRC = "/branding/narsil-app-icon.png";

const OUTER_RUNES = "REGIA ET ARS · MEMORIA · FIDES · PULCHRITUDO · ";
const INNER_RUNES = "✦ ARS ✦ GLADIUS ✦ SCEPTRUM ✦ CODEX ";

/** Below this the inscriptions are unreadable — only the arc + crest show. */
const COMPACT_BELOW = 120;

interface RuneLoaderProps {
  /** Outer diameter in px; the crest and inscriptions scale with it. */
  size?: number;
  /** Caption under the circle (e.g. "Opening the Hall"). */
  label?: string;
  /** Cover the nearest positioned parent with the quiz's espresso backdrop. */
  overlay?: boolean;
  className?: string;
}

/**
 * "Rune Circle" loader: Latin inscriptions orbit the Regia et Ars crest in two
 * counter-rotating rings while a golden arc spins. Used wherever the quiz is
 * waiting on the network or on artwork images.
 */
export default function RuneLoader({
  size = 240,
  label,
  overlay = false,
  className = "",
}: RuneLoaderProps) {
  // Fragment-safe id for the textPath hrefs (useId may contain «» or colons).
  const id = `rune${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const compact = size < COMPACT_BELOW;
  const outerPath = `${id}-outer`;
  const innerPath = `${id}-inner`;

  const circle = (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {!compact && (
        <>
          <svg viewBox="0 0 280 280" className="rune-spin absolute inset-0 h-full w-full [animation-duration:14s]">
            <defs>
              <path
                id={outerPath}
                d="M140,140 m-118,0 a118,118 0 1,1 236,0 a118,118 0 1,1 -236,0"
              />
            </defs>
            <text className="fill-[#d9a441] font-serif text-[13px] opacity-85">
              <textPath href={`#${outerPath}`} textLength={741} lengthAdjust="spacing">
                {OUTER_RUNES}
              </textPath>
            </text>
          </svg>
          <svg
            viewBox="0 0 240 240"
            className="rune-spin absolute [animation-direction:reverse] [animation-duration:9s]"
            style={{
              top: size * (20 / 280),
              left: size * (20 / 280),
              width: size * (240 / 280),
              height: size * (240 / 280),
            }}
          >
            <defs>
              <path
                id={innerPath}
                d="M120,120 m-104,0 a104,104 0 1,1 208,0 a104,104 0 1,1 -208,0"
              />
            </defs>
            <text className="fill-[#8a5f1f] font-serif text-[9px]">
              <textPath href={`#${innerPath}`} textLength={653} lengthAdjust="spacing">
                {INNER_RUNES.repeat(2)}
              </textPath>
            </text>
          </svg>
        </>
      )}
      <span
        className="rune-arc rune-spin absolute rounded-full"
        style={{ inset: compact ? 2 : size * (8 / 280) }}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={CREST_SRC}
        alt=""
        draggable={false}
        className="rune-crest relative rounded-[22%] object-cover"
        style={{
          width: size * (compact ? 0.56 : 0.6),
          height: size * (compact ? 0.56 : 0.6),
        }}
      />
    </div>
  );

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center ${
        overlay
          ? "absolute inset-0 bg-[radial-gradient(ellipse_at_50%_45%,#2b1e16,#1a120c_70%)]"
          : ""
      } ${className}`}
    >
      {circle}
      {label ? (
        <p className="mt-6 font-serif text-[12px] uppercase tracking-[0.28em] text-[#f4d78a]/80">
          {label}
        </p>
      ) : null}
      {!label && <span className="sr-only">Loading</span>}
    </div>
  );
}
