/**
 * Artist portraits.
 * ---------------------------------------------------------------------------
 * Portraits are now resolved once a day by the EC2 ingestion job (Wikidata
 * lookup → downloaded → stored in S3) and saved to `artists.avatar_url` in
 * Supabase. The app reads them via `getArtistAvatar` → `ArtistAvatar`'s `src`,
 * so there is NO live backend call from the client anymore.
 *
 * These stubs keep the previous API surface (`ArtistAvatar` imports
 * `useArtistPhoto`); they simply never hit the network. An artist without a
 * stored portrait falls back to the initials monogram.
 */

/** Deprecated no-op: portraits come from Supabase (`avatar`), not the network. */
export function getArtistPhoto(_name: string): Promise<string | null> {
  return Promise.resolve(null);
}

/** Deprecated no-op hook — always returns null (see module docs). */
export function useArtistPhoto(_name?: string | null): string | null {
  return null;
}
