/**
 * Delivery addresses (canvas-print delivery targets) + canvas order history.
 * Requires the v2 schema (addresses). All writes rely on the table defaults
 * (`user_id default auth.uid()`) and RLS to scope rows to the signed-in user.
 * Canvas ORDERS are no longer written from the client — the backend creates
 * them during Stripe checkout (see lib/checkout.ts) and the Printful webhook
 * advances them; the client only READS them (order tracking).
 */

import { supabase } from "./supabase";

export interface Address {
  id: string;
  label: string;
  recipient_name: string | null;
  phone: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  country: string | null;
  is_default: boolean;
}

export interface NewAddressInput {
  label?: string;
  recipient_name?: string;
  phone?: string;
  line1: string;
  line2?: string;
  city?: string;
  region?: string;
  postal_code?: string;
  country?: string;
  is_default?: boolean;
}

const ADDRESS_COLUMNS =
  "id, label, recipient_name, phone, line1, line2, city, region, postal_code, country, is_default";

/** List the current user's saved addresses (default first). */
export async function fetchAddresses(): Promise<Address[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("addresses")
      .select(ADDRESS_COLUMNS)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("Supabase: address load failed.", error.message);
      return [];
    }
    return (data as Address[]) ?? [];
  } catch (err) {
    console.warn("Supabase: address load error.", err);
    return [];
  }
}

/** Save a new address for the current user and return it. */
export async function createAddress(
  input: NewAddressInput,
): Promise<Address | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("addresses")
    .insert({
      label: input.label ?? "Home",
      recipient_name: input.recipient_name ?? null,
      phone: input.phone ?? null,
      line1: input.line1,
      line2: input.line2 ?? null,
      city: input.city ?? null,
      region: input.region ?? null,
      postal_code: input.postal_code ?? null,
      country: input.country ?? null,
      is_default: input.is_default ?? false,
    })
    .select(ADDRESS_COLUMNS)
    .single();
  if (error) {
    console.warn("Supabase: address create failed.", error.message);
    throw error;
  }
  return data as Address;
}

/** Update an existing address. */
export async function updateAddress(
  id: string,
  input: NewAddressInput,
): Promise<Address | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("addresses")
    .update({
      label: input.label ?? "Home",
      recipient_name: input.recipient_name ?? null,
      phone: input.phone ?? null,
      line1: input.line1,
      line2: input.line2 ?? null,
      city: input.city ?? null,
      region: input.region ?? null,
      postal_code: input.postal_code ?? null,
      country: input.country ?? null,
    })
    .eq("id", id)
    .select(ADDRESS_COLUMNS)
    .single();
  if (error) {
    console.warn("Supabase: address update failed.", error.message);
    throw error;
  }
  return data as Address;
}

/** Delete an address. */
export async function deleteAddress(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("addresses").delete().eq("id", id);
  if (error) {
    console.warn("Supabase: address delete failed.", error.message);
    throw error;
  }
}

export type CanvasOrderStatus =
  | "registered"
  | "pending_payment"
  | "paid"
  | "submitted"
  | "fulfillment_failed"
  | "completed"
  | "shipped"
  | "cancelled";

export interface CanvasOrder {
  id: string;
  artwork_id: string;
  size: "Small" | "Medium" | "Large";
  /** Absent before supabase/posters.sql — means canvas. */
  product?: "canvas" | "poster";
  price: number | null;
  status: CanvasOrderStatus;
  tracking_number: string | null;
  tracking_url: string | null;
  shipped_at: string | null;
  created_at: string;
}

// `*` so the list keeps loading on a database without the `product` column.
const ORDER_COLUMNS = "*";

/** The current user's canvas orders, newest first (RLS scopes the rows). */
export async function fetchCanvasOrders(): Promise<CanvasOrder[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("canvas_orders")
      .select(ORDER_COLUMNS)
      .order("created_at", { ascending: false });
    if (error) {
      console.warn("Supabase: order load failed.", error.message);
      return [];
    }
    return (data as CanvasOrder[]) ?? [];
  } catch (err) {
    console.warn("Supabase: order load error.", err);
    return [];
  }
}

/** Make one address the default, clearing the flag on all the user's others. */
export async function setDefaultAddress(id: string): Promise<void> {
  if (!supabase) return;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id;
  if (!uid) return;
  // Clear existing default(s), then set the chosen one.
  const clear = await supabase
    .from("addresses")
    .update({ is_default: false })
    .eq("user_id", uid)
    .neq("id", id);
  if (clear.error) {
    console.warn("Supabase: clear default failed.", clear.error.message);
    throw clear.error;
  }
  const { error } = await supabase
    .from("addresses")
    .update({ is_default: true })
    .eq("id", id);
  if (error) {
    console.warn("Supabase: set default failed.", error.message);
    throw error;
  }
}
