/**
 * Canvas checkout client — talks to the Narsil backend, never to Stripe's
 * secret API or Printful directly.
 *
 * Flow: createPaymentIntent() → pay with Stripe.js (PaymentElement) →
 * finalizeOrder(). The backend's Stripe webhook also finalizes orders, so a
 * failed/skipped finalize call here only delays fulfillment, never loses it.
 */

import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { Capacitor } from "@capacitor/core";
import { API_URL } from "./api";
import { ngrokFetch } from "./ngrok";
import { supabase } from "./supabase";

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as
  | string
  | undefined;

/**
 * Apple Pay merchant id created in the Apple Developer portal (e.g.
 * "merchant.com.narsil.museum") and registered with Stripe. When unset, the
 * native sheet still works with card entry — only the Apple Pay button is
 * hidden.
 */
const APPLE_PAY_MERCHANT_ID = import.meta.env
  .VITE_APPLE_PAY_MERCHANT_ID as string | undefined;

/** True inside the packaged iOS/Android app (WebView), false in a browser. */
export const IS_NATIVE = Capacitor.isNativePlatform();

export const PAYMENTS_ENABLED = Boolean(STRIPE_KEY);

let stripePromise: Promise<Stripe | null> | null = null;

/** Shared Stripe.js instance (loaded once per session). Web path only. */
export function getStripe(): Promise<Stripe | null> {
  if (!STRIPE_KEY) return Promise.resolve(null);
  if (!stripePromise) stripePromise = loadStripe(STRIPE_KEY);
  return stripePromise;
}

// ── Native payment sheet (Apple Pay + card) ────────────────────────────────
// On the packaged app, Apple Pay JS is unavailable inside the WebView, so we
// drive Stripe's NATIVE iOS SDK via @capacitor-community/stripe. Same Stripe
// account, same PaymentIntent/clientSecret the backend already returns — only
// the confirmation UI is native. The plugin is imported lazily so it never
// enters the web bundle.

export type NativePayResult = "completed" | "canceled" | "failed";

let nativeInit: Promise<void> | null = null;

/** Initialise the native Stripe SDK once per session with the publishable key. */
async function initNativeStripe(): Promise<void> {
  if (!STRIPE_KEY) throw new Error("Payments aren't configured.");
  if (!nativeInit) {
    const { Stripe } = await import("@capacitor-community/stripe");
    nativeInit = Stripe.initialize({ publishableKey: STRIPE_KEY });
  }
  return nativeInit;
}

/**
 * Present the native Stripe payment sheet for the backend's PaymentIntent.
 * Shows Apple Pay (when a merchant id is set) alongside card entry. Native only
 * — call the web PaymentElement flow in a browser.
 */
export async function payWithNativeSheet(
  clientSecret: string,
): Promise<NativePayResult> {
  const { Stripe, PaymentSheetEventsEnum } = await import(
    "@capacitor-community/stripe"
  );
  await initNativeStripe();

  await Stripe.createPaymentSheet({
    paymentIntentClientSecret: clientSecret,
    merchantDisplayName: "Narsil",
    enableApplePay: Boolean(APPLE_PAY_MERCHANT_ID),
    applePayMerchantId: APPLE_PAY_MERCHANT_ID ?? "",
    countryCode: "US",
    style: "alwaysDark",
  });

  const { paymentResult } = await Stripe.presentPaymentSheet();
  if (paymentResult === PaymentSheetEventsEnum.Completed) return "completed";
  if (paymentResult === PaymentSheetEventsEnum.Canceled) return "canceled";
  return "failed";
}

export interface CheckoutIntent {
  orderId: string;
  clientSecret: string;
  amount: number;
  currency: string;
  price: number;
}

export interface OrderStatus {
  orderId: string;
  status: string;
  printfulOrderId: string | null;
}

async function accessToken(): Promise<string> {
  if (!supabase) throw new Error("Sign in to order a canvas.");
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to order a canvas.");
  return token;
}

async function postJson<T>(path: string, body?: unknown): Promise<T> {
  const token = await accessToken();
  const res = await ngrokFetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const json = (await res.json().catch(() => null)) as
    | (T & { message?: string })
    | null;
  if (!res.ok) {
    throw new Error(json?.message ?? `Checkout request failed (${res.status})`);
  }
  return json as T;
}

/**
 * Create the order + PaymentIntent on the backend. The price is computed
 * server-side; the returned clientSecret drives the PaymentElement.
 */
export function createPaymentIntent(input: {
  artworkId: string;
  size: "Small" | "Medium" | "Large";
  addressId: string;
}): Promise<CheckoutIntent> {
  return postJson<CheckoutIntent>("/api/checkout/payment-intent", input);
}

/**
 * Tell the backend the payment went through so it verifies with Stripe and
 * submits the Printful order. Idempotent (the webhook races it safely).
 */
export function finalizeOrder(orderId: string): Promise<OrderStatus> {
  return postJson<OrderStatus>(
    `/api/checkout/orders/${encodeURIComponent(orderId)}/finalize`,
  );
}
