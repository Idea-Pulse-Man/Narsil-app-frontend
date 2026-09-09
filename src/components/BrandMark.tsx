interface BrandMarkProps {
  /** Crest height in px (width follows). */
  size?: number;
  /** Show the wordmark next to the crest. */
  showWordmark?: boolean;
  className?: string;
  wordmarkClassName?: string;
}

const CREST_SRC = "/branding/narsil-crest.png";

/**
 * Narsil crest (client art). Prefer this over the plain “N” circle.
 */
export default function BrandMark({
  size = 28,
  showWordmark = false,
  className = "",
  wordmarkClassName = "text-[12px] font-semibold uppercase tracking-[0.28em] text-white drop-shadow-md",
}: BrandMarkProps) {
  return (
    <span className={`inline-flex items-center justify-center gap-2 ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={CREST_SRC}
        alt="Narsil"
        width={size}
        height={size}
        className="object-contain drop-shadow-md"
        style={{ width: size, height: size }}
        draggable={false}
      />
      {showWordmark && <span className={wordmarkClassName}>Narsil</span>}
    </span>
  );
}
