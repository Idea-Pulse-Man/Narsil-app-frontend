import { motion } from "framer-motion";
import { WORLD } from "@/data/worldCopy";
import { BOTTOM_TABS, type Screen } from "./navigation";
import {
  PlusSquareIcon,
  BookmarkIcon,
  UserIcon,
  LightbulbIcon,
} from "./Icons";

const ICONS: Record<string, (p: { filled?: boolean; className?: string }) => React.ReactNode> = {
  saved: (p) => <BookmarkIcon {...p} />,
  create: (p) => <PlusSquareIcon {...p} />,
  you: (p) => <UserIcon {...p} />,
};

export default function BottomNav({
  active,
  onChange,
  onOpenQuiz,
  disabled = false,
}: {
  active: Screen;
  onChange: (screen: Screen) => void;
  onOpenQuiz: () => void;
  disabled?: boolean;
}) {
  return (
    <nav className="absolute inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto mb-2 flex max-w-[86%] items-center justify-around rounded-full border border-accent/15 bg-ink/70 px-1.5 py-1 backdrop-blur-2xl shadow-rail">
        {BOTTOM_TABS.map((tab) => {
          const isActive = tab.id === active;
          const Icon = ICONS[tab.id];
          return (
            <button
              key={tab.id}
              onClick={() => !disabled && onChange(tab.id)}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
              className="relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-1"
            >
              {isActive && (
                <motion.span
                  layoutId="bottom-pill"
                  transition={{ type: "spring", stiffness: 700, damping: 42 }}
                  className="absolute inset-0 rounded-full bg-accent/18 ring-1 ring-accent/25"
                />
              )}
              <span
                className={`relative transition-colors ${
                  isActive ? "text-accent" : "text-white/55"
                }`}
              >
                {Icon({ filled: isActive, className: "h-[19px] w-[19px]" })}
              </span>
              <span
                className={`relative text-[9px] font-medium tracking-tight transition-colors ${
                  isActive ? "text-accent" : "text-white/55"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}

        {/* Quiz launcher — opens the full-screen quiz overlay (not a routed
            screen), so it sits to the right of You without an active pill. */}
        <button
          onClick={() => !disabled && onOpenQuiz()}
          aria-label={WORLD.royalAssessment}
          className="group relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-1"
        >
          <span className="relative text-white/55 transition-colors group-hover:text-white/85">
            <LightbulbIcon className="h-[19px] w-[19px]" />
          </span>
          <span className="relative text-[9px] font-medium tracking-tight text-white/55 transition-colors group-hover:text-white/85">
            {WORLD.assessmentNav}
          </span>
        </button>
      </div>
    </nav>
  );
}
