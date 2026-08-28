/**
 * IndexedDB cache for the full searchable catalog metadata.
 * Return visits can search the whole archive immediately while Supabase
 * refreshes in the background.
 */
import type { RemoteCatalog } from "./catalog";
import { sanitizeRemoteCatalog } from "./catalogValidate";

const DB_NAME = "narsil-catalog-meta";
const DB_VERSION = 1;
const STORE = "catalog";
/** v2 — prior entries skipped row-level validation. */
const KEY = "v2";

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
        resolve(sanitizeRemoteCatalog(req.result));
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
  const clean = sanitizeRemoteCatalog(data);
  if (!clean) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put(clean, KEY);
    });
    db.close();
  } catch {
    /* quota / private mode — search still works from network */
  }
}
