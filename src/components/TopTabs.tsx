import { motion } from "framer-motion";
import { TOP_TABS, type Screen } from "./navigation";
import { WORLD } from "@/data/worldCopy";
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
      <div className="pointer-events-auto flex items-center gap-1 px-2.5 pt-3">
        {/* Brand lockup — stacked N over NARSIL in the top-left corner */}
        <div className="mt-1 flex w-9 shrink-0 flex-col items-center gap-1">
          {showBrand && (
            <>
              <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-accent text-[9px] font-bold text-ink shadow-sm">
                N
              </span>
              <span className="text-[9px] font-semibold uppercase tracking-[0.18em] text-accent">
                Narsil
              </span>
            </>
          )}
        </div>

        {/* One evenly spaced cluster: Discover · For You · The Gallery · Search */}
        <div className="flex min-w-0 flex-1 items-center justify-evenly">
          {navTabs.map((tab) => {
            const isActive = tab.id === active;
            return (
              <motion.button
                key={tab.id}
                onClick={() => onChange?.(tab.id)}
                whileTap={{ scale: 0.94 }}
                aria-current={isActive ? "page" : undefined}
                className="relative shrink-0 rounded-full px-2 py-1.5 text-[12px] font-medium text-white"
              >
                {isActive && (
                  <motion.span
                    layoutId="top-tab-pill"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                    className="absolute inset-0 rounded-full border border-accent/35 bg-accent/20 shadow-[inset_0_1px_0_rgba(196,165,116,0.25)] backdrop-blur-xl"
                  />
                )}
                <span
                  className={`relative whitespace-nowrap ${isActive ? "text-accent" : ""}`}
                >
                  {tab.label}
                </span>
              </motion.button>
            );
          })}

          <motion.button
            onClick={() => onChange?.("search")}
            whileTap={{ scale: 0.94 }}
            aria-label={WORLD.discover}
            aria-current={isSearchActive ? "page" : undefined}
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
          >
            {isSearchActive && (
              <motion.span
                layoutId="top-tab-pill"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
                className="absolute inset-0 rounded-full border border-accent/35 bg-accent/20 shadow-[inset_0_1px_0_rgba(196,165,116,0.25)] backdrop-blur-xl"
              />
            )}
            <SearchIcon
              className={`relative h-[15px] w-[15px] ${isSearchActive ? "text-accent" : ""}`}
            />
          </motion.button>
        </div>

        {/* Balances the brand so the tab cluster stays optically centered */}
        <div className="w-9 shrink-0" aria-hidden />
      </div>
    </div>
  );
}
