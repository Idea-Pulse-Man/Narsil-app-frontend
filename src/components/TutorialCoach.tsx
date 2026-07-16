import { AnimatePresence, motion } from "framer-motion";
import { artworks } from "@/data";
import { CheckIcon } from "./Icons";
import { tutorialFooterHintClass } from "./artwork-layout";

/** Curated hero for the finale — visual-first, drops the user into the gallery. */
const FINALE_ARTWORK = artworks.find((a) => a.id === "starry-night")!;

type HintKey =
  | "vertical"
  | "tap"
  | "swipe-up"
  | "left"
  | "right"
  | "hold"
  | "actions";

interface CoachStep {
  label: string;
  instruction: string;
  hint: HintKey;
  zone: "center" | "footer";
  /** Confirmation shown during the brief pause before the next step. */
  done: string;
}

const STEPS: CoachStep[] = [
  {
    label: "Browse the museum",
    instruction: "Swipe up or down on the artwork to discover more art.",
    hint: "vertical",
    zone: "center",
    done: "Nice — keep exploring",
  },
  {
    label: "Reveal the history",
    instruction: "Tap the Description button below to open the museum placard.",
    hint: "tap",
    zone: "footer",
    done: "There's the story",
  },
  {
    label: "Meet the artist",
    instruction: "Swipe left to view the artist profile.",
    hint: "left",
    zone: "center",
    done: "Meet the artist",
  },
  {
    label: "Fit the artwork",
    instruction: "Swipe right to fill the frame and crop the artwork.",
    hint: "right",
    zone: "center",
    done: "Reframed",
  },
  {
    label: "Clean view",
    instruction: "Press and hold on the artwork to hide the interface.",
    hint: "hold",
    zone: "center",
    done: "Distraction-free",
  },
  {
    label: "Use quick actions",
    instruction:
      "On the right rail you can open the artist's profile, like, save, comment, download, share, and hide the interface — tap Got it to finish.",
    hint: "actions",
    zone: "center",
    done: "All set",
  },
];

export const TUTORIAL_STEP_COUNT = STEPS.length;

function UpArrow({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <line x1="12" y1="19" x2="12" y2="6" />
      <polyline points="6 12 12 6 18 12" />
    </svg>
  );
}

function ChevronHorizontal({ className = "", direction }: { className?: string; direction: "left" | "right" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`${direction === "left" ? "rotate-180" : ""} ${className}`}
    >
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

function Finger({ pressed = false }: { pressed?: boolean }) {
  return (
    <div
      className={`rounded-full bg-white shadow-[0_0_28px_rgba(255,255,255,0.85),0_0_56px_rgba(255,255,255,0.4)] ring-[3px] ring-white/50 ${
        pressed ? "h-11 w-11" : "h-12 w-12"
      }`}
    />
  );
}

function GestureLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-4 rounded-full bg-white px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-ink shadow-[0_4px_24px_rgba(0,0,0,0.45)]">
      {children}
    </span>
  );
}

function SpotlightRing({ className = "" }: { className?: string }) {
  return (
    <motion.span
      className={`absolute rounded-full border-2 border-white/70 ${className}`}
      animate={{ scale: [1, 1.14, 1], opacity: [0.55, 1, 0.55] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

function HintWrapper({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center">
      {children}
      <GestureLabel>{label}</GestureLabel>
    </div>
  );
}

const directionalLoop = {
  duration: 1.8,
  repeat: Infinity,
  ease: "easeInOut" as const,
};

function HorizontalSwipeHint({ direction }: { direction: "left" | "right" }) {
  const travel = direction === "left" ? [48, -48] : [-48, 48];
  const label = direction === "left" ? "Swipe left" : "Swipe right";

  return (
    <HintWrapper label={label}>
      <div className="relative flex h-32 w-64 items-center justify-center">
        <div className="absolute h-28 w-52 rounded-full bg-white/25 blur-2xl" />
        <SpotlightRing className="h-24 w-52" />

        <div className="absolute inset-x-2 top-1/2 h-0.5 -translate-y-1/2 bg-gradient-to-r from-transparent via-white/70 to-transparent" />

        <motion.div
          className={`absolute top-1/2 -translate-y-1/2 text-white ${
            direction === "left" ? "left-0" : "right-0"
          }`}
          animate={{ opacity: [0.4, 1, 0.4], x: direction === "left" ? [-3, 3, -3] : [3, -3, 3] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        >
          <ChevronHorizontal direction={direction} className="h-8 w-8 drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]" />
        </motion.div>
        <motion.div
          className={`absolute top-1/2 -translate-y-1/2 text-white/60 ${
            direction === "left" ? "left-6" : "right-6"
          }`}
          animate={{ opacity: [0.2, 0.7, 0.2] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut", delay: 0.12 }}
        >
          <ChevronHorizontal direction={direction} className="h-6 w-6" />
        </motion.div>

        <motion.div animate={{ x: travel }} transition={directionalLoop}>
          <Finger />
        </motion.div>
      </div>
    </HintWrapper>
  );
}

function HoldHint() {
  return (
    <HintWrapper label="Hold">
      <div className="relative flex h-32 w-32 items-center justify-center">
        <div className="absolute inset-0 rounded-full bg-white/25 blur-2xl" />

        {/* Static outer ring */}
        <div className="absolute h-28 w-28 rounded-full border-2 border-white/25" />

        {/* Filling progress ring — reads as "keep holding" */}
        <svg
          className="absolute h-28 w-28 -rotate-90"
          viewBox="0 0 112 112"
          aria-hidden
        >
          <circle
            cx="56"
            cy="56"
            r="50"
            fill="none"
            stroke="rgba(255,255,255,0.15)"
            strokeWidth="3"
          />
          <motion.circle
            cx="56"
            cy="56"
            r="50"
            fill="none"
            stroke="white"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={314}
            animate={{ strokeDashoffset: [314, 0, 314] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "linear" }}
          />
        </svg>

        {/* Finger stays pressed down, then releases */}
        <motion.div
          animate={{ scale: [1, 0.82, 0.82, 1] }}
          transition={{
            duration: 2.2,
            repeat: Infinity,
            ease: "easeInOut",
            times: [0, 0.12, 0.82, 1],
          }}
        >
          <Finger pressed />
        </motion.div>
      </div>
    </HintWrapper>
  );
}

function FooterTapHint() {
  // Compact cue that sits directly on the Description pill (bottom-left).
  return (
    <div className="flex flex-col items-start">
      <span className="mb-1.5 rounded-full bg-white px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-ink shadow-[0_4px_24px_rgba(0,0,0,0.45)]">
        Tap the button
      </span>
      <div className="relative flex h-14 w-28 items-center justify-start pl-6">
        <div className="absolute left-4 top-1/2 h-12 w-12 -translate-y-1/2 rounded-full bg-white/25 blur-xl" />
        <motion.span
          className="absolute left-3 top-1/2 h-14 w-14 -translate-y-1/2 rounded-full border-2 border-white/60"
          animate={{ scale: [1, 1.18, 1], opacity: [0.7, 0.25, 0.7] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        />
        <motion.div
          animate={{ scale: [1, 0.88, 1] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        >
          <Finger />
        </motion.div>
      </div>
    </div>
  );
}

// Labels match the live ActionRail order (Hide interface replaced Fit / Fill).
const QUICK_ACTIONS = [
  "Artist profile",
  "Like",
  "Save",
  "Comment",
  "Download",
  "Share",
  "Hide interface",
];

function ActionsExplainer({ onAdvance }: { onAdvance?: () => void }) {
  return (
    <>
      {/* Callout sits left of the ActionRail, raised so it clears Got it. */}
      <div className="pointer-events-none absolute bottom-44 right-[4.25rem] flex flex-col items-end">
        <motion.div
          animate={{ x: [0, 6, 0] }}
          transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
          className="rounded-2xl border border-white/15 bg-black/55 p-3 backdrop-blur-md"
        >
          <ol className="space-y-1.5">
            {QUICK_ACTIONS.map((label, i) => (
              <li
                key={label}
                className="flex items-center gap-2 text-[12px] text-white/80"
              >
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white/15 text-[9px] font-bold text-white">
                  {i + 1}
                </span>
                {label}
              </li>
            ))}
          </ol>
        </motion.div>
      </div>

      {/* Got it CTA in the thumb zone. */}
      <div className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+6rem)] flex justify-center px-8">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onAdvance}
          className="pointer-events-auto rounded-full bg-white px-7 py-3.5 text-sm font-semibold text-ink shadow-[0_8px_32px_rgba(0,0,0,0.35)] transition-transform"
        >
          Got it
        </motion.button>
      </div>
    </>
  );
}

function GestureHint({ hint, footer = false }: { hint: HintKey; footer?: boolean }) {
  if (hint === "left" || hint === "right") {
    return <HorizontalSwipeHint direction={hint} />;
  }

  if (hint === "hold") {
    return <HoldHint />;
  }

  if (hint === "tap" && footer) {
    return <FooterTapHint />;
  }

  // "actions" is rendered separately by ActionsExplainer, never here.
  if (hint === "actions") return null;

  const labels: Record<
    Exclude<HintKey, "left" | "right" | "hold" | "actions">,
    string
  > = {
    vertical: "Swipe up / down",
    tap: "Tap",
    "swipe-up": "Swipe up",
  };

  return (
    <HintWrapper label={labels[hint]}>
      <div className="relative flex h-32 w-32 items-center justify-center">
        <div className="absolute h-28 w-28 rounded-full bg-white/25 blur-2xl" />
        <SpotlightRing className="h-24 w-24" />

        {hint === "vertical" && (
          <>
            <motion.div
              className="absolute -top-2 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]"
              animate={{ opacity: [0.4, 1, 0.4], y: [2, -2, 2] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            >
              <UpArrow className="h-7 w-7" />
            </motion.div>
            <motion.div
              className="absolute -bottom-2 rotate-180 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]"
              animate={{ opacity: [0.4, 1, 0.4], y: [-2, 2, -2] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            >
              <UpArrow className="h-7 w-7" />
            </motion.div>
            <motion.div
              animate={{ y: [16, -16, 16] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            >
              <Finger />
            </motion.div>
          </>
        )}

        {hint === "tap" && (
          <>
            <motion.span
              className="absolute h-16 w-16 rounded-full border-2 border-white/60"
              animate={{ scale: [1, 1.2, 1], opacity: [0.7, 0.25, 0.7] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            />
            <motion.div
              animate={{ scale: [1, 0.88, 1] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
            >
              <Finger />
            </motion.div>
          </>
        )}

        {hint === "swipe-up" && (
          <>
            <motion.div
              className="absolute -top-3 text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.8)]"
              animate={{ opacity: [0.4, 1, 0.4], y: [3, -3, 3] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
            >
              <UpArrow className="h-8 w-8" />
            </motion.div>
            <motion.div
              animate={{ y: [12, -12, 12] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            >
              <Finger />
            </motion.div>
          </>
        )}
      </div>
    </HintWrapper>
  );
}

function TutorialFinale({ onStart }: { onStart: () => void }) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      {/* Curated masterpiece — full bleed, sharp, no modal barrier */}
      <motion.div
        initial={{ scale: 1.06, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-0"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={FINALE_ARTWORK.image}
          alt=""
          aria-hidden
          className="h-full w-full object-cover"
        />
      </motion.div>

      {/* Soft vignettes — readability without hiding the art */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[42%] bg-gradient-to-b from-black/55 via-black/15 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[38%] bg-gradient-to-t from-black/65 via-black/20 to-transparent" />

      {/* Top — brand + headline */}
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+2.75rem)] px-8 text-center"
      >
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white text-[12px] font-bold text-ink shadow-lg">
            N
          </span>
          <span className="text-[12px] font-semibold uppercase tracking-[0.24em] text-white drop-shadow-md">
            Narsil
          </span>
        </div>
        <h2 className="font-serif text-[34px] leading-[1.08] tracking-tight text-white drop-shadow-[0_2px_24px_rgba(0,0,0,0.45)]">
          You&apos;re ready
        </h2>
        <p className="mx-auto mt-3 max-w-[17rem] text-[15px] leading-relaxed text-white/75 drop-shadow-md">
          Start exploring the endless public-domain museum.
        </p>
      </motion.div>

      {/* Bottom — frosted-glass CTA in the thumb zone */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+2rem)] px-8"
      >
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onStart}
          className="pointer-events-auto w-full rounded-full border border-sky-300/55 bg-white/10 py-4 text-[15px] font-semibold tracking-wide text-white shadow-[0_8px_32px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.18)] backdrop-blur-xl transition-colors hover:border-sky-200/70 hover:bg-white/15"
        >
          Start Exploring
        </motion.button>
      </motion.div>
    </div>
  );
}

export default function TutorialCoach({
  open,
  step,
  advancing = false,
  onSkip,
  onStart,
  onAdvance,
}: {
  open: boolean;
  /** 0..STEPS.length-1 for gesture steps, STEPS.length for the final card. */
  step: number;
  /** True during the pause after a correct gesture, before the next step. */
  advancing?: boolean;
  onSkip: () => void;
  onStart: () => void;
  /** Advances a non-gesture (informational) step, e.g. the quick-actions step. */
  onAdvance?: () => void;
}) {
  const isFinal = step >= STEPS.length;
  const current = STEPS[Math.min(step, STEPS.length - 1)];
  const confirming = advancing && !isFinal;
  const isActionsStep = !isFinal && current.hint === "actions";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="coach"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="pointer-events-none absolute inset-0 z-[80]"
        >
          {/* Gesture steps use a light vignette; the finale is full-bleed art. */}
          {!isFinal && (
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/30" />
          )}

          {!isFinal && (
            <button
              onClick={onSkip}
              className="pointer-events-auto absolute right-5 top-[calc(env(safe-area-inset-top)+1.25rem)] z-[3] rounded-full border border-white/10 bg-black/30 px-3.5 py-1.5 text-xs font-medium text-emerald-400 backdrop-blur-md transition-colors hover:text-emerald-300"
            >
              Skip
            </button>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="pointer-events-none absolute inset-0"
            >
              {isFinal ? (
                <TutorialFinale onStart={onStart} />
              ) : (
                <>
                  {/* Instruction card near the top. */}
                  <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+6.5rem)] flex flex-col items-center px-8 text-center">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
                      Step {step + 1} of {STEPS.length}
                    </span>
                    <h2 className="mt-2 font-serif text-[24px] leading-tight text-white">
                      {current.label}
                    </h2>
                    <p className="mt-2 max-w-[19rem] text-[14px] leading-relaxed text-white/65">
                      {current.instruction}
                    </p>
                  </div>

                  {/* The quick-actions step is informational — it points at the
                      right-side rail and advances via a "Got it" button. */}
                  {isActionsStep && (
                    <ActionsExplainer onAdvance={onAdvance} />
                  )}

                  {/* Animated gesture cue over the interaction zone — swapped
                      for a success confirmation during the post-gesture pause. */}
                  {!isActionsStep && (
                  <div
                    className={`absolute ${
                      current.zone === "footer"
                        ? tutorialFooterHintClass
                        : "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                    }`}
                  >
                    <AnimatePresence mode="wait" initial={false}>
                      {confirming ? (
                        <motion.div
                          key="confirm"
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                          className="flex flex-col items-center gap-3"
                        >
                          <motion.span
                            initial={{ scale: 0.5 }}
                            animate={{ scale: [0.5, 1.15, 1] }}
                            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                            className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-400/90 text-ink shadow-[0_0_30px_rgba(52,211,153,0.5)]"
                          >
                            <CheckIcon className="h-7 w-7" />
                          </motion.span>
                          <span className="rounded-full bg-black/45 px-3 py-1 text-[13px] font-medium text-white backdrop-blur-md">
                            {current.done}
                          </span>
                        </motion.div>
                      ) : (
                        <motion.div
                          key="cue"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          transition={{ duration: 0.2 }}
                        >
                          <GestureHint
                            hint={current.hint}
                            footer={current.zone === "footer"}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  )}
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
