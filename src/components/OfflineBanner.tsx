import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOnline } from "@/lib/online";

/**
 * A slim banner under the status bar while the phone has no connection —
 * art that already loaded stays on screen, so say that rather than letting
 * taps fail silently. Shows "Back online" for a moment when it returns.
 */
export default function OfflineBanner() {
  const online = useOnline();
  const [backOnline, setBackOnline] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setBackOnline(false);
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    setBackOnline(true);
    const timer = window.setTimeout(() => setBackOnline(false), 2500);
    return () => window.clearTimeout(timer);
  }, [online]);

  const show = !online || backOnline;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          role="status"
          aria-live="polite"
          initial={{ y: -40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0 }}
          className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+0.25rem)] z-[90] flex justify-center px-4"
        >
          <span
            className={`rounded-full px-4 py-2 text-[13px] font-medium shadow-lg backdrop-blur-md ${
              online
                ? "bg-emerald-500/90 text-white"
                : "bg-[#2a2420]/95 text-white/90 ring-1 ring-white/10"
            }`}
          >
            {online
              ? "Back online"
              : "You're offline — showing art you've already loaded"}
          </span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
