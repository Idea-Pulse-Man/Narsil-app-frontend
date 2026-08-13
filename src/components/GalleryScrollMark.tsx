/**
 * Custom medieval loading mark — an aged parchment with gold rollers,
 * a sepia citadel sketch, and flanking candles. Drawn in SVG so it is not
 * a photograph.
 */
export default function GalleryScrollMark() {
  return (
    <svg
      viewBox="0 0 200 240"
      className="relative h-[11.25rem] w-[9.4rem] drop-shadow-[0_14px_36px_rgba(196,165,116,0.32)]"
      aria-hidden
    >
      <defs>
        <linearGradient id="gsm-paper" x1="50" y1="36" x2="150" y2="196">
          <stop offset="0%" stopColor="#f4ead4" />
          <stop offset="38%" stopColor="#e4d3ae" />
          <stop offset="72%" stopColor="#cbb07c" />
          <stop offset="100%" stopColor="#a88854" />
        </linearGradient>
        <linearGradient id="gsm-wood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d8b06a" />
          <stop offset="38%" stopColor="#8a5a28" />
          <stop offset="100%" stopColor="#3e2410" />
        </linearGradient>
        <radialGradient id="gsm-finial" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#f0d59a" />
          <stop offset="55%" stopColor="#c4a574" />
          <stop offset="100%" stopColor="#6b4a22" />
        </radialGradient>
        <radialGradient id="gsm-flame" cx="45%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#fff4c8" />
          <stop offset="45%" stopColor="#f0b24a" />
          <stop offset="100%" stopColor="#c45a18" />
        </radialGradient>
        <radialGradient id="gsm-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c4a574" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#c4a574" stopOpacity="0" />
        </radialGradient>
        <filter id="gsm-soft" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>

      {/* Candle glows */}
      <ellipse cx="22" cy="128" rx="16" ry="28" fill="url(#gsm-glow)" className="animate-gallery-glow" />
      <ellipse cx="178" cy="128" rx="16" ry="28" fill="url(#gsm-glow)" className="animate-gallery-glow" />

      {/* Left candle */}
      <g transform="translate(14 96)">
        <rect x="5" y="28" width="10" height="38" rx="1.2" fill="#c4a574" />
        <rect x="6" y="30" width="3" height="34" rx="0.6" fill="#f0d59a" opacity="0.35" />
        <path d="M4 28 H16 L15 24 H5 Z" fill="#9a7b4a" />
        <ellipse cx="10" cy="66" rx="8" ry="3.2" fill="#6b4a22" />
        <path
          d="M10 10 C12.4 16 13.5 22 10 28 C6.5 22 7.6 16 10 10 Z"
          fill="url(#gsm-flame)"
          className="animate-gallery-flicker origin-bottom"
          style={{ transformOrigin: "10px 28px" }}
        />
      </g>

      {/* Right candle */}
      <g transform="translate(170 96)">
        <rect x="5" y="28" width="10" height="38" rx="1.2" fill="#c4a574" />
        <rect x="6" y="30" width="3" height="34" rx="0.6" fill="#f0d59a" opacity="0.35" />
        <path d="M4 28 H16 L15 24 H5 Z" fill="#9a7b4a" />
        <ellipse cx="10" cy="66" rx="8" ry="3.2" fill="#6b4a22" />
        <path
          d="M10 10 C12.4 16 13.5 22 10 28 C6.5 22 7.6 16 10 10 Z"
          fill="url(#gsm-flame)"
          className="animate-gallery-flicker origin-bottom"
          style={{ transformOrigin: "10px 28px", animationDelay: "0.4s" }}
        />
      </g>

      <g
        className="animate-gallery-unfurl"
        style={{ transformOrigin: "100px 116px", transformBox: "fill-box" }}
      >
        {/* Floor shadow */}
        <ellipse cx="102" cy="214" rx="42" ry="6" fill="#000" opacity="0.32" filter="url(#gsm-soft)" />

        {/* Deckled parchment */}
        <path
          d="M58 40
             C70 36 86 34 100 34
             C116 34 132 36 144 40
             C148 48 150 62 149 80
             C150 110 151 148 148 176
             C146 188 140 198 128 202
             C114 206 86 206 72 202
             C58 198 52 188 50 176
             C48 148 49 110 51 80
             C50 62 52 48 58 40 Z"
          fill="url(#gsm-paper)"
        />
        {/* Age stains */}
        <ellipse cx="78" cy="58" rx="16" ry="10" fill="#8a6230" opacity="0.08" />
        <ellipse cx="128" cy="168" rx="18" ry="12" fill="#6b4a22" opacity="0.1" />
        <ellipse cx="92" cy="132" rx="22" ry="16" fill="#3a2e24" opacity="0.05" />

        {/* Gold filigree frame */}
        <path
          d="M64 48 H136 V188 H64 Z"
          fill="none"
          stroke="#c4a574"
          strokeWidth="1.4"
          opacity="0.85"
        />
        <path
          d="M67 51 H133 V185 H67 Z"
          fill="none"
          stroke="#9a7b4a"
          strokeWidth="0.5"
          opacity="0.7"
        />
        {/* Corner medallions */}
        <circle cx="64" cy="48" r="3.2" fill="#c4a574" />
        <circle cx="136" cy="48" r="3.2" fill="#c4a574" />
        <circle cx="64" cy="188" r="3.2" fill="#c4a574" />
        <circle cx="136" cy="188" r="3.2" fill="#c4a574" />

        {/* Crown + fleur crest */}
        <path d="M92 44 H108 L106 50 H94 Z" fill="#1e3a6e" />
        <path d="M96 47 L100 42 L104 47" fill="none" stroke="#c4a574" strokeWidth="0.8" />
        <path d="M94 40 H106 L104 36 L100 38 L96 36 Z" fill="#c4a574" />

        {/* Sepia citadel */}
        <g fill="none" stroke="#4a3420" strokeLinecap="round" strokeLinejoin="round">
          <path d="M76 118 L76 92 L82 86 L86 92 L86 78 L92 70 L96 78 L96 86 L104 80 L110 86 L110 74 L116 66 L122 74 L122 118" strokeWidth="1.15" />
          <path d="M80 118 V104 H90 V118" strokeWidth="0.8" />
          <path d="M98 118 V100 H108 V118" strokeWidth="0.8" />
          <path d="M86 86 H96" strokeWidth="0.6" />
          <path d="M84 96 H88 M100 94 H104 M114 92 H118" strokeWidth="0.45" opacity="0.7" />
          <path d="M88 78 V72 M110 74 V68" strokeWidth="0.7" />
          <circle cx="88" cy="70" r="1.1" fill="#4a3420" stroke="none" />
          <circle cx="110" cy="66" r="1.1" fill="#4a3420" stroke="none" />
        </g>
        {/* Hills / water */}
        <path
          d="M70 122 C84 116 96 128 100 122 C108 130 120 116 132 124 L132 138 H70 Z"
          fill="#6b5340"
          opacity="0.28"
        />
        <path
          d="M72 132 C90 126 110 138 128 130"
          fill="none"
          stroke="#3a2e24"
          strokeWidth="0.7"
          opacity="0.35"
        />
        {/* Compass rose */}
        <g transform="translate(100 140)">
          <path d="M0 -7 L1.6 0 L0 7 L-1.6 0 Z" fill="#c4a574" />
          <path d="M-7 0 L0 1.6 L7 0 L0 -1.6 Z" fill="#9a7b4a" />
          <circle r="2.2" fill="none" stroke="#c4a574" strokeWidth="0.5" />
        </g>
        {/* Camp / pikes */}
        <g stroke="#4a3420" strokeLinecap="round">
          <path d="M76 168 L80 152 L84 168" fill="#6b5340" fillOpacity="0.35" strokeWidth="0.7" />
          <path d="M90 170 L93 156 L96 170" fill="#6b5340" fillOpacity="0.3" strokeWidth="0.7" />
          <path d="M108 170 L112 154 L116 170" fill="#6b5340" fillOpacity="0.3" strokeWidth="0.7" />
          <path d="M78 156 V146 M82 156 V144 M92 158 V148 M110 156 V145 M114 156 V147" strokeWidth="0.55" opacity="0.7" />
        </g>
        {/* Knights as tiny marks */}
        <g fill="#3a2e24" opacity="0.55">
          <circle cx="86" cy="172" r="1.1" />
          <circle cx="94" cy="174" r="1.1" />
          <circle cx="102" cy="173" r="1.1" />
          <circle cx="118" cy="172" r="1.1" />
          <circle cx="124" cy="174" r="1.05" />
        </g>
      </g>

      {/* Top roller */}
      <ellipse cx="46" cy="38" rx="7" ry="8" fill="url(#gsm-finial)" />
      <ellipse cx="154" cy="38" rx="7" ry="8" fill="url(#gsm-finial)" />
      <rect x="50" y="31" width="100" height="14" rx="7" fill="url(#gsm-wood)" />
      <rect x="54" y="33.2" width="92" height="3" rx="1.4" fill="#f0d59a" opacity="0.28" />
      <ellipse cx="46" cy="38" rx="2.6" ry="2.8" fill="#2a180c" opacity="0.5" />
      <ellipse cx="154" cy="38" rx="2.6" ry="2.8" fill="#2a180c" opacity="0.5" />
      <path d="M62 37 C80 32 120 32 138 37 C120 42 80 42 62 37 Z" fill="#e4d3ae" opacity="0.7" />
      <path d="M94 30 H106 L104 26 H96 Z" fill="#c4a574" />

      {/* Bottom roller */}
      <ellipse cx="46" cy="204" rx="7" ry="8" fill="url(#gsm-finial)" />
      <ellipse cx="154" cy="204" rx="7" ry="8" fill="url(#gsm-finial)" />
      <rect x="50" y="197" width="100" height="14" rx="7" fill="url(#gsm-wood)" />
      <rect x="54" y="199.2" width="92" height="3" rx="1.4" fill="#f0d59a" opacity="0.22" />
      <ellipse cx="46" cy="204" rx="2.6" ry="2.8" fill="#2a180c" opacity="0.5" />
      <ellipse cx="154" cy="204" rx="2.6" ry="2.8" fill="#2a180c" opacity="0.5" />
      <path d="M62 203 C80 198 120 198 138 203 C120 208 80 208 62 203 Z" fill="#cbb07c" opacity="0.65" />
    </svg>
  );
}
