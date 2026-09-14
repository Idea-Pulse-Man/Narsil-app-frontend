/**
 * News posts — admin CRUD + member published list
 * (`supabase/news-posts.sql`).
 */

import { supabase } from "./supabase";

export interface NewsPost {
  id: string;
  title: string;
  body: string;
  image_url: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
}

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function normalize(raw: Record<string, unknown>): NewsPost {
  return {
    id: String(raw.id),
    title: String(raw.title ?? ""),
    body: String(raw.body ?? ""),
    image_url: raw.image_url ? String(raw.image_url) : null,
    published: Boolean(raw.published),
    created_at: String(raw.created_at),
    updated_at: String(raw.updated_at),
  };
}

export async function fetchAdminNewsPosts(opts?: {
  limit?: number;
  offset?: number;
}): Promise<{ rows: NewsPost[]; total: number }> {
  const { data, error } = await client().rpc("admin_list_news_posts", {
    page_limit: opts?.limit ?? 50,
    page_offset: opts?.offset ?? 0,
  });
  if (error) throw new Error(error.message);
  const payload = data as { rows?: unknown[]; total?: number } | null;
  const rows = (payload?.rows ?? []).map((r) =>
    normalize(r as Record<string, unknown>),
  );
  return { rows, total: payload?.total ?? 0 };
}

export async function saveNewsPost(input: {
  id?: string | null;
  title: string;
  body: string;
  imageUrl?: string | null;
  published: boolean;
}): Promise<NewsPost> {
  const title = input.title.trim();
  const body = input.body.trim();
  if (!title) throw new Error("Title is required.");
  if (!body) throw new Error("Body is required.");

  const { data, error } = await client().rpc("admin_upsert_news_post", {
    p_id: input.id ?? null,
    p_title: title,
    p_body: body,
    p_image_url: input.imageUrl?.trim() || null,
    p_published: input.published,
  });
  if (error) throw new Error(error.message);
  return normalize(data as Record<string, unknown>);
}

export async function deleteNewsPost(id: string): Promise<void> {
  const { error } = await client().rpc("admin_delete_news_post", {
    target_id: id,
  });
  if (error) throw new Error(error.message);
}

/** Member: published posts. Empty if SQL not applied. */
export async function fetchPublishedNews(
  limit = 30,
): Promise<NewsPost[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc("list_published_news", {
    page_limit: limit,
  });
  if (error) return [];
  const rows = Array.isArray(data) ? data : [];
  return rows.map((r) => normalize(r as Record<string, unknown>));
}
