/**
 * Live catalog provider.
 * ---------------------------------------------------------------------------
 * Starts with the bundled mock data so the app renders instantly and works
 * offline, then fetches real public-domain artworks from the backend and MERGES
 * them in (dedup by id). Merging — rather than replacing — keeps the curated
 * History timeline (which references specific mock artwork ids) working while
 * the feed, search and discover screens fill up with real museum art.
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
  useState,
} from "react";
import {
  artworks as mockArtworks,
  artists as mockArtists,
  artworkMatchesCategory,
  toSelectionList,
  placeOfArtwork,
  uniquePlaceFacets,
} from "./index";
import type { Artwork, Artist, CategoryId, ArtworkSearchQuery } from "./index";
import { fetchSupabaseCatalog } from "@/lib/catalog";
import {
  isDefaultFeedEligible,
  isGenericMakerName,
  isPortraitArtwork,
  sortByPopularity,
} from "@/lib/feed-utils";

/** Where the currently-shown data came from. */
type CatalogSource = "mock" | "supabase";

interface CatalogValue {
  artworks: Artwork[];
  artists: Artist[];
  artworkMap: Record<string, Artwork>;
  artistMap: Record<string, Artist>;
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
  /** Re-fetch the catalog from Supabase (e.g. after the user posts new art). */
  refresh: () => Promise<void>;

  getArtist: (id: string) => Artist | undefined;
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

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [remote, setRemote] = useState<{
    artworks: Artwork[];
    artists: Artist[];
  } | null>(null);
  const [source, setSource] = useState<CatalogSource>("mock");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await fetchSupabaseCatalog(signal);
      if (signal?.aborted) return;
      // Only switch to live data if Supabase actually returned artworks.
      if (data.artworks.length > 0) {
        setRemote(data);
        setSource("supabase");
      }
    } catch (err) {
      if (signal?.aborted) return;
      // Supabase unreachable — stay on mock data so the app still works.
      console.warn("Catalog: using mock data (Supabase unavailable).", err);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  // Pull fresh rows on demand (e.g. right after a user publishes new art) so the
  // new post shows up immediately instead of only after a full app reload.
  const refresh = useCallback(async () => {
    await load();
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
      const text = query.text?.trim().toLowerCase() ?? "";
      const periodList = toSelectionList(query.period, query.periods);
      const empireList = toSelectionList(query.empire, query.empires);
      const categoryList = toSelectionList(query.category, query.categories);
      const artistList = toSelectionList(query.artistId, query.artistIds);
      const countryList = toSelectionList(undefined, query.countries);
      const cityList = toSelectionList(undefined, query.cities);
      const museumList = toSelectionList(undefined, query.museums);
      return browseArtworks.filter((art) => {
        const place = placeOfArtwork(art);
        if (query.portraitsOnly && !isPortraitArtwork(art)) return false;
        if (periodList.length && !periodList.includes(art.period)) return false;
        if (empireList.length && !(art.empire && empireList.includes(art.empire)))
          return false;
        if (
          categoryList.length > 0 &&
          !categoryList.some((id) => artworkMatchesCategory(art, id))
        )
          return false;
        if (artistList.length && !artistList.includes(art.artistId))
          return false;
        if (
          countryList.length &&
          !(place.country && countryList.includes(place.country))
        )
          return false;
        if (cityList.length && !(place.city && cityList.includes(place.city)))
          return false;
        if (museumList.length && !museumList.includes(place.museum))
          return false;
        if (text) {
          const artist = artistMap[art.artistId];
          const haystack = [
            art.title,
            art.description,
            art.period,
            art.year,
            art.medium,
            art.empire ?? "",
            art.source,
            place.museum,
            place.city ?? "",
            place.country ?? "",
            artist?.name ?? "",
            ...art.tags,
          ]
            .join(" ")
            .toLowerCase();
          // Match if EVERY whitespace-separated term appears somewhere in the
          // metadata, so multi-word queries (e.g. "silene botanical") still hit
          // works whose terms are split across title, description and tags.
          const terms = text.split(/\s+/).filter(Boolean);
          if (!terms.every((term) => haystack.includes(term))) return false;
        }
        return true;
      });
    };

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
      feedArtworks: namedFeed,
      feedPool: namedFeedFull,
      searchFacets,
      source,
      loading,
      refresh,
      getArtist: (id) => artistMap[id],
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
  }, [remote, source, loading, refresh]);

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
