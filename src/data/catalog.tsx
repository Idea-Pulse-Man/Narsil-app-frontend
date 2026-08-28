/**
 * Live catalog provider.
 * ---------------------------------------------------------------------------
 * Hydrates from a local snapshot (last visit's first ~80 feed works) so the
 * For You screen can paint immediately, then:
 *   1. fetches a popular preview page if there was no snapshot
 *   2. fetches the full catalog in the background
 *
 * Browse surfaces never show bundled mock artworks; History lookups still
 * merge mocks so curated timeline ids resolve.
 *
 * Components read everything dynamic (artworks, artists, lookups, search) from
 * `useCatalog()` so they re-render once the backend data arrives. Static config
 * (categories, history eras, shop) still comes from `@/data` directly.
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
  fetchArtworkCount,
  fetchCatalogPreview,
  fetchSupabaseCatalog,
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
import { buildSearchIndex } from "@/lib/searchIndex";
import { warmFeedImages } from "@/lib/imageCache";
import {
  isDefaultFeedEligible,
  isGenericMakerName,
  sortByPopularity,
} from "@/lib/feed-utils";

/** Yield to the browser so first paint can finish before heavy downloads. */
function yieldToMainThread(
  signal?: AbortSignal,
  timeoutMs = 120,
): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener("abort", finish);
      resolve();
    };
    signal?.addEventListener("abort", finish);
    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(finish, { timeout: timeoutMs });
    } else {
      globalThis.setTimeout(finish, 0);
    }
  });
}

/** Where the currently-shown data came from. */
type CatalogSource = "mock" | "supabase";

interface CatalogValue {
  artworks: Artwork[];
  artists: Artist[];
  artworkMap: Record<string, Artwork>;
  artistMap: Record<string, Artist>;
  /** Active For You artist story cards keyed by artist id. */
  fypArtistCardMap: Record<string, FypArtistCard>;
  feedArtworks: Artwork[];
  /** Full named + interleaved feed order (uncapped) — used by the For You feed
   *  so it can pick unseen works from the whole pool, not just the first window. */
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
  /**
   * False while browse surfaces are still showing the cached feed window (80
   * works) or the popular preview page instead of the whole archive. Search
   * relies on this so its result count never reads as the full catalog.
   */
  catalogComplete: boolean;
  /** Browsable artworks in the archive, counted server-side. Null when unknown. */
  catalogTotal: number | null;
  /** Re-fetch the catalog from Supabase (e.g. after the user posts new art). */
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

/**
 * Max number of artworks loaded into the browse feed at once. Keeps the "For
 * You" page fast (only ~80 images decode) and, since Buy + History + Search all
 * derive from this same feed, keeps every browse surface showing the same set.
 */
export const FEED_LIMIT = 80;

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
  return out;
}

/** Persist the first feed window + warm those image bytes for the next launch. */
function persistFeedWindow(
  artworks: Artwork[],
  artists: Artist[],
  artistMap: Record<string, Artist>,
  fypArtistCards: FypArtistCard[] = [],
): void {
  const isUnknownArtist = (artistId: string): boolean => {
    const name = artistMap[artistId]?.name ?? "";
    return !name || /^(unknown|anonymous|unidentified)/i.test(name);
  };
  const feed = buildFeed(
    artworks.filter((a) => !isUnknownArtist(a.artistId)).filter(isDefaultFeedEligible),
    artistMap,
  ).slice(0, FEED_LIMIT);
  const artistIds = new Set(feed.map((a) => a.artistId));
  writeCatalogSnapshot({
    artworks: feed,
    artists: artists.filter((a) => artistIds.has(a.id)),
    fypArtistCards,
  });
  // First visit: only warm the opening cards so they don't compete with the
  // image the user is looking at.
  warmFeedImages(
    feed.map((a) => a.image),
    3,
  );
}

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const snapshotRef = useRef(readCatalogSnapshot());
  const snapshot = snapshotRef.current;
  const metaHydratedRef = useRef(false);
  const [remote, setRemote] = useState<RemoteCatalog | null>(snapshot);
  const [source, setSource] = useState<CatalogSource>(
    snapshot ? "supabase" : "mock",
  );
  const [loading, setLoading] = useState(!snapshot);
  // The snapshot is only the first feed window, so a hydrated app still has to
  // wait for the full table before Search can see the whole archive.
  const [catalogComplete, setCatalogComplete] = useState(false);
  const [catalogTotal, setCatalogTotal] = useState<number | null>(null);

  const applyRemote = useCallback(
    (data: RemoteCatalog, opts?: { complete?: boolean }) => {
      if (data.artworks.length === 0) {
        // Without this warning a failed full fetch looks like a working app that
        // simply owns 80 artworks, because the cached window stays on screen.
        if (opts?.complete) {
          console.warn(
            "Catalog: the full fetch returned no usable artworks (rows missing image_url?) — browse surfaces stay on the cached feed window.",
          );
        }
        return;
      }
      setRemote(data);
      setSource("supabase");
      setLoading(false);
      if (opts?.complete) {
        setCatalogComplete(true);
        void writeCatalogMetaCache(data);
      }
    },
    [],
  );

  const load = useCallback(
    async (signal?: AbortSignal, opts?: { skipPreview?: boolean }) => {
      // Cheap head-count alongside the row fetches, so the archive size is on
      // screen long before the rows themselves finish downloading.
      void fetchArtworkCount(signal).then((count) => {
        if (count !== null && !signal?.aborted) setCatalogTotal(count);
      });
      try {
        // First visit: a single popular page unblocks the feed. Return visits
        // already painted from the snapshot, so skip straight to the full table.
        if (!opts?.skipPreview) {
          try {
            const preview = await fetchCatalogPreview(signal);
            if (signal?.aborted) return;
            applyRemote(preview);
            await yieldToMainThread(signal);
            if (signal?.aborted) return;
          } catch (err) {
            if (signal?.aborted) return;
            console.warn("Catalog preview failed, trying full catalog.", err);
          }
        } else {
          await yieldToMainThread(signal, 80);
          if (signal?.aborted) return;
        }
        const full = await fetchSupabaseCatalog(signal);
        if (signal?.aborted) return;
        applyRemote(full, { complete: true });
      } catch (err) {
        if (signal?.aborted) return;
        console.warn("Catalog: using cached or mock data (Supabase unavailable).", err);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [applyRemote],
  );

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      if (!snapshotRef.current) {
        const cached = await readCatalogMetaCache();
        if (cached && !controller.signal.aborted) {
          metaHydratedRef.current = true;
          applyRemote(cached, { complete: true });
        }
      }
      await load(controller.signal, {
        skipPreview: Boolean(snapshotRef.current || metaHydratedRef.current),
      });
    })();
    return () => controller.abort();
  }, [load, applyRemote]);

  // After any live catalog lands, remember the opening feed + its images.
  useEffect(() => {
    if (!remote || source !== "supabase") return;
    const artistMap = Object.fromEntries(remote.artists.map((a) => [a.id, a]));
    persistFeedWindow(
      remote.artworks,
      remote.artists,
      artistMap,
      remote.fypArtistCards,
    );
  }, [remote, source]);

  // Pull fresh rows on demand (e.g. right after a user publishes new art) so the
  // new post shows up immediately instead of only after a full app reload.
  const refresh = useCallback(async () => {
    await load(undefined, { skipPreview: false });
  }, [load]);

  const value = useMemo<CatalogValue>(() => {
    const hasRemote = !!remote && remote.artworks.length > 0;

    // Browse surfaces (For You feed, Search, Discover, Buy) show ONLY real museum
    // art from the backend. Before it arrives (or if the backend is down) they
    // stay empty rather than seeding fake/mock artworks — the UI shows a loading
    // state instead (see `loading`).
    const browseArtworks = hasRemote ? remote!.artworks : [];
    const browseArtists = hasRemote ? remote!.artists : [];

    // Lookups still include the curated mock data so the History timeline and
    // previously-saved items resolve by id.
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

    const searchIndex = buildSearchIndex(browseArtworks, artistMap);

    const searchArtworks = (query: ArtworkSearchQuery): Artwork[] =>
      searchIndex.search(query);

    // The For You feed (and, by extension, the Buy page, which derives from it)
    // should feature real, named makers — not the huge pile of works the museum
    // catalogs as "Unknown Artist". Drop those before building the feed so the
    // 80-item window fills up with attributable art.
    const isUnknownArtist = (artistId: string): boolean => {
      const name = artistMap[artistId]?.name ?? "";
      return !name || /^(unknown|anonymous|unidentified)/i.test(name);
    };
    const namedFeedFull = buildFeed(
      browseArtworks
        .filter((a) => !isUnknownArtist(a.artistId))
        .filter(isDefaultFeedEligible),
      artistMap,
    );
    const namedFeed = namedFeedFull.slice(0, FEED_LIMIT);

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
      catalogComplete,
      catalogTotal,
      refresh,
      getArtist: (id) => artistMap[id],
      getFypArtistCard: (artistId) => fypArtistCardMap[artistId],
      getArtwork: (id) => artworkMap[id],
      // Profiles resolve works from the full pool (real + curated).
      getArtworksByArtist: (artistId) =>
        allArtworks.filter((a) => a.artistId === artistId),
      // Suppress portrait photos for anonymous/generic makers ("a Chinese
      // artist", "British School", workshops…) — they have no personal likeness,
      // so fall back to the monogram even if a stale avatar is stored upstream.
      getArtistAvatar: (artistId) => {
        const artist = artistMap[artistId];
        if (!artist || isGenericMakerName(artist.name)) return undefined;
        return artist.avatar;
      },
      getArtworksByCategory: (id) =>
        browseArtworks.filter((a) => artworkMatchesCategory(a, id)),
      searchArtworks,
    };
  }, [remote, source, loading, catalogComplete, catalogTotal, refresh]);

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
