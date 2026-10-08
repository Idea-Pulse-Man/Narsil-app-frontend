import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Artwork } from "@/data";
import { SUPABASE_ENABLED } from "@/lib/supabase";
import {
  addComment,
  deleteComment,
  fetchComments,
  subscribeComments,
  COMMENT_MAX,
  type Comment,
} from "@/lib/comments";
import { useAppState } from "./AppState";
import ArtistAvatar from "./ArtistAvatar";
import { CommentIcon, CloseIcon, TrashIcon } from "./Icons";

interface ArtDiscussionProps {
  artwork: Artwork;
  open: boolean;
  onClose: () => void;
}

/** Monogram initials from a display name (up to two letters). */
function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Compact relative time: "now", "5m", "2h", "3d", or a date beyond a week. */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 45) return "now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(then).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export default function ArtDiscussion({
  artwork,
  open,
  onClose,
}: ArtDiscussionProps) {
  const { user, profile, isGuest } = useAppState();

  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Merge helper — keep the thread ordered and free of duplicate ids (a comment
  // can arrive both from our own POST response and from the realtime stream).
  const upsert = useCallback((incoming: Comment) => {
    setComments((prev) => {
      if (prev.some((c) => c.id === incoming.id)) return prev;
      const next = [...prev, incoming];
      next.sort((a, b) => a.created_at.localeCompare(b.created_at));
      return next;
    });
  }, []);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const el = listRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }, []);

  // Load the thread + subscribe to live inserts while the sheet is open.
  useEffect(() => {
    if (!open || !SUPABASE_ENABLED) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    void (async () => {
      const rows = await fetchComments(artwork.id);
      if (cancelled) return;
      setComments(rows);
      setLoading(false);
      scrollToBottom();
    })();

    const unsubscribe = subscribeComments(artwork.id, (c) => {
      if (!cancelled) upsert(c);
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [open, artwork.id, upsert, scrollToBottom]);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const displayName = profile?.full_name?.trim() || (isGuest ? "Guest" : "You");

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const body = text.trim();
      if (!body || submitting) return;

      setSubmitting(true);
      setError(null);

      // Optimistic row so the comment shows instantly; reconciled on response.
      const tempId = `temp-${Date.now()}`;
      const optimistic: Comment = {
        id: tempId,
        artwork_id: artwork.id,
        user_id: user?.id ?? "me",
        author_name: displayName,
        author_avatar: profile?.avatar_url ?? null,
        body,
        created_at: new Date().toISOString(),
      };
      setComments((prev) => [...prev, optimistic]);
      setText("");
      scrollToBottom();

      try {
        const saved = await addComment({
          artworkId: artwork.id,
          body,
          authorName: displayName,
          authorAvatar: profile?.avatar_url ?? null,
        });
        setComments((prev) => {
          const withoutTemp = prev.filter((c) => c.id !== tempId);
          if (!saved || withoutTemp.some((c) => c.id === saved.id)) {
            return withoutTemp;
          }
          const next = [...withoutTemp, saved];
          next.sort((a, b) => a.created_at.localeCompare(b.created_at));
          return next;
        });
      } catch {
        // Roll back the optimistic row and let the user retry.
        setComments((prev) => prev.filter((c) => c.id !== tempId));
        setText(body);
        setError("Couldn't post your comment. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [text, submitting, artwork.id, user?.id, displayName, profile?.avatar_url, scrollToBottom],
  );

  const handleDelete = useCallback(async (id: string) => {
    const snapshot = id;
    setComments((prev) => prev.filter((c) => c.id !== snapshot));
    try {
      await deleteComment(snapshot);
    } catch {
      // Best-effort: reload to resync on failure.
      const rows = await fetchComments(artwork.id);
      setComments(rows);
    }
  }, [artwork.id]);

  const hasComments = comments.length > 0;

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            onClick={onClose}
            className="absolute inset-0 z-40 bg-black/50"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 36 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.4 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 500) onClose();
            }}
            className="absolute inset-x-0 bottom-0 z-50 flex max-h-[80%] flex-col rounded-t-[28px] border-t border-white/10 bg-ink-soft/95 text-white shadow-placard backdrop-blur-2xl"
          >
            <div className="flex flex-col items-center pb-1 pt-3">
              <div className="h-1.5 w-11 rounded-full bg-white/15" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-6 pt-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <CommentIcon className="h-[18px] w-[18px] text-white/70" />
                  <h2 className="font-serif text-lg leading-none text-white">
                    Art Discussion
                  </h2>
                </div>
                <p className="mt-1.5 truncate text-xs text-white/45">
                  {hasComments
                    ? `${comments.length} comment${comments.length === 1 ? "" : "s"} · `
                    : ""}
                  <span className="text-white/65">{artwork.title}</span>
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close discussion"
                className="relative -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/55 transition-colors hover:bg-white/10 hover:text-white after:absolute after:-inset-2 after:content-['']"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            {/* Comments */}
            <div
              ref={listRef}
              className="mt-3 flex-1 space-y-0.5 overflow-y-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {loading && !hasComments ? (
                <div className="space-y-2 px-3 py-2">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="flex animate-pulse gap-3 py-1.5">
                      <div className="h-9 w-9 shrink-0 rounded-full bg-white/10" />
                      <div className="flex-1 space-y-2 py-1">
                        <div className="h-2.5 w-24 rounded bg-white/10" />
                        <div className="h-2.5 w-3/4 rounded bg-white/[0.07]" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : !hasComments ? (
                <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                  <CommentIcon className="h-8 w-8 text-white/20" />
                  <p className="mt-3 text-sm text-white/55">
                    No comments yet
                  </p>
                  <p className="mt-1 text-xs text-white/50">
                    Be the first to start the discussion.
                  </p>
                </div>
              ) : (
                comments.map((comment) => {
                  const mine = !!user && comment.user_id === user.id;
                  const pending = comment.id.startsWith("temp-");
                  return (
                    <div
                      key={comment.id}
                      className={`group flex gap-3 rounded-2xl px-3 py-2.5 transition-opacity ${
                        pending ? "opacity-60" : ""
                      }`}
                    >
                      <ArtistAvatar
                        src={comment.author_avatar ?? undefined}
                        name={comment.author_name ?? "Guest"}
                        initials={initialsOf(comment.author_name)}
                        lookup={false}
                        size={36}
                        className="h-9 w-9 shrink-0 rounded-full text-[11px] font-semibold"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-medium text-white">
                            {comment.author_name || "Guest"}
                          </span>
                          <span className="shrink-0 text-[11px] text-white/50">
                            {pending ? "sending…" : relativeTime(comment.created_at)}
                          </span>
                          {mine && !pending && (
                            <button
                              onClick={() => handleDelete(comment.id)}
                              aria-label="Delete comment"
                              className="ml-auto shrink-0 rounded-full p-1 text-white/25 opacity-0 transition-colors hover:text-rose-400 focus:opacity-100 group-hover:opacity-100"
                            >
                              <TrashIcon className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-relaxed text-white/75">
                          {comment.body}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer — composer */}
            <div className="border-t border-white/10 px-4 pb-7 pt-3">
              {SUPABASE_ENABLED ? (
                <>
                  <form
                    onSubmit={handleSubmit}
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-2.5 pl-4 pr-2.5 focus-within:border-white/25"
                  >
                    <input
                      ref={inputRef}
                      value={text}
                      onChange={(e) => setText(e.target.value.slice(0, COMMENT_MAX))}
                      maxLength={COMMENT_MAX}
                      enterKeyHint="send"
                      placeholder="Join the discussion…"
                      className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/45 outline-none"
                    />
                    <button
                      type="submit"
                      disabled={!text.trim() || submitting}
                      className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-[12px] font-semibold text-ink transition-opacity disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
                    >
                      {submitting ? "…" : "Post"}
                    </button>
                  </form>
                  {error ? (
                    <p className="mt-2.5 text-center text-[11px] text-rose-300/80">
                      {error}
                    </p>
                  ) : (
                    <p className="mt-2.5 text-center text-[11px] text-white/50">
                      Posting as {displayName}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] py-2.5 pl-4 pr-2.5">
                    <input
                      disabled
                      placeholder="Join the discussion…"
                      className="min-w-0 flex-1 cursor-not-allowed bg-transparent text-sm text-white placeholder:text-white/45 outline-none"
                    />
                    <span className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-medium text-white/50">
                      Post
                    </span>
                  </div>
                  <p className="mt-2.5 text-center text-[11px] text-white/50">
                    Connect a backend to enable live discussion
                  </p>
                </>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
