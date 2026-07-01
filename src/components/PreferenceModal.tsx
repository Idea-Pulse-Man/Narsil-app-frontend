import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SparkleIcon } from "./Icons";
import type { Preferences } from "./AppState";

interface PreferenceOption {
  label: string;
  bucket: "artTypes" | "periods" | "empires" | "artists";
}

interface PreferenceGroup {
  question: string;
  options: PreferenceOption[];
}

/** Question groups + curated options from the product spec. */
const GROUPS: PreferenceGroup[] = [
  {
    question: "What type of art do you like?",
    options: [
      { label: "Paintings", bucket: "artTypes" },
      { label: "Sculptures", bucket: "artTypes" },
      { label: "Modern Art", bucket: "artTypes" },
    ],
  },
  {
    question: "Any period you like?",
    options: [
      { label: "Renaissance", bucket: "periods" },
      { label: "Japanese Art", bucket: "periods" },
    ],
  },
  {
    question: "Any empire?",
    options: [
      { label: "Roman", bucket: "empires" },
      { label: "Greek", bucket: "empires" },
      { label: "Egyptian", bucket: "empires" },
    ],
  },
  {
    question: "Any artist?",
    options: [
      { label: "Van Gogh", bucket: "artists" },
      { label: "Hokusai", bucket: "artists" },
    ],
  },
];

const ALL_OPTIONS = GROUPS.flatMap((g) => g.options);

interface PreferenceModalProps {
  open: boolean;
  initial?: Preferences;
  onSave: (prefs: Omit<Preferences, "completed">) => void;
  onSkip: () => void;
}

export default function PreferenceModal({
  open,
  initial,
  onSave,
  onSkip,
}: PreferenceModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Seed selections from existing preferences when (re)opened.
  useEffect(() => {
    if (!open) return;
    const seed = new Set<string>([
      ...(initial?.artTypes ?? []),
      ...(initial?.periods ?? []),
      ...(initial?.empires ?? []),
      ...(initial?.artists ?? []),
    ]);
    setSelected(seed);
  }, [open, initial]);

  const toggle = (label: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  const handleSave = () => {
    const prefs = { artTypes: [], periods: [], empires: [], artists: [] } as Omit<
      Preferences,
      "completed"
    >;
    ALL_OPTIONS.forEach((opt) => {
      if (selected.has(opt.label)) prefs[opt.bucket].push(opt.label);
    });
    onSave(prefs);
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-[70] bg-ink/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 34 }}
            className="absolute inset-x-0 bottom-0 z-[71] max-h-[88%] overflow-y-auto rounded-t-[28px] border-t border-white/12 bg-ink-soft text-white shadow-placard [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="flex flex-col items-center pb-1 pt-3">
              <div className="h-1.5 w-11 rounded-full bg-white/15" />
            </div>

            <div className="px-6 pb-8 pt-3">
              <div className="flex items-center gap-2">
                <SparkleIcon className="h-5 w-5 text-amber-300" />
                <h2 className="font-serif text-2xl text-white">
                  Personalize your museum
                </h2>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-white/60">
                Pick what you love and we&apos;ll tune your For You feed. You can
                change this anytime from the You tab.
              </p>

              <div className="mt-6 space-y-6">
                {GROUPS.map((group) => (
                  <div key={group.question}>
                    <p className="text-[13px] font-medium text-white/80">
                      {group.question}
                    </p>
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {group.options.map((opt) => {
                        const active = selected.has(opt.label);
                        return (
                          <button
                            key={opt.label}
                            onClick={() => toggle(opt.label)}
                            className={`rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                              active
                                ? "bg-white text-ink"
                                : "border border-white/15 bg-white/5 text-white/75 hover:text-white"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 flex items-center gap-3">
                <button
                  onClick={onSkip}
                  className="flex-1 rounded-full border border-white/15 bg-white/5 py-3.5 text-sm font-medium text-white/80 transition-colors hover:text-white"
                >
                  Skip for now
                </button>
                <button
                  onClick={handleSave}
                  className="flex-[1.4] rounded-full bg-white py-3.5 text-sm font-semibold text-ink transition-transform active:scale-[0.98]"
                >
                  Save preferences
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
