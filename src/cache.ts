/**
 * cache.ts — IndexedDB wrapper for caching cards.json locally.
 *
 * Schema:
 *   - DB: "vg_collection"
 *   - Store 1: "cards" — stores card array as single record with key "all"
 *   - Store 2: "meta"  — stores metadata (last fetch time, sha, etc.)
 */

import type { Card } from "./types.ts";

const DB_NAME    = "vg_collection";
const DB_VERSION = 3;
const STORE_CARDS      = "cards";
const STORE_META       = "meta";
const STORE_COLLECTION = "collection";
const STORE_WISHLIST   = "wishlist";
const STORE_LOCATIONS  = "locations";

const CARDS_KEY = "all";   // single key holds entire array
const META_KEY  = "info";

export interface CacheMeta {
  lastFetchAt:   number;     // Unix ms
  lastCommitSha: string | null;  // GitHub commit SHA of cards.json
  cardCount:     number;
  sizeBytes:     number;
}

// ── Open database ─────────────────────────────────────────────────────────────

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_CARDS)) {
        db.createObjectStore(STORE_CARDS);
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META);
      }
      if (!db.objectStoreNames.contains(STORE_COLLECTION)) {
        const col = db.createObjectStore(STORE_COLLECTION, { keyPath: "id", autoIncrement: true });
        col.createIndex("cardCode", "cardCode", { unique: false });
        col.createIndex("location", "location", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_WISHLIST)) {
        db.createObjectStore(STORE_WISHLIST, { keyPath: "cardCode" });
      }
      if (!db.objectStoreNames.contains(STORE_LOCATIONS)) {
        const locStore = db.createObjectStore(STORE_LOCATIONS, { keyPath: "name" });
        locStore.add({ name: "my collection" });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// ── Generic IDB operation wrapper ─────────────────────────────────────────────

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    try {
      const db   = await openDB();
      const t    = db.transaction(storeName, mode);
      const store = t.objectStore(storeName);
      const req  = op(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
      t.oncomplete  = () => db.close();
    } catch (err) {
      reject(err);
    }
  });
}

// ── Public API: Cards ─────────────────────────────────────────────────────────

export async function saveCards(cards: Card[]): Promise<void> {
  await tx(STORE_CARDS, "readwrite", (store) => store.put(cards, CARDS_KEY));
}

export async function loadCards(): Promise<Card[] | null> {
  const result = await tx<Card[]>(STORE_CARDS, "readonly", (store) => store.get(CARDS_KEY));
  return result ?? null;
}

export async function clearCards(): Promise<void> {
  await tx(STORE_CARDS, "readwrite", (store) => store.clear());
}

// ── Public API: Meta ──────────────────────────────────────────────────────────

export async function saveMeta(meta: CacheMeta): Promise<void> {
  await tx(STORE_META, "readwrite", (store) => store.put(meta, META_KEY));
}

export async function loadMeta(): Promise<CacheMeta | null> {
  const result = await tx<CacheMeta>(STORE_META, "readonly", (store) => store.get(META_KEY));
  return result ?? null;
}

export async function clearMeta(): Promise<void> {
  await tx(STORE_META, "readwrite", (store) => store.clear());
}

// ── Utility: check cache freshness ────────────────────────────────────────────

export const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000; // 7 hari

export function isCacheStale(meta: CacheMeta): boolean {
  return Date.now() - meta.lastFetchAt > STALE_THRESHOLD_MS;
}

export function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours   = Math.floor(diff / 3600000);
  const days    = Math.floor(diff / 86400000);

  if (days > 0)    return `${days} hari lalu`;
  if (hours > 0)   return `${hours} jam lalu`;
  if (minutes > 0) return `${minutes} menit lalu`;
  return "baru saja";
}
