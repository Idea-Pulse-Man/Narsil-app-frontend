import { motion } from "framer-motion";
import { TOP_TABS, type Screen } from "./navigation";
import { SearchIcon } from "./Icons";

interface TopTabsProps {
  active: Screen;
  onChange?: (screen: Screen) => void;
  /** Stacked N + NARSIL lockup on the left (feed screens). */
  showBrand?: boolean;
}

export default function TopTabs({
  active,
  onChange,
  showBrand = false,
}: TopTabsProps) {
  const navTabs = TOP_TABS.filter((tab) => tab.id !== "search");
  const isSearchActive = active === "search";

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 pt-[env(safe-area-inset-top)]">
      <div className="pointer-events-auto flex items-start justify-between gap-2 px-4 pt-3">
        {/* Brand lockup — N badge with NARSIL centered underneath */}
        <div className="flex w-[52px] shrink-0 flex-col items-center gap-0.5 pt-0.5">
          {showBrand && (
            <>
              <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-white text-[11px] font-bold text-ink">
                N
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.16em] text-white">
                Narsil
              </span>
            </>
          )}
        </div>

        <div className="flex flex-1 items-center justify-center gap-0.5">
          {navTabs.map((tab) => {
            const isActive = tab.id === active;
            return (
              <button
                key={tab.id}
                onClick={() => onChange?.(tab.id)}
                className={`relative rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
                  isActive ? "text-white" : "text-white/50 hover:text-white/75"
                }`}
              >
                {isActive && (
                  <motion.span
                    layoutId="top-tab-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-full border border-white/20 bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl"
                  />
                )}
                <span className="relative">{tab.label}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onChange?.("search")}
          aria-label="Search"
          className={`flex h-8 w-[52px] shrink-0 items-center justify-end rounded-full transition-colors ${
            isSearchActive
              ? "text-white"
              : "text-white/50 hover:text-white/75"
          }`}
        >
          <SearchIcon className="h-[15px] w-[15px]" />
        </button>
      </div>
    </div>
  );
}
