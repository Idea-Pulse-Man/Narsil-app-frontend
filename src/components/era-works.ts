import { useCallback, useMemo } from "react";
import {
  historyEras,
  eraForArtwork,
  type Artwork,
  type Artist,
} from "@/data";
import { useCatalog } from "@/data/catalog";

/**
 * Every work belonging to each era, keyed by era id. Curated set-pieces stay
 * pinned first, then the live museum catalog fills in behind them (matched by
 * period/tags/empire, then date).
 *
 * Shared by the Discover timeline and the full-screen era list so both agree
 * on what an age contains.
 */
export function useEraWorks(): Map<string, Artwork[]> {
  const { artworks: liveArtworks, getArtwork } = useCatalog();
  return useMemo(() => {
    const map = new Map<string, Artwork[]>();
    for (const era of historyEras) {
      map.set(
        era.id,
        era.artworkIds
          .map((id) => getArtwork(id))
          .filter((a): a is Artwork => !!a),
      );
    }
    for (const art of liveArtworks) {
      const era = eraForArtwork(art);
      if (!era) continue;
      const list = map.get(era.id);
      if (!list) continue;
      if (!list.some((a) => a.id === art.id)) list.push(art);
    }
    return map;
  }, [liveArtworks, getArtwork]);
}

/**
 * The named artists working in a set of works — anonymous/"Unknown" makers add
 * nothing to a portrait rail, so they're skipped.
 */
export function useArtistsForWorks(): (works: Artwork[]) => Artist[] {
  const { getArtist } = useCatalog();
  return useCallback(
    (works: Artwork[]) => {
      const seen = new Set<string>();
      const list: Artist[] = [];
      for (const work of works) {
        const artist = getArtist(work.artistId);
        if (!artist || seen.has(artist.id)) continue;
        if (!artist.name || /^unknown/i.test(artist.name)) continue;
        seen.add(artist.id);
        list.push(artist);
      }
      return list.slice(0, 16);
    },
    [getArtist],
  );
}
