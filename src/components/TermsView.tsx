import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { TERMS_BODY, TERMS_VERSION } from "@/lib/terms";
import { CloseIcon } from "./Icons";

interface TermsViewProps {
  onAccept: () => void;
  /** When false, user must scroll to bottom before accepting. */
  required?: boolean;
  onClose?: () => void;
}

export default function TermsView({
  onAccept,
  required = true,
  onClose,
}: TermsViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(!required);
  const [checked, setChecked] = useState(false);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || scrolledToEnd) return;
    const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
    if (atEnd) setScrolledToEnd(true);
  };

  const canAccept = scrolledToEnd && checked;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[82] flex flex-col bg-ink"
    >
      <div className="flex shrink-0 items-center justify-between border-b border-white/10 px-5 pb-3 pt-[calc(env(safe-area-inset-top)+1rem)]">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Legal
          </p>
          <h1 className="font-serif text-xl text-white">Terms of Service</h1>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-white/70">
          {TERMS_BODY}
        </pre>
        <p className="mt-4 text-[11px] text-white/35">Version {TERMS_VERSION}</p>
      </div>

      <div className="shrink-0 border-t border-white/10 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-white/30"
          />
          <span className="text-sm leading-snug text-white/70">
            I have read and agree to the Terms of Service. I understand use of
            Narsil is at my own risk and the service is provided without
            warranty.
          </span>
        </label>
        {!scrolledToEnd && required && (
          <p className="mt-2 text-xs text-white/40">Scroll to the end to continue.</p>
        )}
        <button
          type="button"
          disabled={!canAccept}
          onClick={onAccept}
          className="mt-4 flex w-full items-center justify-center rounded-full bg-white py-3.5 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          I Agree
        </button>
      </div>
    </motion.div>
  );
}
