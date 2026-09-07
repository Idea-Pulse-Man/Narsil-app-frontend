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

/** Admin: threads waiting on a reply (last message from member). */
export async function fetchUnreadSupportCount(): Promise<number> {
  const { data, error } = await client().rpc("admin_unread_support_count");
  if (error) throw new Error(error.message);
  return typeof data === "number" ? data : Number(data) || 0;
}

/**
 * Live INSERT stream for a support thread (member or admin viewing that user).
 * Realtime when the table is in `supabase_realtime`; otherwise a 1.5s poll
 * keeps both sides in sync (covers missing publication / flaky websockets).
 */
export function subscribeSupportThread(
  userId: string,
  onInsert: (message: SupportMessage) => void,
  opts?: { afterCreatedAt?: string | null },
): () => void {
  if (!supabase || !userId) return () => {};
  const sb = supabase;
  const seen = new Set<string>();
  let lastAt = opts?.afterCreatedAt ?? null;
  let alive = true;
  let pollId = 0;

  const emit = (row: SupportMessage) => {
    if (!alive || !row?.id || !row.body || seen.has(row.id)) return;
    seen.add(row.id);
    if (!lastAt || row.created_at > lastAt) lastAt = row.created_at;
    onInsert(row);
  };

  const tick = async () => {
    if (!alive) return;
    let q = sb
      .from("support_messages")
      .select("id, user_id, body, from_admin, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (lastAt) q = q.gt("created_at", lastAt);
    const { data, error } = await q;
    if (error || !alive || !data?.length) return;
    for (const row of data as SupportMessage[]) emit(row);
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") void tick();
  };

  void sb.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token;
    if (token) sb.realtime.setAuth(token);
  });

  const channel = sb
    .channel(`support-thread-${userId}-${Math.random().toString(36).slice(2, 8)}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "support_messages",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => emit(payload.new as SupportMessage),
    )
    .subscribe();

  pollId = window.setInterval(() => {
    void tick();
  }, 1500);
  void tick();
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    alive = false;
    window.clearInterval(pollId);
    document.removeEventListener("visibilitychange", onVisible);
    void sb.removeChannel(channel);
  };
}

/** Admin inbox list: Realtime + poll to refresh thread summaries. */
export function subscribeSupportInbox(onChange: () => void): () => void {
  if (!supabase) return () => {};
  const sb = supabase;
  const channel = sb
    .channel(`support-inbox-${Math.random().toString(36).slice(2, 8)}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "support_messages",
      },
      () => onChange(),
    )
    .subscribe();

  const pollId = window.setInterval(() => onChange(), 4000);

  return () => {
    window.clearInterval(pollId);
    void sb.removeChannel(channel);
  };
}

/** Merge helper — ascending by time, skip duplicates. */
export function mergeSupportMessages(
  prev: SupportMessage[],
  incoming: SupportMessage | SupportMessage[],
): SupportMessage[] {
  const rows = Array.isArray(incoming) ? incoming : [incoming];
  const map = new Map(prev.map((m) => [m.id, m]));
  for (const row of rows) {
    if (!row?.id) continue;
    map.set(row.id, row);
  }
  return [...map.values()].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );
}

/** Local calendar day key (YYYY-MM-DD) for date separators. */
export function supportChatDayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** WhatsApp-style day chip: Today / Yesterday / full date. */
export function formatSupportChatDay(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const startToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const startMsg = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round(
    (startToday.getTime() - startMsg.getTime()) / 86_400_000,
  );
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) {
    return d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
  return d.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

/** Short clock time inside bubbles (e.g. 1:44 PM). */
export function formatSupportChatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}
