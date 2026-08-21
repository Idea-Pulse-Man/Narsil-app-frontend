/**
 * Supabase catalog reader.
 * ---------------------------------------------------------------------------
 * Reads the public-domain catalog (artworks + artists) DIRECTLY from Supabase —
 * the rows are populated once a day by the EC2 ingestion job (which stores the
 * images in S3 and writes the S3 URLs here). Reading straight from Supabase
 * (PostgREST, CDN-fronted) keeps the browse screens fast with no backend hop;
 * the `<img>` bytes load directly from S3.
 *
 * Public catalog tables are world-readable (RLS `using(true)`), so the app's
 * anon key is enough — no secret ever reaches the client.
 *
 * Loading is two-phase so the For You feed can paint before every row arrives:
 *   1. `fetchCatalogPreview` — one page of popular works + their artists
 *   2. `fetchSupabaseCatalog` — the rest of the tables (background)
 */
import { supabase } from "./supabase";
import { fetchCommunityTags } from "./tags";
import type { Artwork, Artist, CategoryId, ArtworkOrigin } from "@/data";

export interface RemoteCatalog {
  artworks: Artwork[];
  artists: Artist[];
}

const PAGE_SIZE = 1000;
/** First-paint window — larger than the 80-item feed so unknown/portrait filters still fill it. */
export const CATALOG_PREVIEW_COUNT = 400;
const ARTIST_IN_BATCH = 80;

const ARTWORK_PREVIEW_COLUMNS =
  "id, title, description, image_url, artist_id, category, origin, year, period, medium, source, accent, tags, empire, like_count, save_count, featured, hidden, for_sale";

const ARTWORK_FULL_COLUMNS = `${ARTWORK_PREVIEW_COLUMNS}, ai_description`;

const ARTIST_PREVIEW_COLUMNS =
  "id, name, initials, profile_type, avatar_url, lifespan, nationality, period, style, known_for, accent, followers, likes, saves, sell_opt_in, revenue_share_pct";

const ARTIST_FULL_COLUMNS = `${ARTIST_PREVIEW_COLUMNS}, bio`;

// ── Row shapes (snake_case, as stored in Supabase) ──────────────────────────

interface ArtworkRow {
  id: string;
  title: string;
  description: string | null;
  image_url: string | null;
  artist_id: string | null;
  category: string | null;
  origin: string | null;
  year: string | null;
  period: string | null;
  medium: string | null;
  source: string | null;
  accent: string | null;
  tags: string[] | null;
  empire: string | null;
  like_count: number | null;
  save_count: number | null;
  featured: boolean | null;
  hidden: boolean | null;
  for_sale: boolean | null;
  ai_description?: string | null;
}

interface ArtistRow {
  id: string;
  name: string;
  initials: string | null;
  profile_type: string | null;
  bio?: string | null;
  avatar_url: string | null;
  lifespan: string | null;
  nationality: string | null;
  period: string | null;
  style: string | null;
  known_for: string | null;
  accent: string | null;
  followers: number | null;
  likes: number | null;
  saves: number | null;
  sell_opt_in: boolean | null;
  revenue_share_pct: number | null;
}

// ── Mapping row → domain type ───────────────────────────────────────────────

function mapArtwork(row: ArtworkRow, communityTags: string[] = []): Artwork {
  const catalogTags = row.tags ?? [];
  const mergedTags = Array.from(new Set([...catalogTags, ...communityTags]));
  return {
    id: row.id,
    title: row.title,
    artistId: row.artist_id ?? "unknown-artist",
    year: row.year ?? "",
    period: row.period ?? "—",
    medium: row.medium ?? "—",
    source: row.source ?? "",
    image: row.image_url ?? "",
    accent: row.accent ?? "#22242b",
    description: row.description ?? "",
    tags: mergedTags,
    category: (row.category ?? "paintings") as CategoryId,
    origin: (row.origin ?? "public-domain") as ArtworkOrigin,
    ...(row.empire ? { empire: row.empire } : {}),
    likeCount: row.like_count ?? 0,
    saveCount: row.save_count ?? 0,
    featured: row.featured ?? false,
    hidden: row.hidden ?? false,
    forSale: row.for_sale ?? false,
    ...(row.ai_description ? { aiDescription: row.ai_description } : {}),
    ...(communityTags.length ? { communityTags } : {}),
  };
}

function mapArtist(row: ArtistRow): Artist {
  return {
    id: row.id,
    name: row.name,
    initials: row.initials ?? row.name.slice(0, 2).toUpperCase(),
    profileType: row.profile_type === "freelance" ? "freelance" : "historical",
    lifespan: row.lifespan ?? "—",
    nationality: row.nationality ?? "—",
    period: row.period ?? "—",
    style: row.style ?? "—",
    knownFor: row.known_for ?? "",
    bio: row.bio ?? "",
    followers: row.followers ?? 0,
    likes: row.likes ?? 0,
    saves: row.saves ?? 0,
    ...(row.accent ? { accent: row.accent } : {}),
    ...(row.avatar_url ? { avatar: row.avatar_url } : {}),
    sellOptIn: row.sell_opt_in ?? false,
    revenueSharePct: row.revenue_share_pct ?? 30,
  };
}

// ── Paginated table fetch ───────────────────────────────────────────────────

async function fetchTable<T>(
  table: string,
  columns: string,
  order: { column: string; ascending: boolean },
  signal?: AbortSignal,
): Promise<T[]> {
  if (!supabase) return [];
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase
      .from(table)
      .select(columns)
      .order(order.column, { ascending: order.ascending })
      .range(from, from + PAGE_SIZE - 1);
    if (signal) query = query.abortSignal(signal);

    const { data, error } = await query;
    if (error) throw error;
    const rows = (data ?? []) as unknown as T[];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

async function fetchArtistsByIds(
  ids: string[],
  columns: string,
  signal?: AbortSignal,
): Promise<ArtistRow[]> {
  if (!supabase || ids.length === 0) return [];
  const client = supabase;
  const unique = [...new Set(ids)];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += ARTIST_IN_BATCH) {
    chunks.push(unique.slice(i, i + ARTIST_IN_BATCH));
  }

  const pages = await Promise.all(
    chunks.map(async (chunk) => {
      let query = client.from("artists").select(columns).in("id", chunk);
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ArtistRow[];
    }),
  );
  return pages.flat();
}

/**
 * One round-trip of popular, image-backed artworks plus the artists they
 * reference. Enough to fill the For You feed; not the whole museum.
 */
export async function fetchCatalogPreview(
  signal?: AbortSignal,
): Promise<RemoteCatalog> {
  if (!supabase) return { artworks: [], artists: [] };

  let query = supabase
    .from("artworks")
    .select(ARTWORK_PREVIEW_COLUMNS)
    .not("image_url", "is", null)
    .order("featured", { ascending: false, nullsFirst: false })
    .order("like_count", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(0, CATALOG_PREVIEW_COUNT - 1);
  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;
  if (error) throw error;
  const artworkRows = ((data ?? []) as unknown as ArtworkRow[]).filter(
    (r) => r.image_url,
  );
  const artistIds = artworkRows
    .map((r) => r.artist_id)
    .filter((id): id is string => Boolean(id));
  const artistRows = await fetchArtistsByIds(
    artistIds,
    ARTIST_PREVIEW_COLUMNS,
    signal,
  );

  return {
    artworks: artworkRows.map((r) => mapArtwork(r)),
    artists: artistRows.map(mapArtist),
  };
}

/**
 * Fetch the whole catalog from Supabase. Only artworks that have an image
 * (an S3 URL) are returned, so the feed never renders a broken tile.
 */
export async function fetchSupabaseCatalog(
  signal?: AbortSignal,
): Promise<RemoteCatalog> {
  if (!supabase) return { artworks: [], artists: [] };

  const [artworkRows, artistRows, tagMap] = await Promise.all([
    fetchTable<ArtworkRow>(
      "artworks",
      ARTWORK_FULL_COLUMNS,
      { column: "created_at", ascending: false },
      signal,
    ),
    fetchTable<ArtistRow>(
      "artists",
      ARTIST_FULL_COLUMNS,
      { column: "name", ascending: true },
      signal,
    ),
    fetchCommunityTags(signal),
  ]);

  return {
    artworks: artworkRows
      .filter((r) => r.image_url)
      .map((r) => mapArtwork(r, tagMap[r.id] ?? [])),
    artists: artistRows.map(mapArtist),
  };
}
