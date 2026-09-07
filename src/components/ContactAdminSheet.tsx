/**
 * Contact admin — email first, live chat last.
 * Opened from Profile (and Create when waiting on approval).
 * Live chat uses Supabase Realtime so admin replies appear immediately.
 */

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppState } from "./AppState";
import {
  SUPPORT_EMAIL,
  fetchMySupportMessages,
  openSupportEmail,
  sendSupportMessage,
  subscribeSupportThread,
  mergeSupportMessages,
  type SupportMessage,
} from "@/lib/support";
import { CloseIcon } from "./Icons";
import type { ToastState } from "./Toast";

type Panel = "choose" | "chat";

interface ContactAdminSheetProps {
  open: boolean;
  onClose: () => void;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
  /** Prefills the mailto subject (e.g. upload review). */
  emailSubject?: string;
}

export default function ContactAdminSheet({
  open,
  onClose,
  showToast,
  emailSubject = "Narsil support",
}: ContactAdminSheetProps) {
  const { user } = useAppState();
  const [panel, setPanel] = useState<Panel>("choose");
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  useEffect(() => {
    if (!open) {
      setPanel("choose");
      setDraft("");
      setLive(false);
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open || panel !== "chat") return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const rows = await fetchMySupportMessages();
        if (!cancelled) setMessages(rows);
      } catch (err) {
        if (!cancelled) {
          showToast(
            err instanceof Error ? err.message : "Could not load chat.",
            "error",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, panel, showToast]);

  // Realtime + poll: admin replies appear without refresh.
  useEffect(() => {
    if (!open || panel !== "chat" || !user?.id || loading) {
      setLive(false);
      return;
    }
    setLive(true);
    const rows = messagesRef.current;
    const after =
      rows.length > 0 ? rows[rows.length - 1]?.created_at ?? null : null;
    const stop = subscribeSupportThread(
      user.id,
      (row) => {
        setMessages((prev) => mergeSupportMessages(prev, row));
      },
      { afterCreatedAt: after },
    );
    return () => {
      setLive(false);
      stop();
    };
  }, [open, panel, user?.id, loading]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, panel]);

  const sendMail = () => {
    openSupportEmail({
      subject: emailSubject,
      body: "Hi Narsil team,\n\n",
    });
    showToast(`Opening mail to ${SUPPORT_EMAIL}`);
  };

  const sendChat = async () => {
    if (!draft.trim() || busy) return;
    setBusy(true);
    try {
      const row = await sendSupportMessage(draft);
      setMessages((prev) => mergeSupportMessages(prev, row));
      setDraft("");
    } catch (err) {
      showToast(
        err instanceof Error ? err.message : "Could not send.",
        "error",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
            className="absolute inset-0 z-[70] bg-ink/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 34 }}
            className="absolute inset-x-0 bottom-0 z-[71] flex max-h-[88%] flex-col rounded-t-[28px] border-t border-white/12 bg-ink-soft text-white shadow-placard"
          >
            <div className="flex items-center justify-between px-5 pb-2 pt-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">
                  Support
                </p>
                <h2 className="mt-1 font-serif text-xl text-white">
                  {panel === "chat" ? "Live chat" : "Contact admin"}
                </h2>
                {panel === "chat" && live && (
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-300/90">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    Live — replies appear instantly
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-white/15 p-2 text-white/70"
                aria-label="Close"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            {panel === "choose" ? (
              <div className="space-y-3 px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-2">
                <p className="text-sm text-white/55">
                  Reach the Narsil team about uploads, orders, or your account.
                </p>

                <button
                  type="button"
                  onClick={sendMail}
                  className="flex w-full flex-col items-start rounded-2xl border border-accent/35 bg-accent/15 px-4 py-4 text-left"
                >
                  <span className="text-sm font-semibold text-white">
                    Email admin
                  </span>
                  <span className="mt-1 text-xs text-white/55">
                    Recommended — opens your mail app to {SUPPORT_EMAIL}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setPanel("chat")}
                  className="flex w-full flex-col items-start rounded-2xl border border-white/12 bg-white/[0.04] px-4 py-4 text-left"
                >
                  <span className="text-sm font-medium text-white/85">
                    Live chat
                  </span>
                  <span className="mt-1 text-xs text-white/45">
                    Real-time chat — admin replies show up here instantly
                  </span>
                </button>
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
                <button
                  type="button"
                  onClick={() => setPanel("choose")}
                  className="px-5 pb-2 text-left text-xs text-white/45 hover:text-white/70"
                >
                  ← Back to options
                </button>

                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {loading && (
                    <p className="py-6 text-center text-sm text-white/40">
                      Loading…
                    </p>
                  )}
                  {!loading && messages.length === 0 && (
                    <p className="py-6 text-center text-sm text-white/40">
                      No messages yet. Say hello — an admin will reply here.
                    </p>
                  )}
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                        m.from_admin
                          ? "mr-auto border border-white/10 bg-white/[0.06] text-white/85"
                          : "ml-auto bg-accent text-ink"
                      }`}
                    >
                      {m.body}
                    </div>
                  ))}
                  <div ref={bottomRef} />
                </div>

                <div className="mt-2 flex gap-2 px-5 pt-2">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void sendChat();
                      }
                    }}
                    placeholder="Write a message…"
                    maxLength={4000}
                    className="min-w-0 flex-1 rounded-full border border-white/12 bg-white/[0.06] px-4 py-2.5 text-sm text-white placeholder:text-white/35 focus:border-white/25 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={busy || !draft.trim()}
                    onClick={() => void sendChat()}
                    className="rounded-full bg-white px-4 py-2.5 text-sm font-medium text-ink disabled:opacity-40"
                  >
                    Send
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
