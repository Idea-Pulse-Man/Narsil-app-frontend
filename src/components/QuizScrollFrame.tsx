import type { ReactNode } from "react";
import { scrollForLevel, type ScrollInk } from "@/lib/quiz/scrolls";

interface QuizScrollFrameProps {
  levelId: number;
  children: ReactNode;
  /** Extra class on the inner scroller. */
  className?: string;
  /** Sticky footer (Done / CTAs) sits outside the parchment scroller. */
  footer?: ReactNode;
}

export default function QuizScrollFrame({
  levelId,
  children,
  className = "",
  footer,
}: QuizScrollFrameProps) {
  const { src } = scrollForLevel(levelId);

  return (
    <div className="relative flex h-full flex-col bg-[#1a120c]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[#1a120c] bg-cover bg-center"
        style={{ backgroundImage: `url(${src})` }}
      />
      <div
        className={`relative min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
      >
        {/* Keep copy inside the blank parchment panel, clear of rollers + border art. */}
        <div className="px-[13%] pb-[18%] pt-[16%]">{children}</div>
      </div>
      {footer}
    </div>
  );
}

export function scrollInk(levelId: number): ScrollInk {
  return scrollForLevel(levelId).ink;
}
