import { motion } from "framer-motion";
import { BOTTOM_TABS, type Screen } from "./navigation";
import {
  CompassIcon,
  PlusSquareIcon,
  BookmarkIcon,
  UserIcon,
} from "./Icons";

const ICONS: Record<string, (p: { filled?: boolean; className?: string }) => React.ReactNode> = {
  discover: (p) => <CompassIcon {...p} />,
  create: (p) => <PlusSquareIcon {...p} />,
  saved: (p) => <BookmarkIcon {...p} />,
  you: (p) => <UserIcon {...p} />,
};

export default function BottomNav({
  active,
  onChange,
  disabled = false,
}: {
  active: Screen;
  onChange: (screen: Screen) => void;
  disabled?: boolean;
}) {
  return (
    <nav className="absolute inset-x-0 bottom-0 z-40 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto mb-2 flex max-w-[92%] items-center justify-around rounded-full border border-white/12 bg-black/45 px-1.5 py-1.5 backdrop-blur-2xl shadow-rail">
        {BOTTOM_TABS.map((tab) => {
          const isActive = tab.id === active;
          const Icon = ICONS[tab.id];
          return (
            <button
              key={tab.id}
              onClick={() => !disabled && onChange(tab.id)}
              aria-label={tab.label}
              aria-current={isActive ? "page" : undefined}
              className="relative flex flex-1 flex-col items-center gap-0.5 rounded-full py-1.5"
            >
              {isActive && (
                <motion.span
                  layoutId="bottom-pill"
                  transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  className="absolute inset-0 rounded-full bg-white/12 ring-1 ring-white/12"
                />
              )}
              <span
                className={`relative transition-colors ${
                  isActive ? "text-white" : "text-white/55"
                }`}
              >
                {Icon({ filled: isActive, className: "h-[22px] w-[22px]" })}
              </span>
              <span
                className={`relative text-[10px] font-medium tracking-tight transition-colors ${
                  isActive ? "text-white" : "text-white/55"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
