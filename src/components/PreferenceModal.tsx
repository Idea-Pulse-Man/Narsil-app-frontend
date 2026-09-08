import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { artworks } from "@/data";
import { SparkleIcon } from "./Icons";
import type { Preferences } from "./AppState";

/** Curated masterpiece behind the first-run welcome — same mood as the tutorial finale. */
const WELCOME_ARTWORK = artworks.find((a) => a.id === "starry-night")!;

interface PreferenceOption {
  label: string;
  bucket: "artTypes" | "periods" | "empires" | "artists" | "interests";
}

interface PreferenceGroup {
  question: string;
  subtitle?: string;
  options: PreferenceOption[];
}

/** Extended question groups for a 2–3 minute personalization flow. */
const GROUPS: PreferenceGroup[] = [
  {
    question: "What type of art do you love?",
    subtitle: "Pick as many as you like — we'll tune your feed.",
    options: [
      { label: "Paintings", bucket: "artTypes" },
      { label: "Sculptures", bucket: "artTypes" },
      { label: "Modern Art", bucket: "artTypes" },
      { label: "Photography", bucket: "artTypes" },
      { label: "Architecture", bucket: "artTypes" },
      { label: "Ceramics", bucket: "artTypes" },
      { label: "Drawings", bucket: "artTypes" },
      { label: "Textile Art", bucket: "artTypes" },
    ],
  },
  {
    question: "Any era or period?",
    subtitle: "Which moments in art history fascinate you?",
    options: [
      { label: "Ancient", bucket: "periods" },
      { label: "Medieval", bucket: "periods" },
      { label: "Renaissance", bucket: "periods" },
      { label: "Baroque", bucket: "periods" },
      { label: "Impressionism", bucket: "periods" },
      { label: "Art Nouveau", bucket: "periods" },
      { label: "Modern", bucket: "periods" },
      { label: "Contemporary", bucket: "periods" },
      { label: "Japanese Art", bucket: "periods" },
    ],
  },
  {
    question: "Any civilization or empire?",
    subtitle: "Explore art through the lens of great civilizations.",
    options: [
      { label: "Roman", bucket: "empires" },
      { label: "Greek", bucket: "empires" },
      { label: "Egyptian", bucket: "empires" },
      { label: "Chinese", bucket: "empires" },
      { label: "Japanese", bucket: "empires" },
      { label: "Indian", bucket: "empires" },
      { label: "Mesoamerican", bucket: "empires" },
      { label: "Persian", bucket: "empires" },
      { label: "Byzantine", bucket: "empires" },
    ],
  },
  {
    question: "Any favourite artists?",
    subtitle: "We'll highlight their works in your feed.",
    options: [
      { label: "Van Gogh", bucket: "artists" },
      { label: "Monet", bucket: "artists" },
      { label: "Da Vinci", bucket: "artists" },
      { label: "Hokusai", bucket: "artists" },
      { label: "Picasso", bucket: "artists" },
      { label: "Rembrandt", bucket: "artists" },
      { label: "Klimt", bucket: "artists" },
      { label: "Vermeer", bucket: "artists" },
      { label: "Michelangelo", bucket: "artists" },
      { label: "Frida Kahlo", bucket: "artists" },
    ],
  },
  {
    question: "What draws you to art?",
    subtitle: "This helps us pick the right stories for you.",
    options: [
      { label: "History & Context", bucket: "interests" },
      { label: "Beauty & Aesthetics", bucket: "interests" },
      { label: "Technique & Craft", bucket: "interests" },
      { label: "Stories & Symbolism", bucket: "interests" },
      { label: "Collecting & Buying", bucket: "interests" },
      { label: "Just Browsing", bucket: "interests" },
    ],
  },
];

const ALL_OPTIONS = GROUPS.flatMap((g) => g.options);

const WELCOME_EASE = [0.22, 1, 0.36, 1] as const;

function OnboardingWelcome({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="absolute inset-0 overflow-hidden bg-ink">
      <motion.div
        initial={{ scale: 1.08, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.4, ease: WELCOME_EASE }}
        className="absolute inset-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={WELCOME_ARTWORK.image}
          alt=""
          aria-hidden
          className="h-full w-full object-cover"
        />
      </motion.div>

      <div className="pointer-events-none absolute inset-x-0 top-0 h-[48%] bg-gradient-to-b from-black/70 via-black/25 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[52%] bg-gradient-to-t from-black/85 via-black/40 to-transparent" />

      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 0.45, ease: WELCOME_EASE }}
        className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+2.75rem)] px-8 text-center"
      >
        <div className="mb-8 flex items-center justify-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-[13px] font-bold text-ink shadow-lg">
            N
          </span>
          <span className="text-[12px] font-semibold uppercase tracking-[0.28em] text-white drop-shadow-md">
            Narsil
          </span>
        </div>
        <h1 className="font-serif text-[34px] leading-[1.08] tracking-tight text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)]">
          The museum is open
        </h1>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, delay: 1.05, ease: WELCOME_EASE }}
        className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+1.75rem)] px-8"
      >
        <p className="mx-auto max-w-[19rem] text-center text-[15px] leading-relaxed text-white/75 drop-shadow-md">
          Public-domain masterpieces and living artists, side by side — with the
          stories behind them.
        </p>
        <p className="mx-auto mt-3 max-w-[19rem] text-center text-[14px] leading-relaxed text-white/50">
          First we&apos;ll ask what you love. Then a short tour of how to move
          through the rooms.
        </p>
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.65, ease: WELCOME_EASE }}
          whileTap={{ scale: 0.97 }}
          onClick={onContinue}
          className="mt-8 w-full rounded-full bg-accent py-4 text-[15px] font-semibold text-ink shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
        >
          Enter the museum
        </motion.button>
      </motion.div>
    </div>
  );
}

interface PreferenceModalProps {
  open: boolean;
  /** When true, renders as a full-screen onboarding flow instead of a bottom sheet. */
  onboarding?: boolean;
  initial?: Preferences;
  onSave: (prefs: Omit<Preferences, "completed">) => void;
  onSkip: () => void;
}

export default function PreferenceModal({
  open,
  onboarding = false,
  initial,
  onSave,
  onSkip,
}: PreferenceModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [step, setStep] = useState(0);
  /** Onboarding starts on a brand welcome, then the taste questions. */
  const [showWelcome, setShowWelcome] = useState(true);

  // Seed selections from existing preferences when (re)opened.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    setShowWelcome(onboarding);
    const seed = new Set<string>([
      ...(initial?.artTypes ?? []),
      ...(initial?.periods ?? []),
      ...(initial?.empires ?? []),
      ...(initial?.artists ?? []),
      ...(initial?.interests ?? []),
    ]);
    setSelected(seed);
  }, [open, initial, onboarding]);

  const toggle = (label: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });

  const buildPrefs = () => {
    const prefs = {
      artTypes: [] as string[],
      periods: [] as string[],
      empires: [] as string[],
      artists: [] as string[],
      interests: [] as string[],
    };
    ALL_OPTIONS.forEach((opt) => {
      if (selected.has(opt.label)) {
        (prefs[opt.bucket] as string[]).push(opt.label);
      }
    });
    return prefs;
  };

  const handleNext = () => {
    if (step < GROUPS.length - 1) {
      setStep((s) => s + 1);
    } else {
      onSave(buildPrefs());
    }
  };

  const handleBack = () => {
    if (step > 0) setStep((s) => s - 1);
    else if (onboarding) setShowWelcome(true);
  };

  const totalSteps = GROUPS.length;
  const current = GROUPS[step];
  const progress = ((step + 1) / totalSteps) * 100;

  // ── Onboarding mode: full-screen paginated flow ──────────────────
  if (onboarding) {
    return (
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="absolute inset-0 z-[70] flex flex-col bg-ink text-white"
          >
            {showWelcome ? (
              <OnboardingWelcome onContinue={() => setShowWelcome(false)} />
            ) : (
              <>
            {/* Progress bar */}
            <div className="relative h-1 w-full bg-white/10">
              <motion.div
                className="absolute inset-y-0 left-0 bg-accent"
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3, ease: "easeOut" }}
              />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-[calc(env(safe-area-inset-top)+1rem)] pb-2">
              <button
                onClick={handleBack}
                className="text-sm font-medium text-white/60 transition-colors hover:text-white"
              >
                Back
              </button>
              <span className="text-xs font-medium text-white/40">
                {step + 1} of {totalSteps}
              </span>
              <button
                onClick={onSkip}
                className="text-sm font-medium text-white/35 transition-colors hover:text-white/55"
              >
                Skip
              </button>
            </div>

            {/* Question content — animated per step */}
            <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-8 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 40 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -40 }}
                  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                  className="flex flex-1 flex-col"
                >
                  <div className="flex items-center gap-2">
                    <SparkleIcon className="h-5 w-5 text-amber-300" />
                    <h2 className="font-serif text-2xl text-white">
                      {current.question}
                    </h2>
                  </div>
                  {current.subtitle && (
                    <p className="mt-2 text-sm leading-relaxed text-white/60">
                      {current.subtitle}
                    </p>
                  )}

                  <div className="mt-6 flex flex-wrap gap-2.5">
                    {current.options.map((opt) => {
                      const active = selected.has(opt.label);
                      return (
                        <motion.button
                          key={opt.label}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => toggle(opt.label)}
                          className={`rounded-full px-4 py-2.5 text-sm font-medium transition-colors ${
                            active
                              ? "bg-accent text-ink"
                              : "border border-white/15 bg-white/5 text-white/75 hover:text-white"
                          }`}
                        >
                          {opt.label}
                        </motion.button>
                      );
                    })}
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Bottom CTA */}
            <div className="px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={handleNext}
                className="w-full rounded-full bg-accent py-3.5 text-sm font-semibold text-ink transition-transform"
              >
                {step < GROUPS.length - 1 ? "Next" : "Save preferences"}
              </motion.button>
            </div>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  // ── Classic mode: bottom-sheet (used from YouView "Edit preferences") ──
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
                                ? "bg-accent text-ink"
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
                  onClick={() => onSave(buildPrefs())}
                  className="flex-[1.4] rounded-full bg-accent py-3.5 text-sm font-semibold text-ink transition-transform active:scale-[0.98]"
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
