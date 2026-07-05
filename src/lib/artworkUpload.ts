/**
 * Artwork creation: upload an image to Supabase Storage and insert a row into
 * the `artworks` table. A freelance artist row is created for the user on first
 * post so their uploads have an artist to attribute.
 *
 * Requires a Storage bucket named `artworks` (Supabase → Storage → New bucket,
 * make it public) and the v2 schema (see supabase/schema.sql).
 */

import { supabase } from "./supabase";

const BUCKET = "artworks";

async function currentUserId(): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("You must be signed in.");
  return uid;
}

/** Upload an image file and return its public URL. */
export async function uploadArtworkImage(file: File): Promise<string> {
  if (!supabase) throw new Error("Supabase is not configured.");
  const uid = await currentUserId();
  const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || "image/jpeg",
  });
  if (error) throw error;

  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Find the user's freelance artist row, creating one from their name if none. */
export async function ensureArtistForUser(name: string): Promise<string | null> {
  if (!supabase) return null;
  const uid = await currentUserId();

  const { data: existing } = await supabase
    .from("artists")
    .select("id")
    .eq("user_id", uid)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const initials =
    name
      .split(/\s+/)
      .map((w) => w[0] ?? "")
      .join("")
      .slice(0, 2)
      .toUpperCase() || "NA";

  const { data, error } = await supabase
    .from("artists")
    .insert({ user_id: uid, name, initials, profile_type: "freelance" })
    .select("id")
    .single();
  if (error) {
    console.warn("Supabase: could not create artist.", error.message);
    return null;
  }
  return data.id as string;
}

export interface NewArtworkInput {
  title: string;
  description: string;
  imageUrl: string | null;
  category: string;
  origin: string;
  artistId: string | null;
}

/** Insert a new artwork row owned by the current user. */
export async function createArtwork(input: NewArtworkInput) {
  if (!supabase) throw new Error("Supabase is not configured.");
  const uid = await currentUserId();
  return supabase
    .from("artworks")
    .insert({
      title: input.title,
      description: input.description,
      image_url: input.imageUrl,
      category: input.category,
      origin: input.origin,
      artist_id: input.artistId,
      created_by: uid,
    })
    .select("id")
    .single();
}
