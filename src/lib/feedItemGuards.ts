import { historyEras, type FeedItem } from "@/data";
import type { FypArtistCard } from "@/data";

/** Skip feed rows that would crash render if their backing data is missing. */
export function isRenderableFeedItem(
  item: FeedItem,
  ctx: {
    getArtist: (id: string) => { id: string } | undefined;
    getFypArtistCard: (artistId: string) => FypArtistCard | undefined;
  },
): boolean {
  if (item.kind === "artwork") {
    return Boolean(item.artwork?.id && ctx.getArtist(item.artwork.artistId));
  }
  if (item.kind === "artist-story") {
    return Boolean(ctx.getFypArtistCard(item.artistId));
  }
  if (item.kind === "era-story") {
    return historyEras.some((era) => era.id === item.eraId);
  }
  return false;
}
