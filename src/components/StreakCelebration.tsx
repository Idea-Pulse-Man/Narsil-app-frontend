import { useMemo } from "react";
import { motion } from "framer-motion";
import { FlameIcon } from "./Icons";

interface StreakCelebrationProps {
  streak: number;
}

const CONFETTI_COLORS = [
  "#fbbf24",
  "#34d399",
  "#60a5fa",
  "#f472b6",
  "#a78bfa",
  "#f87171",
];

/**
 * A one-shot streak-milestone celebration: a burst of confetti behind a
 * springing flame badge. Dependency-free — confetti pieces are framer-motion
 * spans that fan out and fall. Rendered by QuizResults only when a milestone
 * streak is reached, so it never fires on an ordinary day.
 */
export default function StreakCelebration({ streak }: StreakCelebrationProps) {
  // Fixed once per mount — the burst shouldn't reshuffle on re-render.
  const pieces = useMemo(
    () =>
      Array.from({ length: 30 }, (_, i) => ({
        x: (Math.random() * 2 - 1) * 150,
        rise: 40 + Math.random() * 60,
        rotate: Math.random() * 540 - 270,
        delay: Math.random() * 0.15,
        duration: 1.1 + Math.random() * 0.8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        size: 6 + Math.round(Math.random() * 6),
      })),
    [],
  );

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center overflow-hidden">
      <div className="relative h-40 w-full">
        {/* Confetti burst, anchored near the badge */}
        {pieces.map((p, i) => (
          <motion.span
            key={i}
            className="absolute left-1/2 top-16"
            style={{
              width: p.size,
              height: p.size * 0.5,
              backgroundColor: p.color,
              borderRadius: 1,
            }}
            initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
            animate={{
              x: p.x,
              y: [0, -p.rise, 120],
              opacity: [1, 1, 0],
              rotate: p.rotate,
            }}
            transition={{
              duration: p.duration,
              delay: p.delay,
              ease: "easeOut",
            }}
          />
        ))}

        {/* Milestone badge */}
        <motion.div
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 16, delay: 0.05 }}
          className="absolute left-1/2 top-10 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-300/40 bg-amber-300/15 px-4 py-2 shadow-[0_0_30px_-6px_rgba(251,191,36,0.6)] backdrop-blur-md"
        >
          <FlameIcon filled className="h-5 w-5 text-amber-300" />
          <span className="text-sm font-bold text-white">
            {streak}-day milestone!
          </span>
        </motion.div>
      </div>
    </div>
  );
}
