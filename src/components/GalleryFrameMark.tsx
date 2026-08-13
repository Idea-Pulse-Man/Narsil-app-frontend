/**
 * Gallery loading mark — a gilded picture frame with a painterly canvas.
 * No parchment, no scroll: the feed is about hanging a work on the wall.
 */
export default function GalleryFrameMark() {
  return (
    <svg
      viewBox="0 0 88 108"
      className="relative h-[6.75rem] w-[5.5rem] drop-shadow-[0_12px_32px_rgba(196,165,116,0.34)]"
      aria-hidden
    >
      <defs>
        <linearGradient id="gfm-gold" x1="8" y1="6" x2="80" y2="102">
          <stop offset="0%" stopColor="#ead6a8" />
          <stop offset="42%" stopColor="#c4a574" />
          <stop offset="100%" stopColor="#7a5a2e" />
        </linearGradient>
        <linearGradient id="gfm-sky" x1="18" y1="16" x2="70" y2="92">
          <stop offset="0%" stopColor="#5c4634" />
          <stop offset="38%" stopColor="#3a2a20" />
          <stop offset="100%" stopColor="#1c1410" />
        </linearGradient>
        <radialGradient id="gfm-sun" cx="62%" cy="28%" r="28%">
          <stop offset="0%" stopColor="#f0d59a" stopOpacity="0.9" />
          <stop offset="55%" stopColor="#c4a574" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#c4a574" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="gfm-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#fff" stopOpacity="0" />
          <stop offset="50%" stopColor="#fff" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Outer baroque frame */}
      <rect
        x="4"
        y="4"
        width="80"
        height="100"
        rx="5"
        fill="url(#gfm-gold)"
      />
      <rect x="8" y="8" width="72" height="92" rx="3" fill="#5c4324" />
      <rect
        x="10.5"
        y="10.5"
        width="67"
        height="87"
        rx="2.2"
        fill="none"
        stroke="#ead6a8"
        strokeWidth="1.1"
        opacity="0.55"
      />
      {/* Inner fillet */}
      <rect x="15" y="15" width="58" height="78" rx="1.4" fill="#1a1410" />

      {/* Painting */}
      <g>
        <rect x="16.5" y="16.5" width="55" height="75" fill="url(#gfm-sky)" />
        <circle cx="52" cy="34" r="18" fill="url(#gfm-sun)" className="animate-gallery-glow" />
        <path
          d="M16.5 58 C28 50 36 62 44 52 C52 64 62 50 71.5 58 V91.5 H16.5 Z"
          fill="#3a2e24"
        />
        <path
          d="M16.5 68 C30 60 42 74 71.5 64 V91.5 H16.5 Z"
          fill="#241810"
          opacity="0.9"
        />
        <path
          d="M16.5 78 C34 72 50 84 71.5 76 V91.5 H16.5 Z"
          fill="#14100e"
          opacity="0.7"
        />
        {/* Light sheen across the varnish */}
        <rect
          x="16.5"
          y="16.5"
          width="55"
          height="75"
          fill="url(#gfm-sheen)"
          className="origin-center animate-gallery-glow"
          opacity="0.35"
        />
      </g>

      {/* Corner bosses */}
      <circle cx="10" cy="10" r="3.1" fill="#ead6a8" />
      <circle cx="78" cy="10" r="3.1" fill="#ead6a8" />
      <circle cx="10" cy="98" r="3.1" fill="#c4a574" />
      <circle cx="78" cy="98" r="3.1" fill="#c4a574" />
    </svg>
  );
}
