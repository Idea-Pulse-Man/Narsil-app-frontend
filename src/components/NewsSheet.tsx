/**
 * Member news reader — published posts from admin News tab.
 * Opened from Profile → News.
 */

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { fetchPublishedNews, type NewsPost } from "@/lib/news";
import { CloseIcon } from "./Icons";

interface NewsSheetProps {
  open: boolean;
  onClose: () => void;
}

export default function NewsSheet({ open, onClose }: NewsSheetProps) {
  const [rows, setRows] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState<NewsPost | null>(null);

  useEffect(() => {
    if (!open) {
      setActive(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const list = await fetchPublishedNews(40);
      if (!cancelled) {
        setRows(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

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
                  Narsil
                </p>
                <h2 className="mt-1 font-serif text-xl text-white">
                  {active ? active.title : "News"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (active) setActive(null);
                  else onClose();
                }}
                className="rounded-full border border-white/15 p-2 text-white/70"
                aria-label="Close"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {active ? (
                <article className="space-y-3 pt-2">
                  <p className="text-[11px] text-white/40">
                    {formatNewsDate(active.updated_at)}
                  </p>
                  {active.image_url && (
                    <div className="overflow-hidden rounded-2xl border border-white/10">
                      <img
                        src={active.image_url}
                        alt=""
                        className="max-h-56 w-full object-cover"
                      />
                    </div>
                  )}
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-white/80">
                    {active.body}
                  </p>
                  <button
                    type="button"
                    onClick={() => setActive(null)}
                    className="pt-2 text-xs text-white/45 hover:text-white/70"
                  >
                    ← All news
                  </button>
                </article>
              ) : (
                <div className="space-y-2 pt-1">
                  {loading && (
                    <p className="py-8 text-center text-sm text-white/40">
                      Loading…
                    </p>
                  )}
                  {!loading && rows.length === 0 && (
                    <p className="py-8 text-center text-sm text-white/40">
                      No news yet. Check back soon.
                    </p>
                  )}
                  {rows.map((row) => (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => setActive(row)}
                      className="flex w-full flex-col rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left"
                    >
                      <span className="truncate text-sm font-medium text-white">
                        {row.title}
                      </span>
                      <span className="mt-1 text-[11px] text-white/40">
                        {formatNewsDate(row.updated_at)}
                      </span>
                      <span className="mt-1.5 line-clamp-2 text-xs text-white/55">
                        {row.body}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function formatNewsDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
