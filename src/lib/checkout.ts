/**
 * Canvas checkout client — talks to the Narsil backend, never to Stripe's
 * secret API or Printful directly.
 *
 * Flow: createPaymentIntent() → pay with Stripe.js (PaymentElement) →
 * finalizeOrder(). The backend's Stripe webhook also finalizes orders, so a
 * failed/skipped finalize call here only delays fulfillment, never loses it.
 */

import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { API_URL } from "./api";
import { ngrokFetch } from "./ngrok";
import { supabase } from "./supabase";

const STRIPE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY as
  | string
  | undefined;

export const PAYMENTS_ENABLED = Boolean(STRIPE_KEY);

let stripePromise: Promise<Stripe | null> | null = null;

/** Shared Stripe.js instance (loaded once per session). */
export function getStripe(): Promise<Stripe | null> {
  if (!STRIPE_KEY) return Promise.resolve(null);
  if (!stripePromise) stripePromise = loadStripe(STRIPE_KEY);
  return stripePromise;
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
