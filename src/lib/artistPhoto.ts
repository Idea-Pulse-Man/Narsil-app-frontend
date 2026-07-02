import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";
import { ngrokFetch } from "@/lib/ngrok";

/**
 * Resolves a portrait/representative photo for an artist by name via the
 * Narsil backend, which looks up Wikidata server-side. This avoids browser
 * requests to en.wikipedia.org (blocked on some networks) while still
 * returning Commons image URLs the browser can load.
 *
 * Results are cached in-memory (per session) and in localStorage (across
 * sessions) so we only hit the network once per artist. Misses are kept only in
 * memory, so a temporary failure retries on the next visit.
 */

const HIT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const MISS_TTL = 12 * 60 * 60 * 1000; // 12 hours
const REQUEST_TIMEOUT = 8000;
const STORAGE_PREFIX = "narsil:artistPhoto:v4:";
const LEGACY_STORAGE_PREFIX = "narsil:artistPhoto:";

/** Names that can never resolve to a person — skip the network entirely. */
const UNRESOLVABLE = /^(unknown artist|unknown|anonymous|unidentified|various)$/i;

/**
 * Markers of a non-individual maker (workshops, studios, attributions). These
 * have no portrait, so a lookup would only surface their artwork — skip it.
 */
const NON_PERSON =
  /\b(workshop|atelier|manufactory|studio of|school of|master of|circle of|follower of|manner of|attributed to|imitator of|anonymous|unidentified)\b/i;

type CacheEntry = { url: string | null; t: number };

const memory = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

/** One-time sweep of older cache keys so stale/wrong entries can't linger. */
function purgeLegacyCache(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (
        key &&
        key.startsWith(LEGACY_STORAGE_PREFIX) &&
        !key.startsWith(STORAGE_PREFIX)
      ) {
        stale.push(key);
      }
    }
    for (const key of stale) localStorage.removeItem(key);
  } catch {
    // localStorage unavailable — nothing to clean up.
  }
}

purgeLegacyCache();

/**
 * Cap concurrent lookups. A dense grid mounts many avatars at once; without a
 * limit they can overwhelm the connection pool. Cache hits bypass the queue.
 */
const MAX_CONCURRENT = 6;
let activeRequests = 0;
const waiting: Array<() => void> = [];

function pump(): void {
  if (activeRequests >= MAX_CONCURRENT) return;
  const job = waiting.shift();
  if (!job) return;
  activeRequests += 1;
  job();
}

function schedule<T>(task: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    waiting.push(() => {
      task()
        .then(resolve, reject)
        .finally(() => {
          activeRequests -= 1;
          pump();
        });
    });
    pump();
  });
}

function readStorage(name: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + name);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    const ttl = parsed.url ? HIT_TTL : MISS_TTL;
    if (Date.now() - parsed.t > ttl) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeStorage(name: string, url: string | null): void {
  try {
    localStorage.setItem(
      STORAGE_PREFIX + name,
      JSON.stringify({ url, t: Date.now() } satisfies CacheEntry),
    );
  } catch {
    // Storage full / unavailable — fine, memory cache still applies.
  }
}

interface ArtistPhotoResponse {
  url: string | null;
}

async function fetchPhotoFromBackend(name: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const params = new URLSearchParams({ name });
    const res = await ngrokFetch(
      `${API_URL}/api/artist-photo?${params.toString()}`,
      { signal: controller.signal },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as ArtistPhotoResponse;
    return body.url ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function getArtistPhoto(name: string): Promise<string | null> {
  const key = name.trim();
  if (!key || UNRESOLVABLE.test(key) || NON_PERSON.test(key))
    return Promise.resolve(null);

  if (memory.has(key)) return Promise.resolve(memory.get(key) ?? null);

  const cached = readStorage(key);
  if (cached) {
    memory.set(key, cached.url);
    return Promise.resolve(cached.url);
  }

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = schedule(() => fetchPhotoFromBackend(key)).then((url) => {
    memory.set(key, url);
    if (url) writeStorage(key, url);
    inFlight.delete(key);
    return url;
  });
  inFlight.set(key, promise);
  return promise;
}

/** React hook: returns the resolved photo URL, or null while loading / on miss. */
export function useArtistPhoto(name?: string | null): string | null {
  const [url, setUrl] = useState<string | null>(() =>
    name && memory.has(name.trim()) ? memory.get(name.trim()) ?? null : null,
  );

  useEffect(() => {
    const key = name?.trim();
    if (!key) {
      setUrl(null);
      return;
    }
    let active = true;
    getArtistPhoto(key).then((resolved) => {
      if (active) setUrl(resolved);
    });
    return () => {
      active = false;
    };
  }, [name]);

  return url;
}
