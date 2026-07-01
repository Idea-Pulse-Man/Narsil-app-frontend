/**
 * Tiny client for the Narsil backend (museum-backend).
 * ---------------------------------------------------------------------------
 * The base URL comes from the `VITE_API_URL` env var so it can point at
 * localhost in dev and a deployed server in production. Falls back to the
 * local backend's default port.
 */

import type { Artwork, Artist } from "@/data";
import { ngrokFetch } from "@/lib/ngrok";

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:4000";

interface ListResponse<T> {
  data: T[];
  total: number;
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await ngrokFetch(`${API_URL}${path}`, { signal });
  if (!res.ok) {
    throw new Error(`Request to ${path} failed with ${res.status}`);
  }
  return (await res.json()) as T;
}

export interface RemoteCatalog {
  artworks: Artwork[];
  artists: Artist[];
}

/** Fetch artworks + artists from the backend in parallel. */
export async function fetchRemoteCatalog(
  signal?: AbortSignal,
): Promise<RemoteCatalog> {
  const [artworksRes, artistsRes] = await Promise.all([
    getJson<ListResponse<Artwork>>("/api/artworks", signal),
    getJson<ListResponse<Artist>>("/api/artists", signal),
  ]);

  return {
    artworks: artworksRes.data,
    artists: artistsRes.data,
  };
}
