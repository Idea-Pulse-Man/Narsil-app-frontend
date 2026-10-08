import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { TERMS_BODY, TERMS_VERSION } from "@/lib/terms";
import { CloseIcon } from "./Icons";

interface TermsViewProps {
  onAccept: () => void;
  /** When false, user must scroll to bottom before accepting. */
  required?: boolean;
  onClose?: () => void;
}

function isScrollAtEnd(el: HTMLElement) {
  if (el.scrollHeight <= el.clientHeight + 1) return true;
  return el.scrollTop + el.clientHeight >= el.scrollHeight - 48;
}

export default function TermsView({
  onAccept,
  required = true,
  onClose,
}: TermsViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const endSentinelRef = useRef<HTMLDivElement>(null);
  const scrolledToEndRef = useRef(!required);
  const scrollRafRef = useRef<number | null>(null);
  const [scrolledToEnd, setScrolledToEnd] = useState(!required);
  const [checked, setChecked] = useState(false);

  const markScrolledToEnd = useCallback(() => {
    if (scrolledToEndRef.current) return;
    scrolledToEndRef.current = true;
    setScrolledToEnd(true);
  }, []);

  const checkScrollEnd = useCallback(() => {
    if (scrolledToEndRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    if (isScrollAtEnd(el)) markScrolledToEnd();
  }, [markScrolledToEnd]);

  const scheduleScrollCheck = useCallback(() => {
    if (scrolledToEndRef.current || scrollRafRef.current !== null) return;
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      checkScrollEnd();
    });
  }, [checkScrollEnd]);

  useEffect(() => {
    if (!required) return;

    checkScrollEnd();

    const el = scrollRef.current;
    const sentinel = endSentinelRef.current;
    if (!el || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          markScrolledToEnd();
        }
      },
      { root: el, threshold: 0, rootMargin: "0px 0px 48px 0px" }
    );
    observer.observe(sentinel);

    return () => {
      observer.disconnect();
      if (scrollRafRef.current !== null) {
        cancelAnimationFrame(scrollRafRef.current);
        scrollRafRef.current = null;
      }
    };
  }, [required, checkScrollEnd, markScrolledToEnd]);

  const canAccept = scrolledToEnd && checked;
  const canCheck = !required || scrolledToEnd;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 z-[82] flex touch-none flex-col bg-ink"
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
            className="relative flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 after:absolute after:-inset-2 after:content-['']"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        onScroll={scheduleScrollCheck}
        onTouchEnd={scheduleScrollCheck}
        className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain px-5 py-4 [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden"
      >
        <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-white/70">
          {TERMS_BODY}
        </pre>
        <p className="mt-4 text-[11px] text-white/50">Version {TERMS_VERSION}</p>
        <div ref={endSentinelRef} className="h-px w-full shrink-0" aria-hidden="true" />
      </div>

      <div className="shrink-0 border-t border-white/10 px-5 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-4">
        <label
          className={`flex items-start gap-3 ${canCheck ? "cursor-pointer" : "cursor-not-allowed opacity-60"}`}
        >
          <input
            type="checkbox"
            checked={checked}
            disabled={!canCheck}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-1 h-4 w-4 rounded border-white/30 disabled:cursor-not-allowed"
          />
          <span className="text-sm leading-snug text-white/70">
            I have read and agree to the Terms of Service. I understand use of
            Narsil is at my own risk and the service is provided without
            warranty.
          </span>
        </label>
        {!scrolledToEnd && required && (
          <p className="mt-2 text-xs text-white/50">Scroll to the end to continue.</p>
        )}
        <button
          type="button"
          disabled={!canAccept}
          onClick={onAccept}
          className="mt-4 flex w-full items-center justify-center rounded-full bg-accent py-3.5 text-sm font-semibold text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          I Agree
        </button>
      </div>
    </motion.div>
  );
}
