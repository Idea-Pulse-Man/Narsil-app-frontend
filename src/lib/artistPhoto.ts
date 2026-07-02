import { useEffect, useState } from "react";

/**
 * Resolves a portrait/representative photo for an artist by name, using public
 * Wikimedia endpoints (CORS-enabled) so it works entirely from the browser.
 *
 * Why this runs in the browser (not the backend): the backend host in this
 * project cannot reach Wikimedia, but the user's browser can. Resolving here
 * keeps it working without any server dependency, and gracefully falls back to
 * initials (handled by <ArtistAvatar/>) when no photo is found or the network
 * is unavailable.
 *
 * We resolve the person's ACTUAL portrait via Wikidata rather than a Wikipedia
 * article's lead image, because for the many artists with no known likeness
 * (engravers, illustrators, ancient makers) the lead image is one of their
 * *artworks* — showing that as an "avatar" is misleading. The flow:
 *   1. Map the name to a Wikidata entity (QID) — exact article title first, then
 *      a search accepted only when its description identifies an artist.
 *   2. Read the entity: require it be a human (P31 → Q5) and use its image
 *      (P18), which is a likeness of the person. No P18 → no photo → monogram.
 * This means common-word names ("Hill", "Rivers"), same-name strangers, books,
 * and artworks all correctly resolve to nothing instead of a wrong picture.
 *
 * Results are cached in-memory (per session) and in localStorage (across
 * sessions) so we only hit the network once per artist. Misses are kept only in
 * memory, so a temporary failure retries on the next visit.
 */

const HIT_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days
const MISS_TTL = 12 * 60 * 60 * 1000; // 12 hours
const REQUEST_TIMEOUT = 6000;
/**
 * Versioned so a namespace bump discards every previously-cached entry. v3
 * switches to Wikidata portraits, so older entries (which could be an artist's
 * artwork rather than their face) must be thrown away — the purge below removes
 * every non-v3 key under the shared prefix.
 */
const STORAGE_PREFIX = "narsil:artistPhoto:v3:";
const LEGACY_STORAGE_PREFIX = "narsil:artistPhoto:";
const THUMB_SIZE = 240; // avatar-friendly, crisp on retina

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

/** Names that can never resolve to a person — skip the network entirely. */
const UNRESOLVABLE = /^(unknown artist|unknown|anonymous|unidentified|various)$/i;

/**
 * Markers of a non-individual maker (workshops, studios, attributions). These
 * have no portrait, so a lookup would only surface their artwork — skip it.
 */
const NON_PERSON =
  /\b(workshop|atelier|manufactory|studio of|school of|master of|circle of|follower of|manner of|attributed to|imitator of|anonymous|unidentified)\b/i;

/** Wikidata occupations that mark a result as an artist (for the search step). */
const looksLikePerson =
  /\b(painter|artist|sculptor|engraver|printmaker|illustrator|draughtsman|photographer|architect|designer|potter|goldsmith|ceramicist|muralist|caricaturist|etcher|draftsman)\b/i;

/** Wikimedia Commons file → direct image URL. */
const COMMONS_FILEPATH = "https://commons.wikimedia.org/wiki/Special:FilePath/";

type CacheEntry = { url: string | null; t: number };

const memory = new Map<string, string | null>();
const inFlight = new Map<string, Promise<string | null>>();

/**
 * Cap concurrent Wikipedia lookups. A dense grid (e.g. the "By artist" screen)
 * mounts ~60 avatars at once; without a limit they fire ~120 cross-origin
 * requests that overwhelm the browser's per-host connection pool, so many time
 * out and fall back to initials. Running a few at a time keeps every lookup fast
 * enough to actually resolve a portrait. Cache hits bypass the queue entirely.
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

/** Fetch JSON with a hard timeout; resolves to null on any failure. */
async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

interface WikiQueryResponse {
  query?: {
    pages?: Record<
      string,
      {
        index?: number;
        missing?: string;
        pageprops?: { wikibase_item?: string };
        terms?: { description?: string[] };
      }
    >;
  };
}

/**
 * Resolve a name to a Wikidata entity id (QID). Tries the exact article title
 * first, then a search biased toward artists — accepting a search hit only when
 * its Wikidata description identifies an artist, so same-name strangers and
 * unrelated topics ("Hill", "Rivers") don't slip through.
 */
async function resolveEntityId(name: string): Promise<string | null> {
  const titleParams = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    redirects: "1",
    titles: name,
    prop: "pageprops",
    ppprop: "wikibase_item",
  });
  const titleData = await fetchJson<WikiQueryResponse>(
    `https://en.wikipedia.org/w/api.php?${titleParams.toString()}`,
  );
  const exact = Object.values(titleData?.query?.pages ?? {}).find(
    (p) => !p.missing && p.pageprops?.wikibase_item,
  );
  if (exact?.pageprops?.wikibase_item) return exact.pageprops.wikibase_item;

  const searchParams = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    generator: "search",
    gsrsearch: `${name} artist`,
    gsrlimit: "5",
    gsrnamespace: "0",
    prop: "pageprops|pageterms",
    ppprop: "wikibase_item",
    wbptterms: "description",
  });
  const searchData = await fetchJson<WikiQueryResponse>(
    `https://en.wikipedia.org/w/api.php?${searchParams.toString()}`,
  );
  const pages = Object.values(searchData?.query?.pages ?? {}).sort(
    (a, b) => (a.index ?? 999) - (b.index ?? 999),
  );
  const person = pages.find(
    (p) =>
      p.pageprops?.wikibase_item &&
      (p.terms?.description ?? []).some((d) => looksLikePerson.test(d)),
  );
  return person?.pageprops?.wikibase_item ?? null;
}

interface WikidataEntity {
  claims?: {
    P31?: Array<{ mainsnak?: { datavalue?: { value?: { id?: string } } } }>;
    P18?: Array<{ mainsnak?: { datavalue?: { value?: string } } }>;
  };
}

/**
 * Fetch the actual portrait for a Wikidata entity: only when it is a human
 * (P31 → Q5) and has an image (P18). This is the person's likeness, NOT their
 * artwork — so artists without a known portrait correctly resolve to nothing
 * (and fall back to a monogram) instead of showing one of their works.
 */
async function portraitForEntity(qid: string): Promise<string | null> {
  const data = await fetchJson<{ entities?: Record<string, WikidataEntity> }>(
    `https://www.wikidata.org/wiki/Special:EntityData/${qid}.json`,
  );
  const entity = data?.entities?.[qid];
  if (!entity) return null;

  const isHuman = (entity.claims?.P31 ?? []).some(
    (c) => c.mainsnak?.datavalue?.value?.id === "Q5",
  );
  if (!isHuman) return null;

  const file = entity.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!file) return null;

  return `${COMMONS_FILEPATH}${encodeURIComponent(file)}?width=${THUMB_SIZE}`;
}

async function requestPhoto(name: string): Promise<string | null> {
  const qid = await resolveEntityId(name);
  if (!qid) return null;
  return portraitForEntity(qid);
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

  const promise = schedule(() => requestPhoto(key)).then((url) => {
    memory.set(key, url);
    // Only persist real hits. Misses stay in the session's memory cache (so we
    // don't hammer Wikipedia repeatedly) but aren't written to localStorage, so
    // a transient failure retries on the next visit instead of sticking around.
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
