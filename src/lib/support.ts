/**
 * Member ↔ admin support messaging (live chat channel).
 * Email contact stays a mailto: — see ContactAdminSheet.
 */

import { supabase } from "./supabase";

/** Support inbox address — override with VITE_SUPPORT_EMAIL. */
export const SUPPORT_EMAIL =
  (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() ||
  "support@narsil.app";

export interface SupportMessage {
  id: string;
  user_id: string;
  body: string;
  from_admin: boolean;
  created_at: string;
}

export interface SupportThreadSummary {
  user_id: string;
  full_name: string | null;
  email: string | null;
  last_body: string;
  last_from_admin: boolean;
  last_at: string;
  message_count: number;
}

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

/** Open the device mail client to the Narsil support address. */
export function openSupportEmail(opts?: {
  subject?: string;
  body?: string;
}): void {
  const params = new URLSearchParams();
  if (opts?.subject) params.set("subject", opts.subject);
  if (opts?.body) params.set("body", opts.body);
  const qs = params.toString();
  window.location.href = `mailto:${SUPPORT_EMAIL}${qs ? `?${qs}` : ""}`;
}

/** Member: load their own thread (oldest → newest). */
export async function fetchMySupportMessages(): Promise<SupportMessage[]> {
  const { data, error } = await client()
    .from("support_messages")
    .select("id, user_id, body, from_admin, created_at")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as SupportMessage[]) ?? [];
}

/** Member: send a live-chat message. */
export async function sendSupportMessage(body: string): Promise<SupportMessage> {
  const text = body.trim();
  if (!text) throw new Error("Write a message first.");
  const { data: auth } = await client().auth.getUser();
  const uid = auth.user?.id;
  if (!uid) throw new Error("Sign in to message support.");

  const { data, error } = await client()
    .from("support_messages")
    .insert({ user_id: uid, body: text, from_admin: false })
    .select("id, user_id, body, from_admin, created_at")
    .single();
  if (error) throw new Error(error.message);
  return data as SupportMessage;
}

/** Admin: paged thread list. */
export async function fetchSupportThreads(opts?: {
  limit?: number;
  offset?: number;
}): Promise<{ rows: SupportThreadSummary[]; total: number }> {
  const { data, error } = await client().rpc("admin_list_support_threads", {
    page_limit: opts?.limit ?? 30,
    page_offset: opts?.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  const payload = data as { rows?: SupportThreadSummary[]; total?: number } | null;
  return { rows: payload?.rows ?? [], total: payload?.total ?? 0 };
}

/** Admin: full thread for one member. */
export async function fetchSupportThread(
  userId: string,
): Promise<SupportMessage[]> {
  const { data, error } = await client().rpc("admin_list_support_thread", {
    target_id: userId,
  });
  if (error) throw new Error(error.message);
  return (data as SupportMessage[]) ?? [];
}

/** Admin: reply into a member's thread. */
export async function replySupportMessage(
  userId: string,
  body: string,
): Promise<SupportMessage> {
  const text = body.trim();
  if (!text) throw new Error("Write a reply first.");
  const { data, error } = await client()
    .from("support_messages")
    .insert({ user_id: userId, body: text, from_admin: true })
    .select("id, user_id, body, from_admin, created_at")
    .single();
  if (error) throw new Error(error.message);
  return data as SupportMessage;
}
