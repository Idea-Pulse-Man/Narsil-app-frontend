/**
 * Art Discussion comments.
 * ---------------------------------------------------------------------------
 * Public per-artwork threads backed by Supabase (`comments` table). Anyone can
 * read a work's comments; a signed-in user — including anonymous guests, who
 * have the `authenticated` role — can post and delete their OWN.
 *
 * Author name/avatar are snapshotted onto each row at post time because
 * `profiles` is owner-only readable and cannot back a public thread via a join.
 *
 * Requires the `comments` table + RLS: run `supabase/comments.sql`.
 */

import { supabase } from "./supabase";

export interface Comment {
  id: string;
  artwork_id: string;
  user_id: string;
  author_name: string | null;
  author_avatar: string | null;
  body: string;
  created_at: string;
}

const COLUMNS =
  "id, artwork_id, user_id, author_name, author_avatar, body, created_at";

/** Max characters accepted for a single comment (mirrors the DB CHECK). */
export const COMMENT_MAX = 1000;

/** Load a work's discussion, oldest first. */
export async function fetchComments(artworkId: string): Promise<Comment[]> {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("comments")
      .select(COLUMNS)
      .eq("artwork_id", artworkId)
      .order("created_at", { ascending: true });
    if (error) {
      console.warn("Supabase: comments load failed.", error.message);
      return [];
    }
    return (data as Comment[]) ?? [];
  } catch (err) {
    console.warn("Supabase: comments load error.", err);
    return [];
  }
}

export interface NewComment {
  artworkId: string;
  body: string;
  authorName?: string | null;
  authorAvatar?: string | null;
}

/** Post a comment as the current user; returns the stored row. */
export async function addComment(input: NewComment): Promise<Comment | null> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const body = input.body.trim();
  if (!body) return null;

  const { data, error } = await supabase
    .from("comments")
    .insert({
      artwork_id: input.artworkId,
      body: body.slice(0, COMMENT_MAX),
      author_name: input.authorName ?? null,
      author_avatar: input.authorAvatar ?? null,
    })
    .select(COLUMNS)
    .single();

  if (error) {
    console.warn("Supabase: comment post failed.", error.message);
    throw error;
  }
  return data as Comment;
}

/** Delete one of the current user's comments. */
export async function deleteComment(id: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("comments").delete().eq("id", id);
  if (error) {
    console.warn("Supabase: comment delete failed.", error.message);
    throw error;
  }
}

/**
 * Subscribe to new comments on a work in real time (other devices/users).
 * Returns an unsubscribe function. No-ops when Supabase/realtime is disabled.
 *
 * Only INSERTs are streamed: deletes are reflected optimistically by the caller,
 * and realtime DELETE payloads omit `artwork_id` (replica identity is the PK),
 * so they can't be filtered per-artwork reliably.
 */
export function subscribeComments(
  artworkId: string,
  onInsert: (comment: Comment) => void,
): () => void {
  if (!supabase) return () => {};
  const client = supabase;
  const channel = client
    .channel(`comments:${artworkId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "comments",
        filter: `artwork_id=eq.${artworkId}`,
      },
      (payload) => onInsert(payload.new as Comment),
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
