import type { Artwork } from "./types";

/** Mixed For You feed: artworks plus intermittent artist / era story slides. */
export type FeedItem =
  | { kind: "artwork"; artwork: Artwork }
  | { kind: "artist-story"; artistId: string; backdropArtworkId: string }
  | { kind: "era-story"; eraId: string; backdropArtworkId: string };

export function feedItemKey(item: FeedItem): string {
  if (item.kind === "artwork") return item.artwork.id;
  return item.kind === "artist-story"
    ? `artist-story-${item.artistId}`
    : `era-story-${item.eraId}`;
}

export function artworkFromFeedItem(item: FeedItem): Artwork | undefined {
  return item.kind === "artwork" ? item.artwork : undefined;
}

/** Stable id used when freezing / merging feed order across catalog refreshes. */
export function feedItemStableId(item: FeedItem): string {
  return feedItemKey(item);
}
