/**
 * Precomputed search metadata for the browse catalog.
 * Built once per catalog revision so Search can filter ~12k rows in one pass
 * without recomputing place lookups or sellability on every tab click.
 */
import {
  artworkMatchesCategory,
  placeOfArtwork,
  toSelectionList,
  type ArtworkSearchQuery,
} from "@/data";
import type { Artwork, Artist } from "@/data";
import { isCanvasSellable } from "@/lib/sellability";
import { isPortraitArtwork } from "@/lib/feed-utils";

export type CanvasFilter = "any" | "available" | "unavailable";

interface IndexedArtwork {
  art: Artwork;
  haystack: string;
  museum: string;
  city: string;
  country: string;
  sellable: boolean;
}

export interface SearchIndex {
  all: Artwork[];
  sellable: Artwork[];
  unsellable: Artwork[];
  search: (query: ArtworkSearchQuery) => Artwork[];
}

/** Cheap O(n) canvas partitions — available before the full text index finishes. */
export function buildCanvasPartitions(artworks: Artwork[]): Pick<
  SearchIndex,
  "all" | "sellable" | "unsellable"
> {
  const sellable: Artwork[] = [];
  const unsellable: Artwork[] = [];
  for (const art of artworks) {
    if (isCanvasSellable(art)) sellable.push(art);
    else unsellable.push(art);
  }
  return { all: artworks, sellable, unsellable };
}

export function buildSearchIndex(
  artworks: Artwork[],
  artistMap: Record<string, Artist>,
): SearchIndex {
  const indexed: IndexedArtwork[] = artworks.map((art) => {
    const place = placeOfArtwork(art);
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
    const sellable = isCanvasSellable(art);
    return {
      art,
      haystack,
      museum: place.museum,
      city: place.city ?? "",
      country: place.country ?? "",
      sellable,
    };
  });

  const sellable: Artwork[] = [];
  const unsellable: Artwork[] = [];
  for (const row of indexed) {
    if (row.sellable) sellable.push(row.art);
    else unsellable.push(row.art);
  }

  const search = (query: ArtworkSearchQuery): Artwork[] => {
    const text = query.text?.trim().toLowerCase() ?? "";
    const terms = text ? text.split(/\s+/).filter(Boolean) : [];
    const periodList = toSelectionList(query.period, query.periods);
    const empireList = toSelectionList(query.empire, query.empires);
    const categoryList = toSelectionList(query.category, query.categories);
    const artistList = toSelectionList(query.artistId, query.artistIds);
    const countryList = toSelectionList(undefined, query.countries);
    const cityList = toSelectionList(undefined, query.cities);
    const museumList = toSelectionList(undefined, query.museums);
    const canvas = query.canvas ?? "any";
    const needsPlace =
      countryList.length > 0 ||
      cityList.length > 0 ||
      museumList.length > 0 ||
      terms.length > 0;

    const pool =
      canvas === "available"
        ? sellable
        : canvas === "unavailable"
          ? unsellable
          : artworks;

    if (
      !query.portraitsOnly &&
      periodList.length === 0 &&
      empireList.length === 0 &&
      categoryList.length === 0 &&
      artistList.length === 0 &&
      !needsPlace &&
      terms.length === 0
    ) {
      return pool;
    }

    const indexedPool =
      canvas === "available"
        ? indexed.filter((row) => row.sellable)
        : canvas === "unavailable"
          ? indexed.filter((row) => !row.sellable)
          : indexed;

    const out: Artwork[] = [];
    for (const row of indexedPool) {
      const art = row.art;
      if (query.portraitsOnly && !isPortraitArtwork(art)) continue;
      if (periodList.length && !periodList.includes(art.period)) continue;
      if (empireList.length && !(art.empire && empireList.includes(art.empire)))
        continue;
      if (
        categoryList.length > 0 &&
        !categoryList.some((id) => artworkMatchesCategory(art, id))
      )
        continue;
      if (artistList.length && !artistList.includes(art.artistId)) continue;
      if (needsPlace) {
        if (countryList.length && !row.country) continue;
        if (countryList.length && !countryList.includes(row.country)) continue;
        if (cityList.length && !row.city) continue;
        if (cityList.length && !cityList.includes(row.city)) continue;
        if (museumList.length && !museumList.includes(row.museum)) continue;
      }
      if (terms.length && !terms.every((term) => row.haystack.includes(term)))
        continue;
      out.push(art);
    }
    return out;
  };

  return {
    all: artworks,
    sellable,
    unsellable,
    search,
  };
}
