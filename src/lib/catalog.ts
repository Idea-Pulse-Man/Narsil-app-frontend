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
 * Feed loading is paginated (80 popular works at a time via `fetchArtworkBatch`).
 * The Gallery shop pages sellable rows via `fetchSellableArtworkBatch`.
 * Search queries the server for matches instead of downloading the whole archive.
 */
import { supabase } from "./supabase";
import { fetchCommunityTags } from "./tags";
import { sellableArtworkOrFilter } from "./sellability";
import type { Artwork, Artist, CategoryId, ArtworkOrigin, FypArtistCard } from "@/data";

export interface RemoteCatalog {
  artworks: Artwork[];
  artists: Artist[];
  fypArtistCards: FypArtistCard[];
}

const PAGE_SIZE = 1000;
/** How many Supabase pages to pull at once during the full catalog fetch. */
const PAGE_CONCURRENCY = 4;
/** How many artworks each feed batch request pulls from Supabase. */
export const CATALOG_BATCH_SIZE = 80;
/** @deprecated Use `fetchArtworkBatch` — kept for tests and one-shot previews. */
export const CATALOG_PREVIEW_COUNT = 150;
const ARTIST_IN_BATCH = 80;

/** Browse payload for feed, shop, search, and saved lookups. Includes placard copy. */
const ARTWORK_PREVIEW_COLUMNS =
  "id, title, image_url, artist_id, category, origin, year, period, medium, source, accent, tags, empire, like_count, save_count, featured, hidden, for_sale, description, ai_description";

const ARTWORK_FULL_COLUMNS = ARTWORK_PREVIEW_COLUMNS;

const ARTIST_PREVIEW_COLUMNS =
  "id, name, initials, profile_type, avatar_url, lifespan, nationality, period, style, known_for, accent, followers, likes, saves, profile_ready";

const ARTIST_FULL_COLUMNS =
  `${ARTIST_PREVIEW_COLUMNS}, famous_works, bio, sell_opt_in, revenue_share_pct`;

const FYP_ARTIST_CARD_COLUMNS =
  "id, artist_id, name, lifespan, nationality, portrait_url, famous_for, bio, backdrop_artwork_id, backdrop_image_url, backdrop_title, active, sort_order";

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
  famous_works?: string[] | null;
  profile_ready?: boolean | null;
  accent: string | null;
  followers: number | null;
  likes: number | null;
  saves: number | null;
  sell_opt_in: boolean | null;
  revenue_share_pct: number | null;
}

interface FypArtistCardRow {
  id: string;
  artist_id: string;
  name: string;
  lifespan: string | null;
  nationality: string | null;
  portrait_url: string;
  famous_for: string | null;
  bio: string;
  backdrop_artwork_id: string | null;
  backdrop_image_url: string | null;
  backdrop_title: string | null;
  active: boolean | null;
  sort_order: number | null;
}

// ── Mapping row → domain type ───────────────────────────────────────────────

function mapArtwork(row: ArtworkRow, communityTags: string[] = []): Artwork | null {
  if (!row?.id || !row.title?.trim() || !row.image_url) return null;
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

function mapArtist(row: ArtistRow): Artist | null {
  if (!row?.id || !row.name?.trim()) return null;
  const name = row.name.trim();
  const famousWorks = (row.famous_works ?? []).filter(
    (w) => typeof w === "string" && w.trim().length > 0,
  );
  return {
    id: row.id,
    name,
    initials: row.initials ?? name.slice(0, 2).toUpperCase(),
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
    ...(famousWorks.length ? { famousWorks } : {}),
    ...(row.profile_ready ? { profileReady: true } : {}),
    sellOptIn: row.sell_opt_in ?? false,
    revenueSharePct: row.revenue_share_pct ?? 30,
  };
}

function mapFypArtistCard(row: FypArtistCardRow): FypArtistCard | null {
  if (
    !row?.id ||
    !row.artist_id ||
    !row.name?.trim() ||
    !row.portrait_url ||
    typeof row.bio !== "string"
  ) {
    return null;
  }
  const name = row.name.trim();
  return {
    id: row.id,
    artistId: row.artist_id,
    name,
    ...(row.lifespan ? { lifespan: row.lifespan } : {}),
    ...(row.nationality ? { nationality: row.nationality } : {}),
    portraitUrl: row.portrait_url,
    ...(row.famous_for?.trim() ? { famousFor: row.famous_for.trim() } : {}),
    bio: row.bio,
    ...(row.backdrop_artwork_id
      ? { backdropArtworkId: row.backdrop_artwork_id }
      : {}),
    ...(row.backdrop_image_url
      ? { backdropImageUrl: row.backdrop_image_url }
      : {}),
    ...(row.backdrop_title ? { backdropTitle: row.backdrop_title } : {}),
    active: row.active ?? true,
    sortOrder: row.sort_order ?? 0,
  };
}

async function fetchFypArtistCards(
  signal?: AbortSignal,
): Promise<FypArtistCard[]> {
  if (!supabase) return [];
  try {
    let query = supabase
      .from("fyp_artist_cards")
      .select(FYP_ARTIST_CARD_COLUMNS)
      .eq("active", true)
      .order("sort_order", { ascending: false })
      .order("name", { ascending: true });
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as unknown as FypArtistCardRow[])
      .map(mapFypArtistCard)
      .filter((card): card is FypArtistCard => card !== null);
  } catch {
    return [];
  }
}

// ── Paginated table fetch ───────────────────────────────────────────────────

async function fetchTablePage<T>(
  table: string,
  columns: string,
  order: { column: string; ascending: boolean },
  from: number,
  signal?: AbortSignal,
): Promise<T[]> {
  if (!supabase) return [];
  let query = supabase
    .from(table)
    .select(columns)
    .order(order.column, { ascending: order.ascending })
    .range(from, from + PAGE_SIZE - 1);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as T[];
}

async function fetchTable<T>(
  table: string,
  columns: string,
  order: { column: string; ascending: boolean },
  signal?: AbortSignal,
): Promise<T[]> {
  if (!supabase) return [];
  const out: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const rows = await fetchTablePage<T>(table, columns, order, from, signal);
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return out;
}

async function fetchArtworkTablePage(
  columns: string,
  from: number,
  signal?: AbortSignal,
): Promise<ArtworkRow[]> {
  if (!supabase) return [];
  let query = supabase
    .from("artworks")
    .select(columns)
    .not("image_url", "is", null)
    .or("hidden.is.null,hidden.eq.false")
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as ArtworkRow[];
}

async function fetchArtworkTable(
  columns: string,
  signal?: AbortSignal,
): Promise<ArtworkRow[]> {
  if (!supabase) return [];

  const fetchPage = (from: number) =>
    fetchArtworkTablePage(columns, from, signal);

  const count = await fetchArtworkCount(signal);
  if (count == null) {
    const out: ArtworkRow[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const rows = await fetchPage(from);
      out.push(...rows);
      if (rows.length < PAGE_SIZE) break;
    }
    return out;
  }

  if (count <= PAGE_SIZE) {
    return fetchPage(0);
  }

  const totalPages = Math.ceil(count / PAGE_SIZE);
  const pages: ArtworkRow[][] = [];
  for (let start = 0; start < totalPages; start += PAGE_CONCURRENCY) {
    const batch = Array.from(
      { length: Math.min(PAGE_CONCURRENCY, totalPages - start) },
      (_, i) => start + i,
    );
    const batchRows = await Promise.all(
      batch.map((pageIndex) => fetchPage(pageIndex * PAGE_SIZE)),
    );
    batch.forEach((pageIndex, i) => {
      pages[pageIndex] = batchRows[i] ?? [];
    });
  }
  return pages.flat();
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

function stubArtist(id: string): Artist {
  return {
    id,
    name: "Unknown",
    initials: "?",
    profileType: "historical",
    lifespan: "—",
    nationality: "—",
    period: "—",
    style: "—",
    knownFor: "",
    bio: "",
    followers: 0,
    likes: 0,
    saves: 0,
  };
}

/**
 * Resolve specific artwork ids that may sit outside the loaded feed window
 * (vault / likes). Hidden works are included so a saved piece still appears
 * after it is dropped from For You.
 */
export async function fetchArtworksByIds(
  ids: string[],
  signal?: AbortSignal,
): Promise<RemoteCatalog> {
  const empty: RemoteCatalog = { artworks: [], artists: [], fypArtistCards: [] };
  if (!supabase || ids.length === 0) return empty;

  const unique = [...new Set(ids.filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < unique.length; i += ARTIST_IN_BATCH) {
    chunks.push(unique.slice(i, i + ARTIST_IN_BATCH));
  }

  const pages = await Promise.all(
    chunks.map(async (chunk) => {
      let query = supabase!
        .from("artworks")
        .select(ARTWORK_PREVIEW_COLUMNS)
        .in("id", chunk);
      if (signal) query = query.abortSignal(signal);
      const { data, error } = await query;
      if (error) throw error;
      return ((data ?? []) as unknown as ArtworkRow[]).filter((r) => r.image_url);
    }),
  );
  const artworkRows = pages.flat();
  const artistIds = artworkRows
    .map((r) => r.artist_id)
    .filter((id): id is string => Boolean(id));
  const artistRows = await fetchArtistsByIds(
    artistIds,
    ARTIST_PREVIEW_COLUMNS,
    signal,
  );
  const artists = artistRows
    .map(mapArtist)
    .filter((artist): artist is Artist => artist !== null);
  const haveArtist = new Set(artists.map((a) => a.id));
  for (const id of artistIds) {
    if (!haveArtist.has(id)) {
      artists.push(stubArtist(id));
      haveArtist.add(id);
    }
  }

  return {
    artworks: artworkRows
      .map((r) => mapArtwork(r))
      .filter((art): art is Artwork => art !== null),
    artists,
    fypArtistCards: [],
  };
}

/**
 * How many browsable artworks the archive holds, without downloading them.
 * Lets the UI show the real archive size while the rows are still streaming in,
 * so a partial catalog never reads as the whole collection. Null when unknown.
 */
export async function fetchArtworkCount(
  signal?: AbortSignal,
): Promise<number | null> {
  if (!supabase) return null;
  try {
    let query = supabase
      .from("artworks")
      .select("id", { count: "exact", head: true })
      .not("image_url", "is", null)
      .or("hidden.is.null,hidden.eq.false");
    if (signal) query = query.abortSignal(signal);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? null;
  } catch {
    return null;
  }
}

/**
 * One page of popular, image-backed artworks plus the artists they reference.
 * Used for the For You feed — 80 rows per batch, offset for infinite scroll.
 */
export async function fetchArtworkBatch(
  offset: number,
  limit: number = CATALOG_BATCH_SIZE,
  signal?: AbortSignal,
): Promise<RemoteCatalog> {
  if (!supabase) return { artworks: [], artists: [], fypArtistCards: [] };

  let query = supabase
    .from("artworks")
    .select(ARTWORK_PREVIEW_COLUMNS)
    .not("image_url", "is", null)
    .or("hidden.is.null,hidden.eq.false")
    .order("featured", { ascending: false, nullsFirst: false })
    .order("like_count", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;
  if (error) throw error;
  const artworkRows = ((data ?? []) as unknown as ArtworkRow[]).filter(
    (r) => r.image_url,
  );
  const artistIds = artworkRows
    .map((r) => r.artist_id)
    .filter((id): id is string => Boolean(id));
  const [artistRows, fypArtistCards] = await Promise.all([
    fetchArtistsByIds(artistIds, ARTIST_PREVIEW_COLUMNS, signal),
    offset === 0 ? fetchFypArtistCards(signal) : Promise.resolve([]),
  ]);

  return {
    artworks: artworkRows
      .map((r) => mapArtwork(r))
      .filter((art): art is Artwork => art !== null),
    artists: artistRows
      .map(mapArtist)
      .filter((artist): artist is Artist => artist !== null),
    fypArtistCards,
  };
}

export type CanvasShopSource = "museum" | "freelance";

/**
 * How many canvases the shop can sell in a tab, without downloading the rows.
 */
export async function fetchSellableArtworkCount(
  source: CanvasShopSource,
  signal?: AbortSignal,
): Promise<number | null> {
  if (!supabase) return null;
  try {
    let query = supabase
      .from("artworks")
      .select("id", { count: "exact", head: true })
      .not("image_url", "is", null)
      .or("hidden.is.null,hidden.eq.false")
      // Gallery sells stretched canvas — exclude 3D / vessel categories up front.
      .not("category", "in", '("sculptures","pottery")');
    query =
      source === "freelance"
        ? query.eq("origin", "artist-original").eq("for_sale", true)
        : query.neq("origin", "artist-original").or(sellableArtworkOrFilter());
    if (signal) query = query.abortSignal(signal);
    const { count, error } = await query;
    if (error) throw error;
    return count ?? null;
  } catch {
    return null;
  }
}

/**
 * One page of shop-eligible canvases (museum allowlist / for_sale, or freelance
 * originals marked for sale). Used by Gallery so it is not capped by the feed.
 */
export async function fetchSellableArtworkBatch(
  offset: number,
  limit: number = CATALOG_BATCH_SIZE,
  source: CanvasShopSource = "museum",
  signal?: AbortSignal,
): Promise<RemoteCatalog> {
  if (!supabase) return { artworks: [], artists: [], fypArtistCards: [] };

  let query = supabase
    .from("artworks")
    .select(ARTWORK_PREVIEW_COLUMNS)
    .not("image_url", "is", null)
    .or("hidden.is.null,hidden.eq.false")
    // Gallery sells stretched canvas — exclude 3D / vessel categories up front.
    .not("category", "in", '("sculptures","pottery")')
    .order("featured", { ascending: false, nullsFirst: false })
    .order("like_count", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  query =
    source === "freelance"
      ? query.eq("origin", "artist-original").eq("for_sale", true)
      : query.neq("origin", "artist-original").or(sellableArtworkOrFilter());
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
    artworks: artworkRows
      .map((r) => mapArtwork(r))
      .filter((art): art is Artwork => art !== null),
    artists: artistRows
      .map(mapArtist)
      .filter((artist): artist is Artist => artist !== null),
    fypArtistCards: [],
  };
}

/**
 * One round-trip of popular works — first batch only, larger window for legacy callers.
 */
export async function fetchCatalogPreview(
  signal?: AbortSignal,
): Promise<RemoteCatalog> {
  return fetchArtworkBatch(0, CATALOG_PREVIEW_COUNT, signal);
}

/** One archive page (up to 1000 rows) plus artists for those works. */
export async function fetchCatalogArchivePage(
  from: number,
  signal?: AbortSignal,
): Promise<RemoteCatalog> {
  if (!supabase) return { artworks: [], artists: [], fypArtistCards: [] };

  const artworkRows = (await fetchArtworkTablePage(
    ARTWORK_FULL_COLUMNS,
    from,
    signal,
  )).filter((r) => r.image_url);
  const artistIds = artworkRows
    .map((r) => r.artist_id)
    .filter((id): id is string => Boolean(id));
  const artistRows = await fetchArtistsByIds(
    artistIds,
    ARTIST_FULL_COLUMNS,
    signal,
  );

  return {
    artworks: artworkRows
      .map((r) => mapArtwork(r))
      .filter((art): art is Artwork => art !== null),
    artists: artistRows
      .map(mapArtist)
      .filter((artist): artist is Artist => artist !== null),
    fypArtistCards: [],
  };
}

export const CATALOG_ARCHIVE_PAGE_SIZE = PAGE_SIZE;

function ilikePattern(raw: string): string | null {
  const needle = raw
    .trim()
    .slice(0, 80)
    .replace(/[%_\\,()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (needle.length < 2) return null;
  return `%${needle}%`;
}

/**
 * Find matching artworks on the server (title or artist name). Returns one
 * page of browse rows — never the whole archive, never full-size images.
 */
export async function searchCatalog(
  text: string,
  signal?: AbortSignal,
  limit: number = CATALOG_BATCH_SIZE,
  offset: number = 0,
): Promise<RemoteCatalog> {
  const empty: RemoteCatalog = { artworks: [], artists: [], fypArtistCards: [] };
  if (!supabase) return empty;
  const pattern = ilikePattern(text);
  if (!pattern) return empty;

  let artistQuery = supabase
    .from("artists")
    .select("id")
    .ilike("name", pattern)
    .limit(40);
  if (signal) artistQuery = artistQuery.abortSignal(signal);
  const { data: artistMatches } = await artistQuery;
  const matchedArtistIds = ((artistMatches ?? []) as { id: string }[])
    .map((row) => row.id)
    .filter(Boolean);

  const fetchPage = async (mode: "title" | "artist"): Promise<ArtworkRow[]> => {
    if (mode === "artist" && matchedArtistIds.length === 0) return [];
    let query = supabase!
      .from("artworks")
      .select(ARTWORK_PREVIEW_COLUMNS)
      .not("image_url", "is", null)
      .or("hidden.is.null,hidden.eq.false")
      .order("like_count", { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1);
    query =
      mode === "title"
        ? query.ilike("title", pattern)
        : query.in("artist_id", matchedArtistIds);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    return ((data ?? []) as unknown as ArtworkRow[]).filter((r) => r.image_url);
  };

  const [titleRows, artistRows] = await Promise.all([
    fetchPage("title"),
    fetchPage("artist"),
  ]);

  const seen = new Set<string>();
  const artworkRows: ArtworkRow[] = [];
  for (const row of [...titleRows, ...artistRows]) {
    if (!row.id || seen.has(row.id)) continue;
    seen.add(row.id);
    artworkRows.push(row);
    if (artworkRows.length >= limit) break;
  }

  const artistIds = artworkRows
    .map((r) => r.artist_id)
    .filter((id): id is string => Boolean(id));
  const artistFullRows = await fetchArtistsByIds(
    artistIds,
    ARTIST_PREVIEW_COLUMNS,
    signal,
  );

  return {
    artworks: artworkRows
      .map((r) => mapArtwork(r))
      .filter((art): art is Artwork => art !== null),
    artists: artistFullRows
      .map(mapArtist)
      .filter((artist): artist is Artist => artist !== null),
    fypArtistCards: [],
  };
}

/**
 * Fetch the whole catalog from Supabase. Only artworks that have an image
 * (an S3 URL) are returned, so the feed never renders a broken tile.
 */
export async function fetchSupabaseCatalog(
  signal?: AbortSignal,
): Promise<RemoteCatalog> {
  if (!supabase) return { artworks: [], artists: [], fypArtistCards: [] };

  const [artworkRows, artistRows, tagMap, fypArtistCards] = await Promise.all([
    fetchArtworkTable(ARTWORK_FULL_COLUMNS, signal),
    fetchTable<ArtistRow>(
      "artists",
      ARTIST_FULL_COLUMNS,
      { column: "name", ascending: true },
      signal,
    ),
    fetchCommunityTags(signal),
    fetchFypArtistCards(signal),
  ]);

  return {
    artworks: artworkRows
      .filter((r) => r.image_url)
      .map((r) => mapArtwork(r, tagMap[r.id] ?? []))
      .filter((art): art is Artwork => art !== null),
    artists: artistRows
      .map(mapArtist)
      .filter((artist): artist is Artist => artist !== null),
    fypArtistCards,
  };
}
