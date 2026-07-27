/**
 * Admin dashboard — Artworks tab. Search + filter the whole catalog (not just
 * the newest page), flip moderation/commerce flags, and take a work down.
 *
 * `hidden` drops a work out of the default feed (see lib/feed-utils), `featured`
 * pins it in regardless of engagement, `for_sale` allows canvas checkout — and
 * only ever on artist originals, which is why the Sell chip is hidden for
 * public-domain works (BuyView gates on origin too).
 */

import { useCallback, useEffect, useState } from "react";
import { useCatalog } from "@/data/catalog";
import {
  ADMIN_PAGE_SIZE,
  ARTWORK_FILTERS,
  deleteArtwork,
  fetchAdminArtworks,
  updateArtworkFlags,
  type AdminArtworkRow,
  type ArtworkFilter,
  type ArtworkFlag,
} from "@/lib/admin";
import BlurImage from "./BlurImage";
import {
  AdminSearch,
  AdminState,
  Chip,
  FilterTabs,
  Pager,
  fmtDate,
  useDebounced,
} from "./admin-ui";
import type { ToastState } from "./Toast";

interface AdminArtworksProps {
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

export default function AdminArtworks({ showToast }: AdminArtworksProps) {
  const { refresh } = useCatalog();
  const [rows, setRows] = useState<AdminArtworkRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ArtworkFilter>("all");
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const query = useDebounced(search);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchAdminArtworks({
        search: query,
        filter,
        offset,
        limit: ADMIN_PAGE_SIZE,
      });
      setRows(page.rows);
      setTotal(page.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load artworks.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [query, filter, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = async (row: AdminArtworkRow, flag: ArtworkFlag) => {
    const next = !row[flag];
    setBusy(row.id);
    try {
      await updateArtworkFlags(row.id, { [flag]: next });
      // Patch locally so the chip responds immediately; the feed refresh below
      // makes the change visible outside the dashboard.
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, [flag]: next } : r)),
      );
      showToast(next ? `${LABELS[flag]} on` : `${LABELS[flag]} off`);
      await refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  const remove = async (row: AdminArtworkRow) => {
    setBusy(row.id);
    try {
      await deleteArtwork(row.id);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
      setTotal((t) => Math.max(0, t - 1));
      showToast("Artwork deleted");
      await refresh();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Delete failed.", "error");
    } finally {
      setBusy(null);
      setConfirmDelete(null);
    }
  };

  return (
    <div className="mt-5">
      {/* Both controls reset paging here rather than in an effect, so a new
          query never fires a throwaway fetch at the old offset. */}
      <AdminSearch
        value={search}
        onChange={(next) => {
          setSearch(next);
          setOffset(0);
        }}
        placeholder="Search titles…"
      />
      <div className="mt-3">
        <FilterTabs
          value={filter}
          options={ARTWORK_FILTERS}
          onChange={(next) => {
            setFilter(next);
            setOffset(0);
          }}
        />
      </div>

      <div className="mt-4">
        <AdminState
          loading={loading}
          error={error}
          empty={rows.length === 0}
          emptyLabel={
            query ? `No artworks match “${query}”.` : "No artworks in this view."
          }
          onRetry={() => void load()}
        />

        {rows.length > 0 && (
          <div className="space-y-3">
            {rows.map((row) => {
              // Sell only applies to artist originals (BuyView gates on origin
              // too) — but still offer the chip on a mis-flagged work so an
              // admin can clear it.
              const sellable = row.origin === "artist-original" || row.for_sale;
              return (
                <div
                  key={row.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/5">
                      {row.image_url && (
                        <BlurImage
                          src={row.image_url}
                          alt={row.title}
                          accent={row.accent ?? "#22242b"}
                          thumbWidth={128}
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-white">
                        {row.title}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-white/45">
                        ♥ {row.like_count} · ★ {row.save_count} ·{" "}
                        {fmtDate(row.created_at)}
                      </p>
                      <p className="mt-0.5 truncate text-[11px] text-white/30">
                        {row.created_by ? "User upload" : "Museum ingest"} ·{" "}
                        {row.artist_id ?? "unknown artist"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Chip
                      label="Feature"
                      on={row.featured}
                      disabled={busy === row.id}
                      onClick={() => void toggle(row, "featured")}
                    />
                    <Chip
                      label="Hide"
                      on={row.hidden}
                      disabled={busy === row.id}
                      onClick={() => void toggle(row, "hidden")}
                    />
                    {sellable && (
                      <Chip
                        label="Sell"
                        on={row.for_sale}
                        disabled={busy === row.id}
                        onClick={() => void toggle(row, "for_sale")}
                      />
                    )}
                    <span className="flex-1" />
                    {confirmDelete === row.id ? (
                      <>
                        <span className="w-full text-[11px] text-red-300/70">
                          Also removes its saves, likes, comments and tags.
                          Existing canvas orders are kept.
                        </span>
                        <Chip
                          label="Confirm"
                          on
                          tone="danger"
                          disabled={busy === row.id}
                          onClick={() => void remove(row)}
                        />
                        <Chip
                          label="Cancel"
                          onClick={() => setConfirmDelete(null)}
                        />
                      </>
                    ) : (
                      <Chip
                        label="Delete"
                        tone="danger"
                        disabled={busy === row.id}
                        onClick={() => setConfirmDelete(row.id)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Pager
          offset={offset}
          limit={ADMIN_PAGE_SIZE}
          total={total}
          onOffset={setOffset}
        />
      </div>
    </div>
  );
}

const LABELS: Record<ArtworkFlag, string> = {
  featured: "Featured",
  hidden: "Hidden",
  for_sale: "For sale",
};
