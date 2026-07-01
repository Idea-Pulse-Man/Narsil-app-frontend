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
} from "./index";
import type { Artwork, Artist, CategoryId, ArtworkSearchQuery } from "./index";
import { fetchRemoteCatalog } from "@/lib/api";

/** Where the currently-shown data came from. */
type CatalogSource = "mock" | "backend";

interface CatalogValue {
  artworks: Artwork[];
  artists: Artist[];
  artworkMap: Record<string, Artwork>;
  artistMap: Record<string, Artist>;
  feedArtworks: Artwork[];
  searchFacets: {
    periods: string[];
    empires: string[];
    categories: CategoryId[];
  };
  source: CatalogSource;
  loading: boolean;

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

/** Interleave historical masters with freelance originals (same rule as v1). */
function buildFeed(list: Artwork[]): Artwork[] {
  const historical = list.filter((a) => a.origin !== "artist-original");
  const freelance = list.filter((a) => a.origin === "artist-original");
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

  useEffect(() => {
    const controller = new AbortController();
    fetchRemoteCatalog(controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        // Only switch to backend data if it actually returned artworks.
        if (data.artworks.length > 0) {
          setRemote(data);
          setSource("backend");
        }
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        // Backend unreachable — stay on mock data so the app still works.
        console.warn("Catalog: using mock data (backend unavailable).", err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

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
    };

    const searchArtworks = (query: ArtworkSearchQuery): Artwork[] => {
      const text = query.text?.trim().toLowerCase() ?? "";
      const periodList = toSelectionList(query.period, query.periods);
      const empireList = toSelectionList(query.empire, query.empires);
      const categoryList = toSelectionList(query.category, query.categories);
      const artistList = toSelectionList(query.artistId, query.artistIds);
      return browseArtworks.filter((art) => {
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
        if (text) {
          const artist = artistMap[art.artistId];
          const haystack = [
            art.title,
            art.period,
            art.medium,
            art.empire ?? "",
            artist?.name ?? "",
            ...art.tags,
          ]
            .join(" ")
            .toLowerCase();
          if (!haystack.includes(text)) return false;
        }
        return true;
      });
    };

    return {
      artworks: browseArtworks,
      artists: browseArtists,
      artworkMap,
      artistMap,
      feedArtworks: buildFeed(browseArtworks),
      searchFacets,
      source,
      loading,
      getArtist: (id) => artistMap[id],
      getArtwork: (id) => artworkMap[id],
      // Profiles resolve works from the full pool (real + curated).
      getArtworksByArtist: (artistId) =>
        allArtworks.filter((a) => a.artistId === artistId),
      getArtistAvatar: (artistId) => artistMap[artistId]?.avatar,
      getArtworksByCategory: (id) =>
        browseArtworks.filter((a) => artworkMatchesCategory(a, id)),
      searchArtworks,
    };
  }, [remote, source, loading]);

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
