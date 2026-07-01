import { useEffect, useState } from "react";

/**
 * Resolves a portrait/representative photo for an artist by name using the
 * public Wikipedia REST "summary" endpoint, which is CORS-enabled and returns a
 * thumbnail for most well-known artists.
 *
 * Why this runs in the browser (not the backend): the backend host in this
 * project cannot reach Wikimedia, but the user's browser can. Resolving here
 * keeps it working without any server dependency, and gracefully falls back to
 * initials (handled by <ArtistAvatar/>) when no photo is found or the network
 * is unavailable.
 *
 * Results are cached in-memory (per session) and in localStorage (across
 * sessions) so we only hit Wikipedia once per artist. Misses are cached too,
 * with a shorter TTL, so a temporary network failure self-heals later.
 */

const HIT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const MISS_TTL = 12 * 60 * 60 * 1000; // 12 hours
const REQUEST_TIMEOUT = 6000;
const STORAGE_PREFIX = "narsil:artistPhoto:";

type CacheEntry = { url: string | null; t: number };

const memory = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

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

async function requestPhoto(name: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const endpoint = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
      name,
    )}?redirect=true`;
    const res = await fetch(endpoint, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      type?: string;
      thumbnail?: { source?: string };
      originalimage?: { source?: string };
    };
    if (data.type === "disambiguation") return null;
    return data.thumbnail?.source ?? data.originalimage?.source ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function getArtistPhoto(name: string): Promise<string | null> {
  const key = name.trim();
  if (!key) return Promise.resolve(null);

  if (memory.has(key)) return Promise.resolve(memory.get(key) ?? null);

  const cached = readStorage(key);
  if (cached) {
    memory.set(key, cached.url);
    return Promise.resolve(cached.url);
  }

  const existing = inFlight.get(key);
  if (existing) return existing;

  const promise = requestPhoto(key).then((url) => {
    memory.set(key, url);
    writeStorage(key, url);
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
