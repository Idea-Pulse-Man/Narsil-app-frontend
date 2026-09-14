import type { QuizDifficulty } from "@/lib/quiz";
import { LockIcon } from "./Icons";

const METAL: Record<
  QuizDifficulty,
  { ring: string; fill: string; ink: string; glow: string }
> = {
  apprentice: {
    ring: "#8a5a28",
    fill: "#c47a32",
    ink: "#3a220c",
    glow: "rgba(196, 122, 50, 0.45)",
  },
  scholar: {
    ring: "#7a8494",
    fill: "#c5ced8",
    ink: "#2a3138",
    glow: "rgba(197, 206, 216, 0.45)",
  },
  master: {
    ring: "#a67c12",
    fill: "#e2b13a",
    ink: "#3a2a08",
    glow: "rgba(226, 177, 58, 0.5)",
  },
};

interface TopicMedalProps {
  difficulty: QuizDifficulty;
  unlocked: boolean;
  /** First letter (or two) stamped on the medal. */
  mark: string;
  size?: number;
  /** Locked seals render as pale white discs instead of grayscale metal. */
  lockedWhite?: boolean;
}

const WHITE_METAL = {
  ring: "#e8e4dc",
  fill: "#f7f4ee",
  ink: "#b8b2a6",
  glow: "transparent",
};

/**
 * Bronze / silver / gold seal. Locked medals stay in the case but are grayed
 * (or white on the Study badge page) until a perfect score unlocks them.
 */
export default function TopicMedal({
  difficulty,
  unlocked,
  mark,
  size = 44,
  lockedWhite = false,
}: TopicMedalProps) {
  const metal = unlocked || !lockedWhite ? METAL[difficulty] : WHITE_METAL;
  const letter = mark.slice(0, 1).toUpperCase() || "•";
  const faded = !unlocked && !lockedWhite;

  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <svg
        viewBox="0 0 48 48"
        width={size}
        height={size}
        className={`transition-[filter,opacity] ${
          faded ? "opacity-40 grayscale" : ""
        }`}
        style={
          unlocked ? { filter: `drop-shadow(0 0 6px ${metal.glow})` } : undefined
        }
      >
        <circle cx="24" cy="24" r="22" fill={metal.ring} />
        <circle cx="24" cy="24" r="17.5" fill={metal.fill} />
        <circle
          cx="24"
          cy="24"
          r="15.5"
          fill="none"
          stroke={metal.ink}
          strokeOpacity="0.28"
          strokeWidth="1.2"
        />
        <text
          x="24"
          y="24"
          textAnchor="middle"
          dominantBaseline="central"
          fill={metal.ink}
          fontSize="16"
          fontFamily="Georgia, 'Times New Roman', serif"
          fontWeight="700"
        >
          {letter}
        </text>
      </svg>
      {!unlocked && (
        <LockIcon
          className={`absolute h-3 w-3 ${lockedWhite ? "text-[#8a8478]" : "text-white/70"}`}
          style={{ bottom: size * 0.08, right: size * 0.08 }}
        />
      )}
    </span>
  );
}
