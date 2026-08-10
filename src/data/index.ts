import { artworks, artworkMap } from "./artworks";
import { artists, artistMap, shouldResolvePortrait } from "./artists";
import { historyEras, featuredArtistIds, eraForArtwork } from "./history";
import { categories, categoryMap, artworkMatchesCategory } from "./categories";
import {
  canvasProducts,
  CANVAS_SIZES,
  priceForSize,
  priceFromId,
} from "./shop";
import type {
  Artwork,
  Artist,
  CategoryId,
  ArtworkOrigin,
  ArtistProfileType,
} from "./types";
import type { HistoryEra } from "./history";
import type { Category, CategoryGroup } from "./categories";
import type { CanvasSize, CanvasOption, CanvasProduct } from "./shop";

export {
  artworks,
  artworkMap,
  artists,
  artistMap,
  shouldResolvePortrait,
  historyEras,
  featuredArtistIds,
  eraForArtwork,
  categories,
  categoryMap,
  artworkMatchesCategory,
  canvasProducts,
  CANVAS_SIZES,
  priceForSize,
  priceFromId,
};

export {
  WORLD,
  APPRAISAL_RANKS,
  appraisalFor,
  practiceVerdict,
} from "./worldCopy";
export type { AppraisalRank } from "./worldCopy";

export type {
  Artwork,
  Artist,
  CategoryId,
  ArtworkOrigin,
  ArtistProfileType,
  HistoryEra,
  Category,
  CategoryGroup,
  CanvasSize,
  CanvasOption,
  CanvasProduct,
};

export const getArtist = (artistId: string): Artist | undefined =>
  artistMap[artistId];

export const getArtwork = (artworkId: string): Artwork | undefined =>
  artworkMap[artworkId];

export const getArtworksByArtist = (artistId: string): Artwork[] =>
  artworks.filter((a) => a.artistId === artistId);

/**
 * The artist's profile portrait, if one exists. Returns undefined when the
 * artist has no portrait so the UI falls back to their initials (e.g. "Aurora
 * Vane" → "AV") rather than borrowing an artwork image.
 */
export const getArtistAvatar = (artistId: string): string | undefined => {
  return artistMap[artistId]?.avatar;
};

export const getArtworksByCategory = (id: CategoryId): Artwork[] =>
  artworks.filter((a) => artworkMatchesCategory(a, id));

/** Human-readable label for an origin badge. */
export const originLabel = (origin: ArtworkOrigin): string => {
  switch (origin) {
    case "public-domain":
      return "Public Domain";
    case "artist-original":
      return "Artist Original";
    case "fan-study":
      return "Fan Study";
  }
};

/**
 * Feed ordering for the For You page — interleaves public-domain masters with
 * sample freelance originals so both surface early. Replaceable later with a
 * personalised / Supabase-backed ranking.
 */
export const feedArtworks: Artwork[] = (() => {
  const historical = artworks.filter((a) => a.origin !== "artist-original");
  const freelance = artworks.filter((a) => a.origin === "artist-original");
  const out: Artwork[] = [];
  let fi = 0;
  historical.forEach((art, i) => {
    out.push(art);
    // Drop in a freelance piece every few historical works.
    if ((i + 1) % 3 === 0 && fi < freelance.length) {
      out.push(freelance[fi++]);
    }
  });
  while (fi < freelance.length) out.push(freelance[fi++]);
  return out;
})();

/** Unique, sorted facet values used by the Search filters. */
export const searchFacets = {
  periods: Array.from(new Set(artworks.map((a) => a.period))).sort(),
  empires: Array.from(
    new Set(artworks.map((a) => a.empire).filter((e): e is string => !!e))
  ).sort(),
  categories: categories.map((c) => c.id),
};

export interface ArtworkSearchQuery {
  text?: string;
  /** Single-value fields (kept for backwards compatibility). */
  period?: string;
  empire?: string;
  category?: CategoryId;
  artistId?: string;
  /** Multi-value fields — an artwork matches if it is in ANY of the values. */
  periods?: string[];
  empires?: string[];
  categories?: CategoryId[];
  artistIds?: string[];
  /** When true, only portrait-like works (Search facet). */
  portraitsOnly?: boolean;
}

/** Merge a single value + a list into one list of selected values. */
export function toSelectionList<T>(single?: T, list?: T[]): T[] {
  if (list && list.length > 0) return list;
  if (single != null) return [single];
  return [];
}

/** Pure, front-end filtering over the local dataset (v1 search). */
export const searchArtworks = (query: ArtworkSearchQuery): Artwork[] => {
  const text = query.text?.trim().toLowerCase() ?? "";
  return artworks.filter((art) => {
    const periods = toSelectionList(query.period, query.periods);
    const empires = toSelectionList(query.empire, query.empires);
    const cats = toSelectionList(query.category, query.categories);
    const artistIds = toSelectionList(query.artistId, query.artistIds);
    if (periods.length && !periods.includes(art.period)) return false;
    if (empires.length && !(art.empire && empires.includes(art.empire)))
      return false;
    if (cats.length && !cats.some((id) => artworkMatchesCategory(art, id)))
      return false;
    if (artistIds.length && !artistIds.includes(art.artistId)) return false;
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
