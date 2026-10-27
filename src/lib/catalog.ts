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
 * Feed loading is paginated (80 works at a time via `fetchFeedBatch`, the
 * user's unseen works first).
 * The Gallery shop pages sellable rows via `fetchSellableArtworkBatch`.
 * Search queries the server for matches instead of downloading the whole archive.
 */
import { supabase } from "./supabase";
import { sellableArtworkOrFilter } from "./sellability";
import type { Artwork, Artist, CategoryId, ArtworkOrigin, FypArtistCard } from "@/data";

export interface RemoteCatalog {
  artworks: Artwork[];
  artists: Artist[];
  fypArtistCards: FypArtistCard[];
}

const PAGE_SIZE = 1000;
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
    // Ingest writes a batch per statement, so whole batches share one
    // created_at; without a unique tiebreaker pages repeat or skip works.
    .order("id", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as ArtworkRow[];
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
    .order("id", { ascending: true })
    .range(offset, offset + limit - 1);
  if (signal) query = query.abortSignal(signal);

  const { data, error } = await query;
  if (error) throw error;
  return feedBatchCatalog(data as unknown as ArtworkRow[] | null, offset === 0, signal);
}

/** Map a page of feed rows, with their artists (and on the first page, the For You artist cards). */
async function feedBatchCatalog(
  rows: ArtworkRow[] | null,
  withCards: boolean,
  signal?: AbortSignal,
): Promise<RemoteCatalog> {
  const artworkRows = (rows ?? []).filter((r) => r.image_url);
  const artistIds = artworkRows
    .map((r) => r.artist_id)
    .filter((id): id is string => Boolean(id));
  const [artistRows, fypArtistCards] = await Promise.all([
    fetchArtistsByIds(artistIds, ARTIST_PREVIEW_COLUMNS, signal),
    withCards ? fetchFypArtistCards(signal) : Promise.resolve([]),
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

/** False once `feed_batch` turns out not to be installed — page by offset from then on. */
let feedBatchRpc = true;

/**
 * Next For You batch for the current user: works they haven't seen first
 * (most popular first), then seen ones, skipping `exclude` — the ids already
 * loaded this session. Falls back to the popularity page at `offset` while
 * supabase/feed-batch.sql isn't installed.
 */
export async function fetchFeedBatch(
  exclude: string[],
  offset: number,
  signal?: AbortSignal,
): Promise<RemoteCatalog> {
  if (!supabase) return { artworks: [], artists: [], fypArtistCards: [] };
  if (feedBatchRpc) {
    let query = supabase
      .rpc("feed_batch", { p_exclude: exclude, p_limit: CATALOG_BATCH_SIZE })
      .select(ARTWORK_PREVIEW_COLUMNS);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (!error) {
      return feedBatchCatalog(data as unknown as ArtworkRow[] | null, offset === 0, signal);
    }
    if (error.code !== "PGRST202") throw error;
    console.warn("Feed: feed_batch unavailable — paging by popularity.", error.message);
    feedBatchRpc = false;
  }
  return fetchArtworkBatch(offset, CATALOG_BATCH_SIZE, signal);
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
    .order("id", { ascending: true })
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
 * A Search request the server can run over the whole archive. The caller
 * resolves UI selections into stored-column terms (see SearchView) and then
 * applies the exact client rules (`filterArtworks`) to what comes back.
 */
export interface CatalogSearchQuery {
  /** Free text — matched against the title, the artist name and (with
   *  supabase/search.sql) the description, tags, medium and period. */
  text?: string;
  /** PostgREST `or` clauses for the selected collections (any may match). */
  categoryFilters?: string[];
  periods?: string[];
  empires?: string[];
  artistIds?: string[];
  /** Stored `source` values for the selected museums / cities / countries. */
  sources?: string[];
  /** Only works that can be ordered as a canvas. */
  sellableOnly?: boolean;
  /** Only portrait-like works (title or medium mentions a portrait). */
  portraitsOnly?: boolean;
}

/**
 * Find matching artworks on the server — free text (title or artist name)
 * and/or Search filters, across the whole archive. Returns one page of
 * browse rows — never the whole archive, never full-size images.
 */
export async function searchCatalog(
  request: string | CatalogSearchQuery,
  signal?: AbortSignal,
  limit: number = CATALOG_BATCH_SIZE,
  offset: number = 0,
): Promise<RemoteCatalog> {
  const empty: RemoteCatalog = { artworks: [], artists: [], fypArtistCards: [] };
  if (!supabase) return empty;
  const q: CatalogSearchQuery =
    typeof request === "string" ? { text: request } : request;

  const pattern = q.text ? ilikePattern(q.text) : null;
  const hasFilters = Boolean(
    q.categoryFilters?.length ||
      q.periods?.length ||
      q.empires?.length ||
      q.artistIds?.length ||
      q.sources ||
      q.sellableOnly ||
      q.portraitsOnly,
  );
  if (!pattern && !hasFilters) return empty;
  // A place selection that matches no stored source can't match anything.
  if (q.sources && q.sources.length === 0) return empty;

  let matchedArtistIds: string[] = [];
  if (pattern) {
    let artistQuery = supabase
      .from("artists")
      .select("id")
      .ilike("name", pattern)
      .limit(40);
    if (signal) artistQuery = artistQuery.abortSignal(signal);
    const { data: artistMatches } = await artistQuery;
    matchedArtistIds = ((artistMatches ?? []) as { id: string }[])
      .map((row) => row.id)
      .filter(Boolean);
  }

  // Every OR-group must hold at once, so they are nested in one `and(...)`
  // (supabase-js would otherwise send several clashing `or` params).
  const groups = ["or(hidden.is.null,hidden.eq.false)"];
  if (q.categoryFilters?.length) groups.push(`or(${q.categoryFilters.join(",")})`);
  if (q.sellableOnly) groups.push(`or(${sellableArtworkOrFilter()})`);
  if (q.portraitsOnly) {
    groups.push(
      'or(title.ilike."*portrait*",medium.ilike."*portrait*",title.ilike."*depicts*")',
    );
  }

  const fetchPage = async (
    mode: "title" | "artist" | "text" | "all",
  ): Promise<ArtworkRow[]> => {
    if (mode === "artist" && matchedArtistIds.length === 0) return [];
    let query = supabase!
      .from("artworks")
      .select(ARTWORK_PREVIEW_COLUMNS)
      .not("image_url", "is", null)
      .or(`and(${groups.join(",")})`)
      .order("like_count", { ascending: false, nullsFirst: false })
      .order("id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (q.periods?.length) query = query.in("period", q.periods);
    if (q.empires?.length) query = query.in("empire", q.empires);
    if (q.sources?.length) query = query.in("source", q.sources);
    if (q.artistIds?.length) query = query.in("artist_id", q.artistIds);
    if (mode === "title" && pattern) query = query.ilike("title", pattern);
    if (mode === "artist") query = query.in("artist_id", matchedArtistIds);
    // Words anywhere in the description, tags, medium or period
    // (supabase/search.sql). Stemmed: "horses" finds "horse".
    if (mode === "text" && q.text) {
      query = query.textSearch("search_doc", q.text.trim().slice(0, 80), {
        type: "websearch",
        config: "english",
      });
    }
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) {
      // search.sql not run yet — text matches are a bonus, not required.
      if (mode === "text") return [];
      throw error;
    }
    return ((data ?? []) as unknown as ArtworkRow[]).filter((r) => r.image_url);
  };

  // Title and artist matches first, then works that only mention the words.
  const pages = pattern
    ? await Promise.all([fetchPage("title"), fetchPage("artist"), fetchPage("text")])
    : [await fetchPage("all")];

  const seen = new Set<string>();
  const artworkRows: ArtworkRow[] = [];
  for (const row of pages.flat()) {
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

/** Filter options across the WHOLE archive (supabase/catalog-facets.sql). */
export interface CatalogFacets {
  sources: string[];
  empires: string[];
  categories: CategoryId[];
  /** The most common period labels (the column has ~1,500 free-text values). */
  periods: string[];
}

let facetsRequest: Promise<CatalogFacets | null> | null = null;

/**
 * Load the archive-wide filter options once per session. Null when the
 * `catalog_facets` function isn't installed yet — Search then falls back to
 * options from the artworks it has loaded.
 */
export function fetchCatalogFacets(): Promise<CatalogFacets | null> {
  if (!supabase) return Promise.resolve(null);
  facetsRequest ??= (async () => {
    const { data, error } = await supabase!.rpc("catalog_facets");
    if (error || !data) {
      if (error) console.warn("Search: catalog_facets unavailable.", error.message);
      facetsRequest = null;
      return null;
    }
    const raw = data as Partial<Record<keyof CatalogFacets, unknown>>;
    const strings = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
    return {
      sources: strings(raw.sources),
      empires: strings(raw.empires),
      categories: strings(raw.categories) as CategoryId[],
      periods: strings(raw.periods),
    };
  })();
  return facetsRequest;
}

/** Live profile counts: Narsil follows, plus likes and saves on collection works. */
export interface ArtistEngagement {
  followers: number;
  likes: number;
  saves: number;
  /** Biography stored on the artist row, when the For You card has none. */
  bio: string;
  avatarUrl: string | null;
}

/**
 * Real engagement for one artist. `followers` is `artists.follower_count`
 * (people who follow them in the app). Likes and saves are summed from their
 * works in the museum catalog — not the seeded `artists.likes` / `artists.saves`.
 */
export async function fetchArtistEngagement(
  artistId: string,
  signal?: AbortSignal,
): Promise<ArtistEngagement | null> {
  if (!supabase || !artistId) return null;

  let artistQuery = supabase
    .from("artists")
    .select("follower_count, bio, avatar_url")
    .eq("id", artistId);
  let worksQuery = supabase
    .from("artworks")
    .select("like_count, save_count")
    .eq("artist_id", artistId);
  if (signal) {
    artistQuery = artistQuery.abortSignal(signal);
    worksQuery = worksQuery.abortSignal(signal);
  }

  const [artistRes, worksRes] = await Promise.all([
    artistQuery.maybeSingle(),
    worksQuery.limit(1000),
  ]);
  if (artistRes.error) throw artistRes.error;
  if (worksRes.error) throw worksRes.error;

  const row = artistRes.data as {
    follower_count?: number | null;
    bio?: string | null;
    avatar_url?: string | null;
  } | null;
  let likes = 0;
  let saves = 0;
  for (const work of (worksRes.data ?? []) as {
    like_count?: number | null;
    save_count?: number | null;
  }[]) {
    likes += work.like_count ?? 0;
    saves += work.save_count ?? 0;
  }

  return {
    followers: row?.follower_count ?? 0,
    likes,
    saves,
    bio: (row?.bio ?? "").trim(),
    avatarUrl: row?.avatar_url?.trim() || null,
  };
}
