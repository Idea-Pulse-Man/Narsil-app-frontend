/**
 * The quiz's artwork pool.
 *
 * Mirrors DiscoverView: merge the curated mock set with the live museum catalog
 * so the quiz has material instantly (and offline), then grows as the backend
 * data arrives. De-dupes by id, keeping the curated entry first.
 */

import { useMemo } from "react";
import { artworks as curatedArtworks, type Artwork } from "@/data";
import { useCatalog } from "@/data/catalog";

function mergeById(base: Artwork[], extra: Artwork[]): Artwork[] {
  const seen = new Set(base.map((a) => a.id));
  const out = [...base];
  for (const art of extra) {
    if (seen.has(art.id)) continue;
    seen.add(art.id);
    out.push(art);
  }
  return out;
}

export function useQuizPool(): { pool: Artwork[]; loading: boolean } {
  const { artworks: liveArtworks, loading } = useCatalog();
  const pool = useMemo(
    () => mergeById(curatedArtworks, liveArtworks),
    [liveArtworks],
  );
  // Only "loading" if we have nothing to show yet — the curated set alone is
  // enough to start, so we never block on the network.
  return { pool, loading: loading && pool.length === 0 };
}
