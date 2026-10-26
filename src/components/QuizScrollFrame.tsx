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
  const { src, wash } = scrollForLevel(levelId);

  return (
    <div className="relative flex h-full flex-col bg-[#1a120c]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[#1a120c] bg-cover bg-center"
        style={{ backgroundImage: `url(${src})` }}
      />
      {wash ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_8.5%,#c4ae88_12.5%,#c4ae88_84.5%,transparent_88%)]"
          style={{ opacity: wash }}
        />
      ) : null}
      {/* The 4:5 art is height-fitted on phones, so the rollers sit at fixed
          fractions of the frame height (top ~9%, bottom ~11.5%). Pin the
          scroller + footer between them so nothing scrolls over the rollers. */}
      <div
        className="absolute inset-x-0 flex flex-col"
        style={{
          top: "max(9.5%, env(safe-area-inset-top))",
          bottom: "max(12%, env(safe-area-inset-bottom))",
        }}
      >
        <div
          className={`relative min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_bottom,transparent,#000_14px,#000_calc(100%-14px),transparent)] ${className}`}
        >
          <div className="px-[13%] pb-4 pt-4">{children}</div>
        </div>
        {footer}
      </div>
    </div>
  );
}

export function scrollInk(levelId: number): ScrollInk {
  return scrollForLevel(levelId).ink;
}
