/**
 * Live catalog provider.
 * ---------------------------------------------------------------------------
 * Hydrates from a local snapshot (last visit's first ~80 feed works) so the
 * For You screen can paint immediately, then loads the feed in 80-artwork
 * batches from Supabase. The next batch is fetched when the user scrolls
 * halfway through the current pool — not the whole archive at once.
 *
 * The full catalog loads on demand (Search tab) via `ensureFullCatalog`.
 *
 * Browse surfaces never show bundled mock artworks; History lookups still
 * merge mocks so curated timeline ids resolve.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  artworks as mockArtworks,
  artists as mockArtists,
  artworkMatchesCategory,
  uniquePlaceFacets,
} from "./index";
import type { Artwork, Artist, CategoryId, ArtworkSearchQuery, FypArtistCard } from "./index";
import {
  CATALOG_ARCHIVE_PAGE_SIZE,
  CATALOG_BATCH_SIZE,
  fetchArtworkBatch,
  fetchArtworkCount,
  fetchCatalogArchivePage,
  type RemoteCatalog,
} from "@/lib/catalog";
import {
  readCatalogSnapshot,
  writeCatalogSnapshot,
} from "@/lib/catalogCache";
import {
  readCatalogMetaCache,
  writeCatalogMetaCache,
} from "@/lib/catalogMetaCache";
import { buildSearchIndex, filterArtworks, type SearchIndex } from "@/lib/searchIndex";
import { sanitizeRemoteCatalog, purgeLegacyCatalogCaches } from "@/lib/catalogValidate";
import { warmFeedImages } from "@/lib/imageCache";
import {
  diversifyFeed,
  isDefaultFeedEligible,
  isGenericMakerName,
  FEED_POOL_CAP,
  sortByPopularity,
} from "@/lib/feed-utils";

/** Where the currently-shown data came from. */
type CatalogSource = "mock" | "supabase";

interface CatalogValue {
  artworks: Artwork[];
  artists: Artist[];
  artworkMap: Record<string, Artwork>;
  artistMap: Record<string, Artist>;
  fypArtistCardMap: Record<string, FypArtistCard>;
  feedArtworks: Artwork[];
  feedPool: Artwork[];
  searchFacets: {
    periods: string[];
    empires: string[];
    categories: CategoryId[];
    countries: string[];
    cities: string[];
    museums: string[];
  };
  source: CatalogSource;
  loading: boolean;
  /** True while a scroll-triggered batch is in flight. */
  loadingBatch: boolean;
  /** False until the full archive is loaded (Search) or every batch is fetched. */
  catalogComplete: boolean;
  /** More popular-artwork batches remain on the server. */
  hasMoreBatches: boolean;
  catalogTotal: number | null;
  /** Fetch the next 80 artworks for the feed (no-op when exhausted or in flight). */
  loadNextBatch: () => Promise<void>;
  /** Load the archive in pages while Search is open — safe to call repeatedly. */
  ensureFullCatalog: () => Promise<void>;
  /** Stop the archive download when the user leaves Search. */
  pauseFullCatalog: () => void;
  refresh: () => Promise<void>;

  getArtist: (id: string) => Artist | undefined;
  getFypArtistCard: (artistId: string) => FypArtistCard | undefined;
  getArtwork: (id: string) => Artwork | undefined;
  getArtworksByArtist: (artistId: string) => Artwork[];
  getArtistAvatar: (artistId: string) => string | undefined;
  getArtworksByCategory: (id: CategoryId) => Artwork[];
  searchArtworks: (query: ArtworkSearchQuery) => Artwork[];
}

const CatalogContext = createContext<CatalogValue | null>(null);

/** Merge two artwork/artist lists, keeping the first occurrence of each id. */
function mergeById<T extends { id: string }>(base: T[], extra: T[]): T[] {
  const seen = new Set(base.map((item) => item.id));
  const out = [...base];
  for (const item of extra) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

function mergeRemoteCatalog(
  base: RemoteCatalog | null,
  incoming: RemoteCatalog,
): RemoteCatalog {
  if (!base) return incoming;
  return {
    artworks: mergeById(base.artworks, incoming.artworks),
    artists: mergeById(base.artists, incoming.artists),
    fypArtistCards: mergeById(base.fypArtistCards, incoming.fypArtistCards),
  };
}

/** Popularity-ranked pool with freelance originals woven in every few items. */
function buildFeed(
  list: Artwork[],
  artistMap: Record<string, Artist>,
): Artwork[] {
  const sorted = sortByPopularity(list, artistMap);
  const historical = sorted.filter((a) => a.origin !== "artist-original");
  const freelance = sorted.filter((a) => a.origin === "artist-original");
  const out: Artwork[] = [];
  let fi = 0;
  historical.forEach((art, i) => {
    out.push(art);
    if ((i + 1) % 3 === 0 && fi < freelance.length) out.push(freelance[fi++]);
  });
  while (fi < freelance.length) out.push(freelance[fi++]);
  return diversifyFeed(out);
}

/** Persist the first feed window + warm those image bytes for the next launch. */
function persistFeedWindow(
  feedWindow: Artwork[],
  artists: Artist[],
  fypArtistCards: FypArtistCard[] = [],
): void {
  const artistIds = new Set(feedWindow.map((a) => a.artistId));
  writeCatalogSnapshot({
    artworks: feedWindow.slice(0, CATALOG_BATCH_SIZE),
    artists: artists.filter((a) => artistIds.has(a.id)),
    fypArtistCards,
  });
  warmFeedImages(
    feedWindow.map((a) => a.image),
    12,
  );
}

export const FEED_LIMIT = CATALOG_BATCH_SIZE;

export function CatalogProvider({
  children,
  paused = false,
}: {
  children: React.ReactNode;
  paused?: boolean;
}) {
  const snapshotRef = useRef(readCatalogSnapshot());
  const snapshot = snapshotRef.current;
  const loadControllerRef = useRef<AbortController | null>(null);
  const batchControllerRef = useRef<AbortController | null>(null);
  const fullLoadControllerRef = useRef<AbortController | null>(null);
  const fullLoadStartedRef = useRef(false);
  const archiveOffsetRef = useRef(0);
  const serverOffsetRef = useRef(snapshot?.artworks.length ?? 0);
  const searchIndexRef = useRef<SearchIndex | null>(null);
  const [searchIndexReady, setSearchIndexReady] = useState(false);
  const [remote, setRemote] = useState<RemoteCatalog | null>(snapshot);
  const [source, setSource] = useState<CatalogSource>(
    snapshot ? "supabase" : "mock",
  );
  const [loading, setLoading] = useState(!snapshot);
  const [loadingBatch, setLoadingBatch] = useState(false);
  const [catalogComplete, setCatalogComplete] = useState(false);
  const [hasMoreBatches, setHasMoreBatches] = useState(true);
  const [catalogTotal, setCatalogTotal] = useState<number | null>(null);
  const catalogTotalRef = useRef<number | null>(null);
  catalogTotalRef.current = catalogTotal;

  const updateHasMore = useCallback((fetchedCount: number) => {
    if (fetchedCount < CATALOG_BATCH_SIZE) {
      setHasMoreBatches(false);
      return;
    }
    const total = catalogTotalRef.current;
    if (total !== null && serverOffsetRef.current >= total) {
      setHasMoreBatches(false);
      return;
    }
    setHasMoreBatches(true);
  }, []);

  const applyBatch = useCallback(
    (data: RemoteCatalog, opts?: { fetchedCount?: number; skipHasMore?: boolean }) => {
      const clean = sanitizeRemoteCatalog(data);
      if (!clean || clean.artworks.length === 0) return false;
      setRemote((prev) => mergeRemoteCatalog(prev, clean));
      setSource("supabase");
      setLoading(false);
      if (!opts?.skipHasMore) {
        updateHasMore(opts?.fetchedCount ?? clean.artworks.length);
      }
      return true;
    },
    [updateHasMore],
  );

  const applyFullCatalog = useCallback((data: RemoteCatalog) => {
    const clean = sanitizeRemoteCatalog(data);
    if (!clean || clean.artworks.length === 0) return;
    setRemote(clean);
    setSource("supabase");
    setLoading(false);
    setCatalogComplete(true);
    setHasMoreBatches(false);
    serverOffsetRef.current = clean.artworks.length;
    archiveOffsetRef.current = clean.artworks.length;
    void writeCatalogMetaCache(clean);
  }, []);

  const fetchBatchAtOffset = useCallback(
    async (offset: number, signal?: AbortSignal) => {
      const batch = await fetchArtworkBatch(offset, CATALOG_BATCH_SIZE, signal);
      if (signal?.aborted) return null;
      serverOffsetRef.current = offset + batch.artworks.length;
      applyBatch(batch, { fetchedCount: batch.artworks.length });
      return batch;
    },
    [applyBatch],
  );

  const loadInitial = useCallback(
    async (signal: AbortSignal) => {
      void fetchArtworkCount(signal).then((count) => {
        if (count !== null && !signal.aborted) {
          setCatalogTotal(count);
          if (serverOffsetRef.current >= count) setHasMoreBatches(false);
        }
      });

      if (snapshotRef.current) {
        setLoading(false);
        if (serverOffsetRef.current === 0) {
          await fetchBatchAtOffset(0, signal);
        }
        return;
      }

      try {
        await fetchBatchAtOffset(0, signal);
      } catch (err) {
        if (signal.aborted) return;
        console.warn("Catalog: first batch failed.", err);
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [fetchBatchAtOffset],
  );

  const loadNextBatch = useCallback(async () => {
    if (loadingBatch || !hasMoreBatches || catalogComplete) return;
    batchControllerRef.current?.abort();
    const controller = new AbortController();
    batchControllerRef.current = controller;
    setLoadingBatch(true);
    try {
      await fetchBatchAtOffset(serverOffsetRef.current, controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) {
        console.warn("Catalog: next batch failed.", err);
      }
    } finally {
      if (batchControllerRef.current === controller) {
        batchControllerRef.current = null;
      }
      if (!controller.signal.aborted) setLoadingBatch(false);
    }
  }, [loadingBatch, hasMoreBatches, catalogComplete, fetchBatchAtOffset]);

  const pauseFullCatalog = useCallback(() => {
    fullLoadControllerRef.current?.abort();
    fullLoadControllerRef.current = null;
    fullLoadStartedRef.current = false;
  }, []);

  const ensureFullCatalog = useCallback(async () => {
    if (catalogComplete) return;
    if (fullLoadStartedRef.current) return;
    fullLoadStartedRef.current = true;

    fullLoadControllerRef.current?.abort();
    const controller = new AbortController();
    fullLoadControllerRef.current = controller;

    try {
      if (archiveOffsetRef.current === 0) {
        const cached = await readCatalogMetaCache();
        if (cached && !controller.signal.aborted) {
          applyFullCatalog(cached);
          return;
        }
      }

      while (!controller.signal.aborted) {
        const page = await fetchCatalogArchivePage(
          archiveOffsetRef.current,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        archiveOffsetRef.current += page.artworks.length;
        const clean = sanitizeRemoteCatalog(page);
        if (clean) {
          setRemote((prev) => mergeRemoteCatalog(prev, clean));
          setSource("supabase");
          setLoading(false);
        }
        if (page.artworks.length < CATALOG_ARCHIVE_PAGE_SIZE) {
          setCatalogComplete(true);
          setHasMoreBatches(false);
          serverOffsetRef.current = archiveOffsetRef.current;
          setRemote((prev) => {
            if (prev) void writeCatalogMetaCache(prev);
            return prev;
          });
          break;
        }
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        console.warn("Catalog: archive page load failed.", err);
        fullLoadStartedRef.current = false;
      }
    } finally {
      if (fullLoadControllerRef.current === controller) {
        fullLoadControllerRef.current = null;
      }
      if (controller.signal.aborted) {
        fullLoadStartedRef.current = false;
      }
    }
  }, [catalogComplete, applyFullCatalog]);

  useEffect(() => {
    if (paused) return;

    purgeLegacyCatalogCaches();
    if (snapshotRef.current?.artworks.length) {
      warmFeedImages(
        snapshotRef.current.artworks.map((a) => a.image),
        12,
      );
    }
    const controller = new AbortController();
    loadControllerRef.current = controller;
    void loadInitial(controller.signal);

    return () => {
      controller.abort();
      if (loadControllerRef.current === controller) {
        loadControllerRef.current = null;
      }
    };
  }, [loadInitial, paused]);

  useEffect(() => {
    if (catalogTotal === null) return;
    if (serverOffsetRef.current >= catalogTotal) {
      setHasMoreBatches(false);
    }
  }, [catalogTotal, remote?.artworks.length]);

  useEffect(() => {
    if (!remote?.artworks.length) {
      searchIndexRef.current = null;
      setSearchIndexReady(false);
      return;
    }
    const artistMap = Object.fromEntries(remote.artists.map((a) => [a.id, a]));
    searchIndexRef.current = null;
    setSearchIndexReady(false);
    let cancelled = false;
    const build = () => {
      if (cancelled) return;
      searchIndexRef.current = buildSearchIndex(remote.artworks, artistMap);
      setSearchIndexReady(true);
    };
    // Small pools (first feed batches) index immediately so typing in Search works.
    if (remote.artworks.length <= 400) {
      build();
      return () => {
        cancelled = true;
      };
    }
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(build, { timeout: 2500 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(id);
      };
    }
    const timer = globalThis.setTimeout(build, 0);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timer);
    };
  }, [remote]);

  const rankedFeedRef = useRef<{
    key: string;
    pool: Artwork[];
    window: Artwork[];
  } | null>(null);

  useEffect(() => {
    if (!remote || source !== "supabase") return;
    const key = `${remote.artworks.length}:${remote.artists.length}`;
    if (rankedFeedRef.current?.key !== key) return;
    persistFeedWindow(
      rankedFeedRef.current.window,
      remote.artists,
      remote.fypArtistCards,
    );
  }, [remote, source]);

  const refresh = useCallback(async () => {
    loadControllerRef.current?.abort();
    batchControllerRef.current?.abort();
    fullLoadControllerRef.current?.abort();
    fullLoadStartedRef.current = false;
    serverOffsetRef.current = 0;
    archiveOffsetRef.current = 0;
    setHasMoreBatches(true);
    setCatalogComplete(false);

    const controller = new AbortController();
    loadControllerRef.current = controller;
    setLoading(true);
    setRemote(null);
    try {
      await fetchBatchAtOffset(0, controller.signal);
    } catch (err) {
      if (!controller.signal.aborted) {
        console.warn("Catalog refresh failed.", err);
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [fetchBatchAtOffset]);

  const value = useMemo<CatalogValue>(() => {
    const hasRemote = !!remote && remote.artworks.length > 0;

    const browseArtworks = hasRemote ? remote!.artworks : [];
    const browseArtists = hasRemote ? remote!.artists : [];

    const allArtworks = hasRemote
      ? mergeById(remote!.artworks, mockArtworks)
      : mockArtworks;
    const allArtists = hasRemote
      ? mergeById(remote!.artists, mockArtists)
      : mockArtists;

    const artworkMap = Object.fromEntries(allArtworks.map((a) => [a.id, a]));
    const artistMap = Object.fromEntries(allArtists.map((a) => [a.id, a]));
    const fypArtistCards =
      hasRemote && Array.isArray(remote!.fypArtistCards)
        ? remote!.fypArtistCards
        : [];
    const fypArtistCardMap = Object.fromEntries(
      fypArtistCards.map((c) => [c.artistId, c]),
    );

    const searchFacets = {
      periods: Array.from(new Set(browseArtworks.map((a) => a.period))).sort(),
      empires: Array.from(
        new Set(
          browseArtworks.map((a) => a.empire).filter((e): e is string => !!e),
        ),
      ).sort(),
      categories: Array.from(
        new Set(browseArtworks.map((a) => a.category)),
      ) as CategoryId[],
      ...uniquePlaceFacets(browseArtworks),
    };

    const searchArtworks = (query: ArtworkSearchQuery): Artwork[] => {
      if (searchIndexRef.current) {
        return searchIndexRef.current.search(query);
      }
      return filterArtworks(browseArtworks, query, artistMap);
    };

    void searchIndexReady;

    const isUnknownArtist = (artistId: string): boolean => {
      const name = artistMap[artistId]?.name ?? "";
      return !name || /^(unknown|anonymous|unidentified)/i.test(name);
    };
    const feedCandidates = browseArtworks
      .filter((a) => !isUnknownArtist(a.artistId))
      .filter(isDefaultFeedEligible);
    const namedFeedFull = buildFeed(feedCandidates, artistMap).slice(
      0,
      FEED_POOL_CAP,
    );
    const namedFeed = namedFeedFull.slice(0, CATALOG_BATCH_SIZE);
    rankedFeedRef.current = {
      key: `${browseArtworks.length}:${browseArtists.length}`,
      pool: namedFeedFull,
      window: namedFeed,
    };

    const artworksByArtistId: Record<string, Artwork[]> = {};
    for (const art of allArtworks) {
      const list = artworksByArtistId[art.artistId];
      if (list) list.push(art);
      else artworksByArtistId[art.artistId] = [art];
    }

    return {
      artworks: browseArtworks,
      artists: browseArtists,
      artworkMap,
      artistMap,
      fypArtistCardMap,
      feedArtworks: namedFeed,
      feedPool: namedFeedFull,
      searchFacets,
      source,
      loading,
      loadingBatch,
      catalogComplete,
      hasMoreBatches,
      catalogTotal,
      loadNextBatch,
      ensureFullCatalog,
      pauseFullCatalog,
      refresh,
      getArtist: (id) => artistMap[id],
      getFypArtistCard: (artistId) => fypArtistCardMap[artistId],
      getArtwork: (id) => artworkMap[id],
      getArtworksByArtist: (artistId) => artworksByArtistId[artistId] ?? [],
      getArtistAvatar: (artistId) => {
        const artist = artistMap[artistId];
        if (!artist || isGenericMakerName(artist.name)) return undefined;
        return artist.avatar;
      },
      getArtworksByCategory: (id) =>
        browseArtworks.filter((a) => artworkMatchesCategory(a, id)),
      searchArtworks,
    };
  }, [
    remote,
    source,
    loading,
    loadingBatch,
    catalogComplete,
    hasMoreBatches,
    catalogTotal,
    loadNextBatch,
    ensureFullCatalog,
    pauseFullCatalog,
    refresh,
    searchIndexReady,
  ]);

  return (
    <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>
  );
}

export function useCatalog(): CatalogValue {
  const ctx = useContext(CatalogContext);
  if (!ctx) {
    throw new Error("useCatalog must be used within a CatalogProvider");
  }
  return ctx;
}
