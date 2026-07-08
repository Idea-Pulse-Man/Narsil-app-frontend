import { motion } from "framer-motion";
import { TOP_TABS, type Screen } from "./navigation";

export default function TopTabs({
  active,
  onChange,
}: {
  active: Screen;
  onChange?: (screen: Screen) => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-30 pt-[env(safe-area-inset-top)]">
      <div className="pointer-events-auto flex items-center justify-center gap-0.5 px-3 pt-[calc(env(safe-area-inset-top)+3.6rem)]">
        {TOP_TABS.map((tab) => {
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
    </div>
  );
}
