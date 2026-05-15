import { openDB } from "./cache.ts";
import type { CollectionEntry, WishlistEntry } from "./types.ts";

const STORE_COLLECTION = "collection";
const STORE_WISHLIST   = "wishlist";
const STORE_LOCATIONS  = "locations";

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise(async (resolve, reject) => {
    try {
      const db    = await openDB();
      const t     = db.transaction(storeName, mode);
      const store = t.objectStore(storeName);
      const req   = op(store);
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
      t.oncomplete  = () => db.close();
    } catch (err) {
      reject(err);
    }
  });
}

// ── Collection ─────────────────────────────────────────────────────────────────

export function getAllCollectionEntries(): Promise<CollectionEntry[]> {
  return tx<CollectionEntry[]>(STORE_COLLECTION, "readonly", (s) => s.getAll());
}

export function getCollectionByCardCode(cardCode: string): Promise<CollectionEntry[]> {
  return tx<CollectionEntry[]>(STORE_COLLECTION, "readonly", (s) =>
    s.index("cardCode").getAll(cardCode),
  );
}

export function updateCollectionEntry(entry: CollectionEntry): Promise<IDBValidKey> {
  return tx<IDBValidKey>(STORE_COLLECTION, "readwrite", (s) => s.put(entry));
}

export function removeCollectionEntry(id: number): Promise<undefined> {
  return tx<undefined>(STORE_COLLECTION, "readwrite", (s) => s.delete(id));
}

/** Add qty to existing cardCode+location entry, or create a new one. */
export function mergeOrAdd(cardCode: string, location: string, qty: number): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const db    = await openDB();
      const t     = db.transaction(STORE_COLLECTION, "readwrite");
      const store = t.objectStore(STORE_COLLECTION);
      const req   = store.index("cardCode").getAll(cardCode) as IDBRequest<CollectionEntry[]>;

      req.onsuccess = () => {
        const existing = req.result.find((e) => e.location === location);
        if (existing) {
          store.put({ ...existing, quantity: existing.quantity + qty });
        } else {
          store.add({ cardCode, location, quantity: qty });
        }
      };
      req.onerror  = () => reject(req.error);
      t.oncomplete = () => { db.close(); resolve(); };
      t.onerror    = () => reject(t.error);
    } catch (err) {
      reject(err);
    }
  });
}

/** Move qty copies from entry to toLocation. If qty >= entry.quantity, moves everything. */
export async function movePartial(entry: CollectionEntry, toLocation: string, qty: number): Promise<void> {
  const clampedQty = Math.min(qty, entry.quantity);
  if (clampedQty >= entry.quantity) {
    // Always merge into destination first, then remove source —
    // a simple location rename would create a duplicate if destination already has an entry.
    await mergeOrAdd(entry.cardCode, toLocation, entry.quantity);
    await removeCollectionEntry(entry.id!);
  } else {
    await updateCollectionEntry({ ...entry, quantity: entry.quantity - clampedQty });
    await mergeOrAdd(entry.cardCode, toLocation, clampedQty);
  }
}

/** Merges entries that share the same cardCode+location. Returns number of groups merged. */
export async function deduplicateCollection(): Promise<number> {
  const entries = await getAllCollectionEntries();
  const groups = new Map<string, CollectionEntry[]>();

  for (const e of entries) {
    const key = `${e.cardCode}\0${e.location}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  let mergedCount = 0;
  for (const group of groups.values()) {
    if (group.length <= 1) continue;
    group.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    const [keep, ...dupes] = group;
    const totalQty = group.reduce((sum, e) => sum + e.quantity, 0);
    await updateCollectionEntry({ ...keep, quantity: totalQty });
    for (const e of dupes) await removeCollectionEntry(e.id!);
    mergedCount++;
  }

  return mergedCount;
}

/** Returns Map<cardCode, totalQty> across all entries — used for Browse row badges. */
export async function getCollectionQtyMap(): Promise<Map<string, number>> {
  const entries = await getAllCollectionEntries();
  const map = new Map<string, number>();
  for (const e of entries) {
    map.set(e.cardCode, (map.get(e.cardCode) ?? 0) + e.quantity);
  }
  return map;
}

/** Returns all location names from the locations store, sorted A–Z. */
export async function getAllLocations(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t    = db.transaction(STORE_LOCATIONS, "readonly");
    const req  = t.objectStore(STORE_LOCATIONS).getAll() as IDBRequest<{ name: string }[]>;
    req.onsuccess = () => resolve(req.result.map((r) => r.name).sort());
    req.onerror   = () => reject(req.error);
    t.oncomplete  = () => db.close();
  });
}

export async function addLocation(name: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t   = db.transaction(STORE_LOCATIONS, "readwrite");
    const req = t.objectStore(STORE_LOCATIONS).put({ name });
    req.onerror   = () => reject(req.error);
    t.oncomplete  = () => { db.close(); resolve(); };
  });
}

// ── Wishlist ───────────────────────────────────────────────────────────────────

export function getAllWishlistEntries(): Promise<WishlistEntry[]> {
  return tx<WishlistEntry[]>(STORE_WISHLIST, "readonly", (s) => s.getAll());
}

export async function isInWishlist(cardCode: string): Promise<boolean> {
  const r = await tx<WishlistEntry | undefined>(STORE_WISHLIST, "readonly", (s) => s.get(cardCode));
  return r !== undefined;
}

export function addToWishlist(cardCode: string): Promise<IDBValidKey> {
  return tx<IDBValidKey>(STORE_WISHLIST, "readwrite", (s) => s.put({ cardCode }));
}

export function removeFromWishlist(cardCode: string): Promise<undefined> {
  return tx<undefined>(STORE_WISHLIST, "readwrite", (s) => s.delete(cardCode));
}
