/** Compact 0–5 star row for topic quiz results. */

interface QuizStarsProps {
  stars: number;
  size?: number;
  className?: string;
}

export default function QuizStars({
  stars,
  size = 10,
  className = "",
}: QuizStarsProps) {
  const filled = Math.max(0, Math.min(5, Math.round(stars)));
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      aria-label={`${filled} of 5 stars`}
    >
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          width={size}
          height={size}
          className={i < filled ? "text-amber-300" : "text-white/20"}
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M12 2.5l2.7 5.5 6.1.9-4.4 4.3 1 6.1L12 16.5 6.6 19.3l1-6.1L3.2 8.9l6.1-.9L12 2.5z"
          />
        </svg>
      ))}
    </span>
  );
}
