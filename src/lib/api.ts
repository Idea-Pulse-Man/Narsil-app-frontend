/**
 * Base URL of the Narsil backend (narsil-museum-backend).
 * ---------------------------------------------------------------------------
 * Comes from the `VITE_API_URL` env var so it can point at localhost in dev
 * and the CloudFront origin in production. Falls back to the local backend's
 * default port. The catalog itself is read from Supabase (lib/catalog.ts);
 * the backend serves downloads, prices, checkout and subscriptions.
 */

const API_URL =
  (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ??
  "http://localhost:4000";

export { API_URL };
