import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, LinkIcon, CloseIcon } from "./Icons";

export interface ToastState {
  id: number;
  message: string;
  variant?: "default" | "link" | "error";
}

export default function Toast({ toast }: { toast: ToastState | null }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-7 z-50 flex justify-center px-6">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className={`pointer-events-auto flex items-center gap-2.5 rounded-full border px-4 py-2.5 text-sm font-medium text-white shadow-rail backdrop-blur-xl ${
              toast.variant === "error"
                ? "border-red-400/30 bg-red-950/70"
                : "border-white/15 bg-black/70"
            }`}
          >
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-full ${
                toast.variant === "error" ? "bg-red-500/30" : "bg-white/15"
              }`}
            >
              {toast.variant === "link" ? (
                <LinkIcon className="h-3 w-3" />
              ) : toast.variant === "error" ? (
                <CloseIcon className="h-3 w-3" />
              ) : (
                <CheckIcon className="h-3 w-3" />
              )}
            </span>
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
