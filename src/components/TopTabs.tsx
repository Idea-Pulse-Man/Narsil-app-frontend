import { motion } from "framer-motion";
import { TOP_TABS, type Screen } from "./navigation";
import { SearchIcon } from "./Icons";

interface TopTabsProps {
  active: Screen;
  onChange?: (screen: Screen) => void;
  /** Stacked N + NARSIL lockup in the top-left corner (feed screens). */
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
      <div className="pointer-events-auto flex items-center justify-between gap-2 px-4 pt-3">
        {/* Brand lockup — stacked N over NARSIL in the top-left corner */}
        <div className="mt-1 flex w-[56px] shrink-0 flex-col items-center gap-1">
          {showBrand && (
            <>
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-white text-[9px] font-bold text-ink shadow-sm">
                N
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-white">
                Narsil
              </span>
            </>
          )}
        </div>

        <div className="flex flex-1 items-center justify-center gap-0">
          {navTabs.map((tab) => {
            const isActive = tab.id === active;
            return (
              <motion.button
                key={tab.id}
                onClick={() => onChange?.(tab.id)}
                whileTap={{ scale: 0.94 }}
                aria-current={isActive ? "page" : undefined}
                className="relative rounded-full px-5 py-1.5 text-[13px] font-medium text-white"
              >
                {isActive && (
                  <motion.span
                    layoutId="top-tab-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-full border border-white/20 bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl"
                  />
                )}
                <span className="relative whitespace-nowrap">{tab.label}</span>
              </motion.button>
            );
          })}

          {/* Search sits inline, right after the Buy tab */}
          <motion.button
            onClick={() => onChange?.("search")}
            whileTap={{ scale: 0.94 }}
            aria-label="Search"
            aria-current={isSearchActive ? "page" : undefined}
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
          >
            {/* Same pill as the text tabs — with uniform white text it is the
                only thing marking Search as the active screen. */}
            {isSearchActive && (
              <motion.span
                layoutId="top-tab-pill"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-full border border-white/20 bg-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl"
              />
            )}
            <SearchIcon className="relative h-[15px] w-[15px]" />
          </motion.button>
        </div>

        {/* Right spacer to keep the tab cluster visually centered */}
        <div className="w-[56px] shrink-0" />
      </div>
    </div>
  );
}
