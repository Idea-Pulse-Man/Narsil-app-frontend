import { motion } from "framer-motion";

interface MusicPromptProps {
  onEnable: () => void;
  onDecline: () => void;
}

/** First-launch prompt — user gesture unlocks audio autoplay on mobile. */
export default function MusicPrompt({ onEnable, onDecline }: MusicPromptProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[85] flex items-end justify-center bg-black/50 p-5 pb-[calc(env(safe-area-inset-bottom)+5.5rem)]"
    >
      <motion.div
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="w-full max-w-sm rounded-3xl border border-white/15 bg-ink-soft p-6 text-white shadow-2xl"
      >
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
          Ambient music
        </p>
        <h2 className="mt-2 font-serif text-xl leading-snug">
          Play soft classical music?
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-white/55">
          Soft public-domain classical piano — Bach and Chopin, suited for
          browsing art. You can turn it off anytime in Settings.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onDecline}
            className="flex-1 rounded-full border border-white/15 py-3 text-sm font-medium text-white/70 transition-colors hover:text-white"
          >
            No thanks
          </button>
          <button
            type="button"
            onClick={onEnable}
            className="flex-1 rounded-full bg-accent py-3 text-sm font-semibold text-ink"
          >
            Play music
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
