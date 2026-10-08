/**
 * Admin dashboard — News tab. Create, edit, save, publish, delete posts.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  deleteNewsPost,
  fetchAdminNewsPosts,
  saveNewsPost,
  type NewsPost,
} from "@/lib/news";
import {
  AdminListCard,
  AdminState,
  Chip,
  fmtDate,
} from "./admin-ui";
import type { ToastState } from "./Toast";

interface AdminNewsProps {
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

export default function AdminNews({ showToast }: AdminNewsProps) {
  const [rows, setRows] = useState<NewsPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editor, setEditor] = useState<NewsPost | "new" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchAdminNewsPosts({ limit: 50, offset: 0 });
      setRows(page.rows);
      setTotal(page.total);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load news. Run supabase/news-posts.sql?",
      );
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (row: NewsPost) => {
    setBusy(row.id);
    try {
      await deleteNewsPost(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setTotal((t) => Math.max(0, t - 1));
      if (editor && editor !== "new" && editor.id === row.id) setEditor(null);
      showToast("News deleted");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => setEditor("new")}
        className="rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-ink"
      >
        New post
      </button>

      <div className="mt-4">
        <AdminState
          loading={loading}
          error={error}
          empty={rows.length === 0}
          emptyLabel="No news posts yet. Create one to share with members."
          onRetry={() => void load()}
        />

        {rows.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-white/50">
              {total} post{total === 1 ? "" : "s"}
            </p>
            {rows.map((row) => (
              <AdminListCard
                key={row.id}
                initial={row.title.slice(0, 2)}
                title={row.title}
                meta={`${fmtDate(row.updated_at)} · ${row.body.slice(0, 80)}${row.body.length > 80 ? "…" : ""}`}
                badges={
                  row.published ? (
                    <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[11px] text-emerald-200">
                      Published
                    </span>
                  ) : (
                    <span className="rounded-full border border-white/12 px-2 py-0.5 text-[11px] text-white/45">
                      Draft
                    </span>
                  )
                }
                actions={
                  <>
                    <Chip
                      label="Edit"
                      on
                      disabled={busy === row.id}
                      onClick={() => setEditor(row)}
                    />
                    <span className="flex-1" />
                    <Chip
                      label="Delete"
                      tone="danger"
                      disabled={busy === row.id}
                      onClick={() => void remove(row)}
                    />
                  </>
                }
              />
            ))}
          </div>
        )}
      </div>

      {editor && (
        <NewsEditorModal
          initial={editor === "new" ? null : editor}
          onClose={() => setEditor(null)}
          onSaved={async (saved) => {
            setEditor(null);
            await load();
            showToast(saved.published ? "Saved & published" : "Draft saved");
          }}
          showToast={showToast}
        />
      )}
    </div>
  );
}

function NewsEditorModal({
  initial,
  onClose,
  onSaved,
  showToast,
}: {
  initial: NewsPost | null;
  onClose: () => void;
  onSaved: (post: NewsPost) => Promise<void>;
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [body, setBody] = useState(initial?.body ?? "");
  const [imageUrl, setImageUrl] = useState(initial?.image_url ?? "");
  const [published, setPublished] = useState(initial?.published ?? false);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const saved = await saveNewsPost({
        id: initial?.id ?? null,
        title,
        body,
        imageUrl: imageUrl.trim() || null,
        published,
      });
      await onSaved(saved);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Save failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      title={initial ? "Edit news" : "New news"}
      onClose={onClose}
    >
      <Field label="Title">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className={fieldClass}
          placeholder="Announcement title"
        />
      </Field>
      <Field label="Body">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={8}
          maxLength={20000}
          className={`${fieldClass} min-h-[10rem] resize-y`}
          placeholder="Write the news for members…"
        />
      </Field>
      <Field label="Image URL (optional)">
        <input
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          className={fieldClass}
          placeholder="https://…"
        />
      </Field>
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip
          label="Draft"
          on={!published}
          onClick={() => setPublished(false)}
        />
        <Chip
          label="Published"
          on={published}
          onClick={() => setPublished(true)}
        />
      </div>
      <p className="mt-2 text-[11px] text-white/50">
        Published posts appear under Profile → News for members.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/70"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={busy || !title.trim() || !body.trim()}
          onClick={() => void save()}
          className="rounded-full bg-white px-4 py-2 text-sm font-medium text-ink disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </ModalShell>
  );
}

const fieldClass =
  "w-full rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-sm text-white placeholder:text-white/45 focus:border-white/25 focus:outline-none";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="mt-3 block">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/50">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-ink/80 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-[81] max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-[28px] border border-white/12 bg-ink-soft p-5 shadow-placard sm:rounded-[28px]">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/60"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
