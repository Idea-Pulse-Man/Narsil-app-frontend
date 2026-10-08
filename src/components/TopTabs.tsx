import { motion } from "framer-motion";
import { TOP_TABS, type Screen } from "./navigation";
import { WORLD } from "@/data/worldCopy";
import { SearchIcon } from "./Icons";

interface TopTabsProps {
  active: Screen;
  onChange?: (screen: Screen) => void;
}

export default function TopTabs({ active, onChange }: TopTabsProps) {
  const navTabs = TOP_TABS.filter((tab) => tab.id !== "search");
  const isSearchActive = active === "search";

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 pt-[env(safe-area-inset-top)]">
      <div className="pointer-events-auto flex items-center px-3 pb-2 pt-4">
        {/* One evenly spaced cluster: Discover · Narsil · Gallery · Search */}
        <div className="flex min-w-0 flex-1 items-center justify-evenly">
          {navTabs.map((tab) => {
            const isActive = tab.id === active;
            return (
              <motion.button
                key={tab.id}
                onClick={() => onChange?.(tab.id)}
                whileTap={{ scale: 0.94 }}
                aria-current={isActive ? "page" : undefined}
                className="relative shrink-0 rounded-full px-3 py-2 text-[14px] font-medium text-white"
              >
                {isActive && (
                  <motion.span
                    layoutId="top-tab-pill"
                    transition={{ type: "spring", stiffness: 700, damping: 42 }}
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
            className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white after:absolute after:-inset-2 after:content-['']"
          >
            {isSearchActive && (
              <motion.span
                layoutId="top-tab-pill"
                transition={{ type: "spring", stiffness: 700, damping: 42 }}
                className="absolute inset-0 rounded-full border border-accent/35 bg-accent/20 shadow-[inset_0_1px_0_rgba(196,165,116,0.25)] backdrop-blur-xl"
              />
            )}
            <SearchIcon
              className={`relative h-[17px] w-[17px] ${isSearchActive ? "text-accent" : ""}`}
            />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
