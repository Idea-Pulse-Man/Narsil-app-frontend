/**
 * The quiz's artwork pool.
 *
 * Mirrors DiscoverView: merge the curated mock set with the live museum catalog
 * so the quiz has material instantly (and offline), then grows as the backend
 * data arrives. De-dupes by id, keeping the curated entry first.
 */

import { useMemo } from "react";
import {
  artworks as curatedArtworks,
  type Artist,
  type Artwork,
} from "@/data";
import { useCatalog } from "@/data/catalog";

function mergeById<T extends { id: string }>(base: T[], extra: T[]): T[] {
  const seen = new Set(base.map((a) => a.id));
  const out = [...base];
  for (const item of extra) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

export function useQuizPool(): {
  pool: Artwork[];
  artists: Record<string, Artist>;
  loading: boolean;
} {
  const { artworks: liveArtworks, artistMap, loading } = useCatalog();
  const pool = useMemo(
    () => mergeById(curatedArtworks, liveArtworks),
    [liveArtworks],
  );
  // Only "loading" if we have nothing to show yet — the curated set alone is
  // enough to start, so we never block on the network.
  return { pool, artists: artistMap, loading: loading && pool.length === 0 };
}
