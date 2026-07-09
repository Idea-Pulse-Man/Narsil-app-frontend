import { supabase } from "./supabase";
import type { Artwork } from "@/data";

export interface AdminArtworkRow {
  id: string;
  title: string;
  featured: boolean;
  hidden: boolean;
  for_sale: boolean;
  like_count: number;
  save_count: number;
}

export interface AdminOrderRow {
  id: string;
  artwork_id: string;
  size: string;
  price: number | null;
  status: string;
  artist_cut: number | null;
  platform_cut: number | null;
  created_at: string;
}

export async function fetchAdminArtworks(limit = 40): Promise<AdminArtworkRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("artworks")
    .select("id, title, featured, hidden, for_sale, like_count, save_count")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("Admin: artwork load failed.", error.message);
    return [];
  }
  return (data as AdminArtworkRow[]) ?? [];
}

export async function updateArtworkFlags(
  id: string,
  flags: Partial<Pick<Artwork, "featured" | "hidden" | "forSale">>,
): Promise<string | null> {
  if (!supabase) return "Supabase is not configured.";
  const patch: Record<string, boolean> = {};
  if (flags.featured !== undefined) patch.featured = flags.featured;
  if (flags.hidden !== undefined) patch.hidden = flags.hidden;
  if (flags.forSale !== undefined) patch.for_sale = flags.forSale;
  const { error } = await supabase.from("artworks").update(patch).eq("id", id);
  return error?.message ?? null;
}

export async function fetchAdminOrders(limit = 30): Promise<AdminOrderRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("canvas_orders")
    .select("id, artwork_id, size, price, status, artist_cut, platform_cut, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.warn("Admin: orders load failed.", error.message);
    return [];
  }
  return (data as AdminOrderRow[]) ?? [];
}
