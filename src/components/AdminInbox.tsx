/**
 * Admin dashboard — Inbox tab. Reply to member live-chat threads.
 * Realtime inserts keep the open thread and conversation list in sync.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchSupportThread,
  fetchSupportThreads,
  markSupportThreadRead,
  mergeSupportMessages,
  replySupportMessage,
  subscribeSupportInbox,
  subscribeSupportThread,
  type SupportMessage,
  type SupportThreadSummary,
} from "@/lib/support";
import SupportChatTranscript from "./SupportChatTranscript";
import { AdminState, fmtDate } from "./admin-ui";
import type { ToastState } from "./Toast";

interface AdminInboxProps {
  showToast: (message: string, variant?: ToastState["variant"]) => void;
  /** Called after threads load / reply so the Inbox tab badge can refresh. */
  onThreadsChanged?: () => void;
  /** Optimistic: unread badge −1 when opening an unread thread. */
  onUnreadCleared?: () => void;
}

function threadIsUnread(t: SupportThreadSummary): boolean {
  return t.unread ?? !t.last_from_admin;
}

export default function AdminInbox({
  showToast,
  onThreadsChanged,
  onUnreadCleared,
}: AdminInboxProps) {
  const [threads, setThreads] = useState<SupportThreadSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  const loadThreads = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchSupportThreads({ limit: 50, offset: 0 });
      setThreads(page.rows);
      setTotal(page.total);
      onThreadsChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load inbox.");
      setThreads([]);
    } finally {
      setLoading(false);
    }
  }, [onThreadsChanged]);

  const refreshThreadsQuiet = useCallback(async () => {
    try {
      const page = await fetchSupportThreads({ limit: 50, offset: 0 });
      setThreads(page.rows);
      setTotal(page.total);
      onThreadsChanged?.();
    } catch {
      /* keep current list */
    }
  }, [onThreadsChanged]);

  const markRead = useCallback(
    async (userId: string) => {
      try {
        await markSupportThreadRead(userId);
      } catch {
        /* SQL not applied yet — ignore */
      }
      setThreads((prev) =>
        prev.map((t) =>
          t.user_id === userId ? { ...t, unread: false } : t,
        ),
      );
      onThreadsChanged?.();
    },
    [onThreadsChanged],
  );

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  // Inbox list: any new message refreshes threads + badge.
  useEffect(() => {
    return subscribeSupportInbox(() => {
      void refreshThreadsQuiet();
    });
  }, [refreshThreadsQuiet]);

  // Open thread: stream + poll new messages live.
  useEffect(() => {
    if (!activeId || threadLoading) return;
    const rows = messages;
    const after =
      rows.length > 0 ? rows[rows.length - 1]?.created_at ?? null : null;
    return subscribeSupportThread(
      activeId,
      (row) => {
        setMessages((prev) => mergeSupportMessages(prev, row));
        if (!row.from_admin && activeIdRef.current === activeId) {
          void markRead(activeId);
        } else {
          void refreshThreadsQuiet();
        }
      },
      { afterCreatedAt: after },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when thread opens
  }, [activeId, threadLoading, refreshThreadsQuiet, markRead]);

  const openThread = async (userId: string) => {
    const prior = threads.find((t) => t.user_id === userId);
    const wasUnread = prior ? threadIsUnread(prior) : false;
    setActiveId(userId);
    setThreadLoading(true);
    setDraft("");
    // Clear New / tab badge immediately while the thread loads.
    setThreads((prev) =>
      prev.map((t) =>
        t.user_id === userId ? { ...t, unread: false } : t,
      ),
    );
    if (wasUnread) onUnreadCleared?.();
    void markRead(userId);
    try {
      setMessages(await fetchSupportThread(userId));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not load thread.", "error");
      setMessages([]);
    } finally {
      setThreadLoading(false);
    }
  };

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeId]);

  const reply = async () => {
    if (!activeId || !draft.trim() || busy) return;
    setBusy(true);
    try {
      const row = await replySupportMessage(activeId, draft);
      setMessages((prev) => {
        if (prev.some((m) => m.id === row.id)) return prev;
        return [...prev, row];
      });
      setDraft("");
      await refreshThreadsQuiet();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Reply failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const active = threads.find((t) => t.user_id === activeId) ?? null;

  if (activeId) {
    return (
      <div className="mt-5 flex min-h-[24rem] flex-col">
        <button
          type="button"
          onClick={() => setActiveId(null)}
          className="text-left text-sm text-white/55 hover:text-white"
        >
          ← All conversations
        </button>
        <p className="mt-2 truncate text-sm text-white">
          {active?.full_name?.trim() || active?.email || activeId}
        </p>
        <p className="flex items-center gap-2 text-xs text-white/50">
          <span>{active?.email ?? "no email"}</span>
          <span className="inline-flex items-center gap-1 text-emerald-300/90">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
            Live
          </span>
        </p>

        <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-2xl border border-white/10 bg-white/[0.03] p-3">
          {threadLoading && (
            <p className="py-6 text-center text-sm text-white/50">Loading…</p>
          )}
          {!threadLoading && messages.length > 0 && (
            <SupportChatTranscript messages={messages} perspective="admin" />
          )}
          <div ref={bottomRef} />
        </div>

        <div className="mt-3 flex gap-2">
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void reply();
              }
            }}
            placeholder="Reply as admin…"
            className="min-w-0 flex-1 rounded-full border border-white/12 bg-white/[0.06] px-4 py-2.5 text-sm text-white placeholder:text-white/45"
          />
          <button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={() => void reply()}
            className="rounded-full bg-white px-4 py-2.5 text-sm font-medium text-ink disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-5">
      <AdminState
        loading={loading}
        error={error}
        empty={threads.length === 0}
        emptyLabel="No live-chat messages yet."
        onRetry={() => void loadThreads()}
      />

      {threads.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-white/50">
            {total} conversation{total === 1 ? "" : "s"} · live
          </p>
          {threads.map((t) => {
            const unread = threadIsUnread(t);
            return (
            <button
              key={t.user_id}
              type="button"
              onClick={() => void openThread(t.user_id)}
              className={`flex w-full flex-col rounded-2xl border px-4 py-3 text-left ${
                unread
                  ? "border-red-400/25 bg-red-500/10"
                  : "border-white/10 bg-white/[0.04]"
              }`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm text-white">
                  {t.full_name?.trim() || t.email || "Member"}
                </span>
                <span className="flex shrink-0 items-center gap-2 text-[11px] text-white/50">
                  {unread && (
                    <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                      New
                    </span>
                  )}
                  {fmtDate(t.last_at)}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-white/45">
                {t.last_from_admin ? "You: " : ""}
                {t.last_body}
              </p>
            </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
