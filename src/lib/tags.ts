import { supabase } from "./supabase";

/** Fetch community tags grouped by artwork id. */
export async function fetchCommunityTags(
  signal?: AbortSignal,
): Promise<Record<string, string[]>> {
  if (!supabase) return {};
  let query = supabase
    .from("artwork_tags")
    .select("artwork_id, tag")
    .order("created_at", { ascending: true });
  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;
  if (error) {
    console.warn("Supabase: artwork_tags load failed.", error.message);
    return {};
  }

  const out: Record<string, string[]> = {};
  for (const row of data ?? []) {
    const id = row.artwork_id as string;
    const tag = (row.tag as string).trim();
    if (!tag) continue;
    if (!out[id]) out[id] = [];
    if (!out[id].includes(tag)) out[id].push(tag);
  }
  return out;
}

/** Add a community tag (signed-in users only). */
export async function addCommunityTag(
  artworkId: string,
  tag: string,
): Promise<{ error?: string }> {
  if (!supabase) return { error: "Supabase is not configured." };
  const normalized = tag.trim().toLowerCase();
  if (!normalized) return { error: "Tag cannot be empty." };
  if (normalized.length > 48) return { error: "Tag is too long." };

  const { error } = await supabase.from("artwork_tags").insert({
    artwork_id: artworkId,
    tag: normalized,
  });
  if (error) {
    if (error.code === "23505") return {};
    return { error: error.message };
  }
  return {};
}
