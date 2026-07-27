/**
 * Admin dashboard — Users tab. Search accounts, see their activity, promote or
 * demote admins, and suspend abusive accounts.
 *
 * Suspension is deliberately not a ban: the account keeps reading and can still
 * receive orders, but RLS blocks new comments, tags and uploads (see
 * `is_suspended()` in supabase/admin-dashboard.sql). Role and suspension both
 * go through security-definer RPCs — `profiles.role` is not client-writable, or
 * any user could make themselves an admin.
 */

import { useCallback, useEffect, useState } from "react";
import { useAppState } from "./AppState";
import {
  ADMIN_PAGE_SIZE,
  fetchAdminUsers,
  setUserRole,
  setUserSuspended,
  type AdminUserRow,
} from "@/lib/admin";
import {
  AdminSearch,
  AdminState,
  Chip,
  Pager,
  fmtDate,
  useDebounced,
} from "./admin-ui";
import type { ToastState } from "./Toast";

interface AdminUsersProps {
  showToast: (message: string, variant?: ToastState["variant"]) => void;
}

export default function AdminUsers({ showToast }: AdminUsersProps) {
  const { user } = useAppState();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const query = useDebounced(search);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchAdminUsers({
        search: query,
        offset,
        limit: ADMIN_PAGE_SIZE,
      });
      setRows(page.rows);
      setTotal(page.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load users.");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [query, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchRow = (id: string, patch: Partial<AdminUserRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const toggleAdmin = async (row: AdminUserRow) => {
    const next = row.role === "admin" ? "user" : "admin";
    setBusy(row.id);
    try {
      await setUserRole(row.id, next);
      patchRow(row.id, { role: next });
      showToast(next === "admin" ? "Promoted to admin" : "Admin access removed");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  const toggleSuspended = async (row: AdminUserRow) => {
    const next = row.suspended_at === null;
    setBusy(row.id);
    try {
      await setUserSuspended(row.id, next);
      patchRow(row.id, { suspended_at: next ? new Date().toISOString() : null });
      showToast(next ? "Account suspended" : "Account reinstated");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-5">
      <AdminSearch
        value={search}
        onChange={(next) => {
          setSearch(next);
          setOffset(0);
        }}
        placeholder="Search name or email…"
      />

      <div className="mt-4">
        <AdminState
          loading={loading}
          error={error}
          empty={rows.length === 0}
          emptyLabel={
            query ? `No users match “${query}”.` : "No user accounts yet."
          }
          onRetry={() => void load()}
        />

        {rows.length > 0 && (
          <div className="space-y-3">
            {rows.map((row) => {
              const self = row.id === user?.id;
              const suspended = row.suspended_at !== null;
              return (
                <div
                  key={row.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-white">
                        {row.full_name?.trim() || row.email || "Guest account"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-white/45">
                        {row.email ?? "no email (anonymous)"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {row.role === "admin" && (
                        <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] text-white/80">
                          Admin
                        </span>
                      )}
                      {suspended && (
                        <span className="rounded-full border border-red-400/30 bg-red-500/15 px-2 py-0.5 text-[11px] text-red-200">
                          Suspended
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="mt-2 text-[11px] text-white/35">
                    Joined {fmtDate(row.created_at)} · {row.order_count} order
                    {row.order_count === 1 ? "" : "s"} · {row.artwork_count} upload
                    {row.artwork_count === 1 ? "" : "s"} ·{" "}
                    {row.terms_accepted_at ? "ToS accepted" : "ToS pending"}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {/* The RPCs refuse self-demotion and self-suspension; the
                        chips are disabled here so it never reads as a failure. */}
                    <Chip
                      label={row.role === "admin" ? "Admin" : "Make admin"}
                      on={row.role === "admin"}
                      disabled={busy === row.id || self}
                      onClick={() => void toggleAdmin(row)}
                    />
                    <Chip
                      label={suspended ? "Reinstate" : "Suspend"}
                      on={suspended}
                      tone={suspended ? "neutral" : "danger"}
                      disabled={busy === row.id || self}
                      onClick={() => void toggleSuspended(row)}
                    />
                    {self && (
                      <span className="self-center text-[11px] text-white/25">
                        This is you
                      </span>
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
