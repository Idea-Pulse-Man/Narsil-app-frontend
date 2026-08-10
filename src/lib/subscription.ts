/**
 * Narsil Pro — subscription state for the app.
 * ---------------------------------------------------------------------------
 * The flow, end to end:
 *
 *   1. StoreKit takes the payment and hands back a signed transaction (JWS).
 *   2. We POST that to the backend, which verifies the signature against
 *      Apple's root certificates and asks Apple for the CURRENT status.
 *   3. The backend stores the entitlement and returns it.
 *
 * Everything the UI shows comes from step 3. Nothing here decides whether
 * someone is a subscriber — the server does, and re-checks on every paid
 * action, because a client that has been told "you are Pro" is not evidence.
 */
import { API_URL } from "@/lib/api";
import { ngrokFetch } from "@/lib/ngrok";
import { supabase } from "@/lib/supabase";
import {
  isAvailable,
  purchase as storeKitPurchase,
  restore as storeKitRestore,
  type ProProductId,
  type StoreTransaction,
} from "@/lib/storekit";

/**
 * What the user was trying to do when the paywall appeared. Lives here rather
 * than in the paywall component so `AppState` can hold the prompt without
 * importing a component.
 */
export type PaywallReason =
  | "practice-quiz"
  | "hi-res-download"
  | "canvas-discount"
  /** Opened deliberately from Settings rather than by hitting a gate. */
  | "settings";

/** Apple's subscription management page — the only place a user can cancel. */
export const APPLE_SUBSCRIPTIONS_URL =
  "https://apps.apple.com/account/subscriptions";

/** "Annual" / "Monthly" from an App Store product id. */
export function planLabel(productId: string | null): string {
  if (!productId) return "The Explorer's Guild";
  if (productId.endsWith(".annual")) return "Annual";
  if (productId.endsWith(".monthly")) return "Monthly";
  return "The Explorer's Guild";
}

/** Renewal/expiry date as a readable local date, or null when unknown. */
export function formatRenewal(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const date = new Date(expiresAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export interface SubscriptionState {
  active: boolean;
  status: "active" | "grace" | "expired" | "revoked" | null;
  productId: string | null;
  expiresAt: string | null;
  autoRenew: boolean;
}

export const NO_SUBSCRIPTION: SubscriptionState = {
  active: false,
  status: null,
  productId: null,
  expiresAt: null,
  autoRenew: false,
};

async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

async function authedJson<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const token = await accessToken();
  if (!token) throw new Error("Sign in to manage The Explorer's Guild.");

  const res = await ngrokFetch(`${API_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });

  const json = (await res.json().catch(() => null)) as
    | (T & { message?: string })
    | null;
  if (!res.ok) {
    throw new Error(json?.message ?? `Request failed (${res.status})`);
  }
  return json as T;
}

/**
 * The signed-in user's Pro state. Returns NO_SUBSCRIPTION rather than throwing
 * when signed out or offline — the paywall and the Pro badge are decorations,
 * and neither should be able to break a screen.
 */
export async function fetchSubscription(): Promise<SubscriptionState> {
  try {
    return await authedJson<SubscriptionState>("/api/me/subscription");
  } catch {
    return NO_SUBSCRIPTION;
  }
}

/** Hand a signed StoreKit transaction to the backend and get the entitlement back. */
async function verify(transaction: StoreTransaction): Promise<SubscriptionState> {
  return authedJson<SubscriptionState>("/api/apple/verify", {
    method: "POST",
    body: { signedTransaction: transaction.jws },
  });
}

export type PurchaseOutcome =
  | { result: "subscribed"; subscription: SubscriptionState }
  | { result: "cancelled" };

/**
 * Buy Narsil Pro.
 *
 * Requires a real account: the entitlement is bound to a Supabase user, and an
 * anonymous session is discarded on reinstall — which would leave someone
 * paying Apple every month for an account that no longer exists. Callers should
 * route anonymous users through sign-in first.
 */
export async function subscribe(
  productId: ProProductId,
): Promise<PurchaseOutcome> {
  if (!(await accessToken())) {
    throw new Error("Create an account first so your subscription is saved.");
  }
  const transaction = await storeKitPurchase(productId);
  if (!transaction) return { result: "cancelled" };
  return { result: "subscribed", subscription: await verify(transaction) };
}

/**
 * Restore Purchases. Apple requires this button in any app selling a
 * subscription, and it is the recovery path after a reinstall or a switch to a
 * new device.
 *
 * Every restored transaction is re-verified server-side; the backend keys on
 * Apple's `originalTransactionId`, so restoring while signed into a different
 * Narsil account MOVES the entitlement rather than duplicating it.
 */
export async function restorePurchases(): Promise<SubscriptionState> {
  const transactions = await storeKitRestore();
  if (transactions.length === 0) return NO_SUBSCRIPTION;

  let latest: SubscriptionState = NO_SUBSCRIPTION;
  for (const transaction of transactions) {
    try {
      const state = await verify(transaction);
      if (state.active) latest = state;
    } catch {
      // One stale transaction shouldn't abort the restore — keep going and
      // report whatever is genuinely still live.
    }
  }
  return latest;
}

/** Whether the paywall can offer a purchase at all (iOS native only). */
export const canSubscribe = isAvailable;
