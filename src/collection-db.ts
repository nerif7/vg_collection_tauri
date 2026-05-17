import { invoke } from "@tauri-apps/api/core";
import type { CollectionEntry, WishlistEntry } from "./types.ts";
import { getUserdataDir } from "./cache.ts";
import { showToast } from "./toast.ts";

// ── Low-level file helpers ────────────────────────────────────────────────────

async function readFile(path: string): Promise<string | null> {
  return invoke<string | null>("read_text_file", { path });
}

async function writeFile(path: string, content: string): Promise<void> {
  await invoke<void>("write_text_file", { path, content });
}

// ── Generic JSON file I/O ─────────────────────────────────────────────────────

async function loadJsonFile<T>(filename: string, label: string): Promise<T | null> {
  const dir = await getUserdataDir();
  const path = `${dir}/${filename}`;
  let content: string | null;
  try {
    content = await readFile(path);
  } catch (err) {
    showToast(`⚠️ Cannot read ${label}: ${err instanceof Error ? err.message : String(err)}`, "error");
    return null;
  }
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch {
    showToast(`⚠️ ${filename} is corrupted. To reset, delete: ${path}`, "error");
    console.error(`JSON parse error in ${filename} — file may be corrupted`);
    return null;
  }
}

async function saveJsonFile<T>(filename: string, data: T): Promise<void> {
  const dir = await getUserdataDir();
  const path = `${dir}/${filename}`;
  try {
    await writeFile(path, JSON.stringify(data, null, 2));
  } catch (err) {
    throw new Error(`Write failed: ${path} — ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Per-entity file helpers ───────────────────────────────────────────────────

async function loadCollectionFile(): Promise<CollectionEntry[]> {
  return (await loadJsonFile<CollectionEntry[]>("collection.json", "collection data")) ?? [];
}

async function saveCollectionFile(entries: CollectionEntry[]): Promise<void> {
  await saveJsonFile("collection.json", entries);
}

async function loadWishlistFile(): Promise<WishlistEntry[]> {
  return (await loadJsonFile<WishlistEntry[]>("wishlist.json", "wishlist data")) ?? [];
}

async function saveWishlistFile(entries: WishlistEntry[]): Promise<void> {
  await saveJsonFile("wishlist.json", entries);
}

async function loadLocationsFile(): Promise<string[]> {
  const result = await loadJsonFile<string[]>("locations.json", "locations data");
  if (result === null) {
    const defaults = ["my collection"];
    await saveJsonFile("locations.json", defaults);
    return defaults;
  }
  return result;
}

async function saveLocationsFile(locations: string[]): Promise<void> {
  await saveJsonFile("locations.json", locations);
}

// ── ID generation ─────────────────────────────────────────────────────────────

function nextId(entries: CollectionEntry[]): number {
  return entries.length === 0 ? 1 : Math.max(...entries.map((e) => e.id ?? 0)) + 1;
}

// ── Collection API ────────────────────────────────────────────────────────────

export function getAllCollectionEntries(): Promise<CollectionEntry[]> {
  return loadCollectionFile();
}

export async function getCollectionByCardCode(cardCode: string): Promise<CollectionEntry[]> {
  const entries = await loadCollectionFile();
  return entries.filter((e) => e.cardCode === cardCode);
}

export async function updateCollectionEntry(entry: CollectionEntry): Promise<void> {
  const entries = await loadCollectionFile();
  const idx = entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    entries[idx] = entry;
    await saveCollectionFile(entries);
  }
}

export async function removeCollectionEntry(id: number): Promise<void> {
  const entries = await loadCollectionFile();
  await saveCollectionFile(entries.filter((e) => e.id !== id));
}

/** Add qty to existing cardCode+location entry, or create a new one. */
export async function mergeOrAdd(cardCode: string, location: string, qty: number): Promise<void> {
  const entries = await loadCollectionFile();
  const existing = entries.find((e) => e.cardCode === cardCode && e.location === location);
  if (existing) {
    existing.quantity += qty;
  } else {
    entries.push({ id: nextId(entries), cardCode, location, quantity: qty });
  }
  await saveCollectionFile(entries);
}

/** Move qty copies from entry to toLocation. If qty >= entry.quantity, moves everything. */
export async function movePartial(entry: CollectionEntry, toLocation: string, qty: number): Promise<void> {
  const clampedQty = Math.min(qty, entry.quantity);
  if (clampedQty >= entry.quantity) {
    await mergeOrAdd(entry.cardCode, toLocation, entry.quantity);
    await removeCollectionEntry(entry.id!);
  } else {
    await updateCollectionEntry({ ...entry, quantity: entry.quantity - clampedQty });
    await mergeOrAdd(entry.cardCode, toLocation, clampedQty);
  }
}

/** Merges entries that share the same cardCode+location. Returns number of groups merged. */
export async function deduplicateCollection(): Promise<number> {
  const entries = await loadCollectionFile();
  const groups = new Map<string, CollectionEntry[]>();

  for (const e of entries) {
    const key = `${e.cardCode}\0${e.location}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  }

  let mergedCount = 0;
  const result: CollectionEntry[] = [];

  for (const group of groups.values()) {
    group.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
    const [keep, ...dupes] = group;
    if (dupes.length > 0) {
      const totalQty = group.reduce((sum, e) => sum + e.quantity, 0);
      result.push({ ...keep, quantity: totalQty });
      mergedCount++;
    } else {
      result.push(keep);
    }
  }

  if (mergedCount > 0) await saveCollectionFile(result);
  return mergedCount;
}

/** Returns Map<cardCode, totalQty> across all entries — used for Browse row badges. */
export async function getCollectionQtyMap(): Promise<Map<string, number>> {
  const entries = await loadCollectionFile();
  const map = new Map<string, number>();
  for (const e of entries) {
    map.set(e.cardCode, (map.get(e.cardCode) ?? 0) + e.quantity);
  }
  return map;
}

export async function clearAllCollectionEntries(): Promise<void> {
  await saveCollectionFile([]);
}

export async function clearAllWishlistEntries(): Promise<void> {
  await saveWishlistFile([]);
}

// ── Wishlist API ──────────────────────────────────────────────────────────────

export function getAllWishlistEntries(): Promise<WishlistEntry[]> {
  return loadWishlistFile();
}

export async function isInWishlist(cardCode: string): Promise<boolean> {
  const entries = await loadWishlistFile();
  return entries.some((e) => e.cardCode === cardCode);
}

export async function addToWishlist(cardCode: string): Promise<void> {
  const entries = await loadWishlistFile();
  if (!entries.some((e) => e.cardCode === cardCode)) {
    entries.push({ cardCode });
    await saveWishlistFile(entries);
  }
}

export async function removeFromWishlist(cardCode: string): Promise<void> {
  const entries = await loadWishlistFile();
  await saveWishlistFile(entries.filter((e) => e.cardCode !== cardCode));
}

// ── Locations API ─────────────────────────────────────────────────────────────

/** Returns all location names from locations.json, sorted A–Z. */
export async function getAllLocations(): Promise<string[]> {
  const locations = await loadLocationsFile();
  return [...locations].sort();
}

export async function addLocation(name: string): Promise<void> {
  const locations = await loadLocationsFile();
  if (!locations.includes(name)) {
    locations.push(name);
    await saveLocationsFile(locations);
  }
}

export async function removeLocation(name: string): Promise<void> {
  const locations = await loadLocationsFile();
  await saveLocationsFile(locations.filter((l) => l !== name));
}
