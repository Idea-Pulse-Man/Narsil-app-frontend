/**
 * Admin dashboard — Users tab. Search and filter accounts, change status
 * (Good / Paused / Suspended), promote admins, trigger password resets, and
 * see Guild (Pro) subscription state.
 *
 * Status + role go through security-definer RPCs (see
 * supabase/admin-users-enrich.sql). Password reset uses Supabase Auth recovery
 * email — only works when the account has an email address.
 */

import { useCallback, useEffect, useState } from "react";
import { WORLD } from "@/data/worldCopy";
import { useAppState } from "./AppState";
import {
  ADMIN_PAGE_SIZE,
  USER_FILTERS,
  fetchAdminUsers,
  sendPasswordResetEmail,
  setAccountStatus,
  setUserRole,
  type AccountStatus,
  type AdminUserFilter,
  type AdminUserRow,
} from "@/lib/admin";
import { planLabel } from "@/lib/subscription";
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
  const [filter, setFilter] = useState<AdminUserFilter>("all");
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const query = useDebounced(search);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchAdminUsers({
        search: query,
        filter,
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
  }, [query, filter, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const patchRow = (id: string, patch: Partial<AdminUserRow>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const changeStatus = async (row: AdminUserRow, status: AccountStatus) => {
    if (accountStatusOf(row) === status) return;
    setBusy(row.id);
    try {
      await setAccountStatus(row.id, status);
      patchRow(row.id, {
        account_status: status,
        suspended_at:
          status === "suspended" ? new Date().toISOString() : null,
      });
      showToast(
        status === "active"
          ? "Marked good (active)"
          : status === "paused"
            ? "Account paused"
            : "Account suspended",
      );
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Update failed.", "error");
    } finally {
      setBusy(null);
    }
  };

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

  const resetPassword = async (row: AdminUserRow) => {
    if (!row.email) {
      showToast("No email on this account — can't send a reset.", "error");
      return;
    }
    setBusy(row.id);
    try {
      await sendPasswordResetEmail(row.email);
      showToast(`Reset email sent to ${row.email}`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Reset failed.", "error");
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
      <div className="mt-3">
        <FilterTabs
          value={filter}
          options={USER_FILTERS}
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
            query
              ? `No users match “${query}”.`
              : filter === "all"
                ? "No user accounts yet."
                : "No users in this filter."
          }
          onRetry={() => void load()}
        />

        {rows.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs text-white/40">
              {total} account{total === 1 ? "" : "s"}
            </p>
            {rows.map((row) => {
              const self = row.id === user?.id;
              const status = accountStatusOf(row);
              const open = openId === row.id;
              const guild = Boolean(row.is_subscriber);
              return (
                <div
                  key={row.id}
                  className="rounded-2xl border border-white/10 bg-white/[0.04]"
                >
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : row.id)}
                    className="flex w-full items-start justify-between gap-3 p-4 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-white">
                        {row.full_name?.trim() || row.email || "Guest account"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-white/45">
                        {row.email ?? "no email (anonymous)"}
                      </p>
                      <p className="mt-2 text-[11px] text-white/35">
                        Joined {fmtDate(row.created_at)} · {row.order_count} order
                        {row.order_count === 1 ? "" : "s"} · {row.artwork_count}{" "}
                        upload{row.artwork_count === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <StatusBadge status={status} />
                      {row.role === "admin" && (
                        <span className="rounded-full border border-white/20 bg-white/10 px-2 py-0.5 text-[11px] text-white/80">
                          Admin
                        </span>
                      )}
                      {guild ? (
                        <span className="rounded-full border border-amber-300/30 bg-amber-400/15 px-2 py-0.5 text-[11px] text-amber-100">
                          {WORLD.explorersGuild}
                        </span>
                      ) : (
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/35">
                          Free
                        </span>
                      )}
                      <span className="text-xs text-white/25">
                        {open ? "▲" : "▼"}
                      </span>
                    </div>
                  </button>

                  {open && (
                    <div className="space-y-4 border-t border-white/8 px-4 pb-4 pt-3">
                      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                        <Detail label="User id" value={row.id} />
                        <Detail
                          label="Last sign-in"
                          value={fmtDate(row.last_sign_in_at ?? null)}
                        />
                        <Detail
                          label="ToS"
                          value={
                            row.terms_accepted_at
                              ? `Accepted ${fmtDate(row.terms_accepted_at)}`
                              : "Pending"
                          }
                        />
                        <Detail
                          label="Subscription"
                          value={
                            guild
                              ? `${planLabel(row.subscription_product ?? null)} · until ${fmtDate(row.subscription_expires_at ?? null)}`
                              : row.subscription_status
                                ? `${row.subscription_status} (not entitled)`
                                : "None"
                          }
                        />
                      </dl>

                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                          Account status
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Chip
                            label="Good"
                            on={status === "active"}
                            disabled={busy === row.id || self}
                            onClick={() => void changeStatus(row, "active")}
                          />
                          <Chip
                            label="Pause"
                            on={status === "paused"}
                            disabled={busy === row.id || self}
                            onClick={() => void changeStatus(row, "paused")}
                          />
                          <Chip
                            label="Suspend"
                            on={status === "suspended"}
                            tone="danger"
                            disabled={busy === row.id || self}
                            onClick={() => void changeStatus(row, "suspended")}
                          />
                        </div>
                      </div>

                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
                          Role & security
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Chip
                            label={row.role === "admin" ? "Admin" : "Make admin"}
                            on={row.role === "admin"}
                            disabled={busy === row.id || self}
                            onClick={() => void toggleAdmin(row)}
                          />
                          <Chip
                            label="Send password reset"
                            disabled={busy === row.id || !row.email}
                            onClick={() => void resetPassword(row)}
                          />
                          {self && (
                            <span className="self-center text-[11px] text-white/25">
                              This is you
                            </span>
                          )}
                        </div>
                        {!row.email && (
                          <p className="mt-2 text-[11px] text-white/35">
                            Guest / OAuth account without email — password reset
                            unavailable.
                          </p>
                        )}
                      </div>
                    </div>
                  )}
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

function accountStatusOf(row: AdminUserRow): AccountStatus {
  if (row.account_status) return row.account_status;
  return row.suspended_at ? "suspended" : "active";
}

function StatusBadge({ status }: { status: AccountStatus }) {
  const styles =
    status === "active"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : status === "paused"
        ? "border-amber-300/30 bg-amber-400/10 text-amber-100"
        : "border-red-400/30 bg-red-500/15 text-red-200";
  const label =
    status === "active" ? "Good" : status === "paused" ? "Paused" : "Suspended";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${styles}`}
    >
      {label}
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-white/30">{label}</dt>
      <dd className="mt-0.5 break-all text-white/65">{value}</dd>
    </div>
  );
}
