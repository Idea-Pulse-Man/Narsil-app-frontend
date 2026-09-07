/**
 * Admin data layer — user management, artwork moderation, canvas orders.
 * ---------------------------------------------------------------------------
 * Every capability here is enforced server-side by RLS policies and
 * security-definer RPCs (see `supabase/admin-dashboard.sql`); a non-admin
 * calling these functions gets a Postgres error, not a silent no-op.
 *
 * Unlike the rest of lib/, these functions THROW on failure instead of
 * returning empty data. A moderation screen that can't tell "nothing here"
 * from "the query failed" is worse than useless, so the panels render the
 * error instead.
 */

import { API_URL } from "./api";
import { ngrokFetch } from "./ngrok";
import { supabase } from "./supabase";
import type { CanvasOrderStatus } from "./orders";
import type { UserRole } from "@/data/types";

export const ADMIN_PAGE_SIZE = 25;

export interface Page<T> {
  rows: T[];
  total: number;
}

const EMPTY_PAGE: Page<never> = { rows: [], total: 0 };

/** Supabase client or a clear error — admin screens are never offline-tolerant. */
function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

/**
 * Unwrap an `{ rows, total }` payload from one of the admin RPCs. The RPC
 * raises for non-admins, so `error` here is a real failure worth showing.
 */
async function rpcPage<T>(
  fn: string,
  params: Record<string, unknown>,
): Promise<Page<T>> {
  const { data, error } = await client().rpc(fn, params);
  if (error) throw new Error(error.message);
  const payload = data as { rows?: T[]; total?: number } | null;
  if (!payload) return EMPTY_PAGE;
  return { rows: payload.rows ?? [], total: payload.total ?? 0 };
}

// ── Overview ───────────────────────────────────────────────────────────────

export interface AdminDayCount {
  day: string;
  /** Legacy single series (subscriptions / signups). */
  count?: number;
  /** Registered members who signed in that day (UTC). */
  members?: number;
  /** Anonymous / no-email guests who signed in that day (UTC). */
  guests?: number;
}

export interface AdminStats {
  /** Registered members only — guests are not counted here. */
  users: number;
  /** New member profiles created today (UTC). */
  users_today?: number;
  /** New member profiles created yesterday (UTC). */
  users_yesterday?: number;
  /** users_today − users_yesterday. */
  users_delta?: number;
  /** Guest accounts (anonymous / no email) — informational only. */
  guests?: number;
  guests_today?: number;
  signins_today?: number;
  signins_members_today?: number;
  signins_guests_today?: number;
  signins_yesterday?: number;
  signins_delta?: number;
  admins: number;
  suspended: number;
  new_users_7d: number;
  subscribers_active?: number;
  subscribers_today?: number;
  subscribers_yesterday?: number;
  signins_by_day?: AdminDayCount[];
  subscriptions_by_day?: AdminDayCount[];
  signups_by_day?: AdminDayCount[];
  artworks: number;
  hidden: number;
  featured: number;
  for_sale: number;
  /** User uploads waiting for admin approve / reject. Absent until artwork-approval.sql is applied. */
  pending_approvals?: number;
  orders: number;
  orders_by_status: Partial<Record<CanvasOrderStatus, number>>;
  /** Orders in `fulfillment_failed` or stuck in `paid` — the admin's to-do. */
  needs_attention: number;
  revenue: number;
  artist_payout: number;
  platform_cut: number;
}

export async function fetchAdminStats(): Promise<AdminStats> {
  const { data, error } = await client().rpc("admin_stats");
  if (error) throw new Error(error.message);
  return data as AdminStats;
}

// ── Artwork management ─────────────────────────────────────────────────────

export type ArtworkApprovalStatus = "pending" | "approved" | "rejected";

export interface AdminArtworkRow {
  id: string;
  title: string;
  image_url: string | null;
  accent: string | null;
  artist_id: string | null;
  origin: string | null;
  created_by: string | null;
  featured: boolean;
  hidden: boolean;
  for_sale: boolean;
  approval_status?: ArtworkApprovalStatus;
  like_count: number;
  save_count: number;
  created_at: string;
}

export type ArtworkFilter =
  | "all"
  | "pending"
  | "hidden"
  | "featured"
  | "for_sale"
  | "uploads";

export const ARTWORK_FILTERS: { id: ArtworkFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "hidden", label: "Hidden" },
  { id: "featured", label: "Featured" },
  { id: "for_sale", label: "For sale" },
  { id: "uploads", label: "User uploads" },
];

const ARTWORK_COLUMNS =
  "id, title, image_url, accent, artist_id, origin, created_by, featured, hidden, for_sale, approval_status, like_count, save_count, created_at";

/**
 * Searchable, paged catalog view. Artworks are world-readable, so this runs as
 * a plain select — only the writes below need admin rights.
 */
export async function fetchAdminArtworks(opts: {
  search?: string;
  filter?: ArtworkFilter;
  limit?: number;
  offset?: number;
} = {}): Promise<Page<AdminArtworkRow>> {
  const limit = opts.limit ?? ADMIN_PAGE_SIZE;
  const offset = opts.offset ?? 0;
  const search = opts.search?.trim();

  let query = client()
    .from("artworks")
    .select(ARTWORK_COLUMNS, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (search) query = query.ilike("title", `%${search}%`);
  switch (opts.filter) {
    case "pending":
      query = query.eq("approval_status", "pending");
      break;
    case "hidden":
      query = query.eq("hidden", true);
      break;
    case "featured":
      query = query.eq("featured", true);
      break;
    case "for_sale":
      query = query.eq("for_sale", true);
      break;
    case "uploads":
      query = query.not("created_by", "is", null);
      break;
    default:
      break;
  }

  const { data, error, count } = await query;
  if (error) throw new Error(error.message);
  return { rows: (data as AdminArtworkRow[]) ?? [], total: count ?? 0 };
}

export type ArtworkFlag = "featured" | "hidden" | "for_sale";

/**
 * Flip a moderation flag. PostgREST reports no error when RLS filters every
 * row out of an update, so the returned row count is the only honest signal
 * that the write landed.
 */
export async function updateArtworkFlags(
  id: string,
  flags: Partial<Record<ArtworkFlag, boolean>>,
): Promise<void> {
  const { data, error } = await client()
    .from("artworks")
    .update(flags)
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Update was rejected — admin rights required.");
  }
}

/**
 * Approve or reject a user upload. Approve clears `hidden` so the work enters
 * the catalog; reject keeps it hidden. The DB trigger also forces hidden for
 * pending/rejected so a flag flip can't leak a rejected work into the feed.
 */
export async function setArtworkApproval(
  id: string,
  status: Exclude<ArtworkApprovalStatus, "pending">,
): Promise<void> {
  const { data, error } = await client()
    .from("artworks")
    .update({
      approval_status: status,
      hidden: status !== "approved",
    })
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Update was rejected — admin rights required.");
  }
}

/**
 * Permanent takedown. A trigger clears the work out of collections, seen,
 * comments and tags; canvas orders keep their artwork_id as a financial record.
 */
export async function deleteArtwork(id: string): Promise<void> {
  const { data, error } = await client()
    .from("artworks")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Delete was rejected — admin rights required.");
  }
}

// ── Canvas order management ────────────────────────────────────────────────

export interface AdminOrderRow {
  id: string;
  user_id: string;
  buyer_email: string | null;
  buyer_name: string | null;
  artwork_id: string;
  artwork_title: string | null;
  size: string;
  price: number | null;
  currency: string;
  status: CanvasOrderStatus;
  artist_cut: number | null;
  platform_cut: number | null;
  stripe_payment_intent_id: string | null;
  printful_order_id: string | null;
  fulfillment_error: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  paid_at: string | null;
  shipped_at: string | null;
  created_at: string;
}

export const ORDER_STATUSES: CanvasOrderStatus[] = [
  "registered",
  "pending_payment",
  "paid",
  "submitted",
  "fulfillment_failed",
  "shipped",
  "completed",
  "cancelled",
];

/** Buyer email + artwork title come from a definer RPC (RLS hides both). */
export function fetchAdminOrders(opts: {
  status?: CanvasOrderStatus | "all";
  limit?: number;
  offset?: number;
} = {}): Promise<Page<AdminOrderRow>> {
  return rpcPage<AdminOrderRow>("admin_list_orders", {
    status_filter: !opts.status || opts.status === "all" ? null : opts.status,
    page_limit: opts.limit ?? ADMIN_PAGE_SIZE,
    page_offset: opts.offset ?? 0,
  });
}

export interface OrderPatch {
  status?: CanvasOrderStatus;
  tracking_number?: string | null;
  tracking_url?: string | null;
}

/**
 * Manual order edit — for when Printful's webhook can't do it (tracking typed
 * in from a support email, an order cancelled after a refund).
 */
export async function updateOrder(id: string, patch: OrderPatch): Promise<void> {
  const now = new Date().toISOString();
  const body: Record<string, unknown> = { ...patch, updated_at: now };
  // Keep shipped_at consistent with the status an admin picks by hand.
  if (patch.status === "shipped") body.shipped_at = now;

  const { data, error } = await client()
    .from("canvas_orders")
    .update(body)
    .eq("id", id)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("Update was rejected — admin rights required.");
  }
}

/**
 * Re-run fulfillment for a paid-but-unsubmitted order. This one can't be done
 * from the client: it re-checks the PaymentIntent with Stripe and creates the
 * Printful order, both of which need server secrets.
 */
export async function retryFulfillment(id: string): Promise<CanvasOrderStatus> {
  const { data } = await client().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Your session expired — sign in again.");

  const res = await ngrokFetch(
    `${API_URL}/api/admin/orders/${encodeURIComponent(id)}/retry`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    },
  );
  const json = (await res.json().catch(() => null)) as
    | { status?: CanvasOrderStatus; message?: string }
    | null;
  if (!res.ok) {
    throw new Error(json?.message ?? `Retry failed (${res.status})`);
  }
  return json?.status ?? "paid";
}

// ── User management ────────────────────────────────────────────────────────

export type AccountStatus = "active" | "paused" | "suspended";

export type AdminUserFilter =
  | "all"
  | "active"
  | "paused"
  | "suspended"
  | "admin"
  | "guild";

export const USER_FILTERS: { id: AdminUserFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Good" },
  { id: "paused", label: "Paused" },
  { id: "suspended", label: "Suspended" },
  { id: "admin", label: "Admins" },
  { id: "guild", label: "Guild" },
];

export interface AdminUserRow {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: UserRole;
  account_status?: AccountStatus;
  suspended_at: string | null;
  terms_accepted_at: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
  order_count: number;
  artwork_count: number;
  is_subscriber?: boolean;
  subscription_status?: string | null;
  subscription_product?: string | null;
  subscription_expires_at?: string | null;
  /** Admin muted in-app / future push notifications for this member. */
  notifications_disabled?: boolean;
}

export function fetchAdminUsers(opts: {
  search?: string;
  filter?: AdminUserFilter;
  limit?: number;
  offset?: number;
} = {}): Promise<Page<AdminUserRow>> {
  return rpcPage<AdminUserRow>("admin_list_users", {
    search: opts.search?.trim() || null,
    page_limit: opts.limit ?? ADMIN_PAGE_SIZE,
    page_offset: opts.offset ?? 0,
    status_filter:
      !opts.filter || opts.filter === "all" ? null : opts.filter,
  });
}

/** Promote/demote. The RPC refuses to demote the caller (lock-out guard). */
export async function setUserRole(id: string, role: UserRole): Promise<void> {
  const { error } = await client().rpc("admin_set_user_role", {
    target_id: id,
    new_role: role,
  });
  if (error) throw new Error(error.message);
}

/** Set Good / Paused / Suspended. Self-changes other than active are blocked. */
export async function setAccountStatus(
  id: string,
  status: AccountStatus,
): Promise<void> {
  const { error } = await client().rpc("admin_set_account_status", {
    target_id: id,
    new_status: status,
  });
  if (error) throw new Error(error.message);
}

/** Suspended users keep read access but can't post comments, tags or uploads. */
export async function setUserSuspended(
  id: string,
  suspended: boolean,
): Promise<void> {
  await setAccountStatus(id, suspended ? "suspended" : "active");
}

/**
 * Email the member a password-reset link (Supabase Auth recovery).
 * Guests / OAuth-only accounts without email cannot use this.
 */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  const address = email.trim();
  if (!address) throw new Error("This account has no email for a reset link.");
  const redirectTo =
    typeof window !== "undefined" ? window.location.origin : undefined;
  const { error } = await client().auth.resetPasswordForEmail(address, {
    redirectTo,
  });
  if (error) throw new Error(error.message);
}

/** Global admin alert toasts on/off. */
export async function fetchAlertsEnabled(): Promise<boolean> {
  const { data, error } = await client().rpc("admin_get_alerts_enabled");
  if (error) throw new Error(error.message);
  return data !== false;
}

export async function setAlertsEnabled(enabled: boolean): Promise<void> {
  const { error } = await client().rpc("admin_set_alerts_enabled", {
    enabled,
  });
  if (error) throw new Error(error.message);
}

/** Mute / unmute notifications for a selected member. */
export async function setUserNotificationsDisabled(
  id: string,
  disabled: boolean,
): Promise<void> {
  const { error } = await client().rpc("admin_set_user_notifications", {
    target_id: id,
    disabled,
  });
  if (error) throw new Error(error.message);
}
