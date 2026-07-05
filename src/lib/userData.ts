/**
 * User-data access layer (saved / liked / following).
 * ---------------------------------------------------------------------------
 * Talks to Supabase when it's configured AND an (anonymous) session exists;
 * otherwise everything no-ops here and the caller keeps using localStorage.
 * AppState mirrors writes to localStorage too, so the app works offline and
 * survives Supabase being unreachable.
 */

import { supabase } from "./supabase";

export type CollectionKind = "saved" | "liked";

export interface RemoteUserData {
  saved: string[];
  liked: string[];
  following: string[];
}

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

/** Load the signed-in user's profile row (name/avatar) from Supabase. */
export async function fetchProfile(): Promise<Profile | null> {
  if (!supabase) return null;
  try {
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url")
      .eq("id", uid)
      .maybeSingle();
    if (error) {
      console.warn("Supabase: profile load failed.", error.message);
      return null;
    }
    return (data as Profile | null) ?? null;
  } catch (err) {
    console.warn("Supabase: profile load error.", err);
    return null;
  }
}

/**
 * Make sure we have a user id. With anonymous sign-ins enabled in the Supabase
 * dashboard this transparently creates a per-device user. Returns null when
 * Supabase is disabled or anonymous sign-in is not available — callers then
 * stay on localStorage.
 */
export async function ensureSession(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    if (data.session?.user) return data.session.user.id;

    const { data: anon, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.warn(
        "Supabase: anonymous sign-in unavailable — using local storage.",
        error.message,
      );
      return null;
    }
    return anon.user?.id ?? null;
  } catch (err) {
    console.warn("Supabase: session check failed — using local storage.", err);
    return null;
  }
}

/** Load the signed-in user's collections + follows from Supabase. */
export async function fetchUserData(): Promise<RemoteUserData | null> {
  if (!supabase) return null;
  try {
    const [collections, follows] = await Promise.all([
      supabase.from("collections").select("artwork_id, kind"),
      supabase.from("follows").select("artist_id"),
    ]);

    if (collections.error || follows.error) {
      console.warn(
        "Supabase: failed to load user data — using local storage.",
        collections.error?.message ?? follows.error?.message,
      );
      return null;
    }

    const saved: string[] = [];
    const liked: string[] = [];
    for (const row of collections.data ?? []) {
      if (row.kind === "saved") saved.push(row.artwork_id);
      else if (row.kind === "liked") liked.push(row.artwork_id);
    }
    const following = (follows.data ?? []).map((r) => r.artist_id);

    return { saved, liked, following };
  } catch (err) {
    console.warn("Supabase: load error — using local storage.", err);
    return null;
  }
}

/** Add/remove an artwork to a collection (saved/liked) for the current user. */
export async function setCollection(
  kind: CollectionKind,
  artworkId: string,
  on: boolean,
): Promise<void> {
  if (!supabase) return;
  try {
    if (on) {
      await supabase.from("collections").upsert({ artwork_id: artworkId, kind });
    } else {
      await supabase
        .from("collections")
        .delete()
        .eq("artwork_id", artworkId)
        .eq("kind", kind);
    }
  } catch (err) {
    console.warn("Supabase: collection write failed.", err);
  }
}

/** Follow/unfollow an artist for the current user. */
export async function setFollow(artistId: string, on: boolean): Promise<void> {
  if (!supabase) return;
  try {
    if (on) {
      await supabase.from("follows").upsert({ artist_id: artistId });
    } else {
      await supabase.from("follows").delete().eq("artist_id", artistId);
    }
  } catch (err) {
    console.warn("Supabase: follow write failed.", err);
  }
}
