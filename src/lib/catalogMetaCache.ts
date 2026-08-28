/**
 * IndexedDB cache for the full searchable catalog metadata.
 * Return visits can search the whole archive immediately while Supabase
 * refreshes in the background.
 */
import type { RemoteCatalog } from "./catalog";

const DB_NAME = "narsil-catalog-meta";
const DB_VERSION = 1;
const STORE = "catalog";
const KEY = "v1";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export async function readCatalogMetaCache(): Promise<RemoteCatalog | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const data = await new Promise<RemoteCatalog | null>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const store = tx.objectStore(STORE);
      const req = store.get(KEY);
      req.onsuccess = () => {
        const value = req.result as RemoteCatalog | undefined;
        if (
          !value ||
          !Array.isArray(value.artworks) ||
          !Array.isArray(value.artists) ||
          value.artworks.length === 0
        ) {
          resolve(null);
          return;
        }
        resolve({
          artworks: value.artworks,
          artists: value.artists,
          fypArtistCards: Array.isArray(value.fypArtistCards)
            ? value.fypArtistCards
            : [],
        });
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
    return data;
  } catch {
    return null;
  }
}

export async function writeCatalogMetaCache(data: RemoteCatalog): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  if (data.artworks.length === 0 || data.artists.length === 0) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(data, KEY);
    });
    db.close();
  } catch {
    /* quota / private mode — search still works from network */
  }
}
