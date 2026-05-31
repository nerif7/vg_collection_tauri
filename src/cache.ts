import { invoke } from "@tauri-apps/api/core";
import type { Card, FetchResult, RawEnCard, RawJpCard, VersionInfo } from "./types.ts";
import { showToast } from "./toast.ts";

const DB_URL_EN     = "https://raw.githubusercontent.com/nerif7/vanguard-library-db/main/cards.json";
const DB_URL_JP     = "https://raw.githubusercontent.com/nerif7/vanguard-library-db/main/cards_jp.json";
const VERSION_URL   = "https://raw.githubusercontent.com/nerif7/vanguard-library-db/main/version.json";
const COMMIT_API_EN = "https://api.github.com/repos/nerif7/vanguard-library-db/commits?path=cards.json&per_page=1";
const COMMIT_API_JP = "https://api.github.com/repos/nerif7/vanguard-library-db/commits?path=cards_jp.json&per_page=1";

export interface CacheMeta {
  lastFetchAt:   number;
  lastCommitSha: string | null;
  cardCount:     number;
  sizeBytes:     number;
}

// ── Userdata dir ──────────────────────────────────────────────────────────────

let _userdataDir: string | null = null;

export async function getUserdataDir(): Promise<string> {
  if (!_userdataDir) {
    _userdataDir = await invoke<string>("get_userdata_dir");
  }
  return _userdataDir;
}

// ── Low-level file helpers ────────────────────────────────────────────────────

async function readFile(path: string): Promise<string | null> {
  return invoke<string | null>("read_text_file", { path });
}

async function writeFile(path: string, content: string): Promise<void> {
  await invoke<void>("write_text_file", { path, content });
}

// ── Private cache file helpers (shared by EN and JP) ─────────────────────────

async function readCacheFile(filename: string): Promise<string | null> {
  try {
    const dir = await getUserdataDir();
    return await readFile(`${dir}/cache/${filename}`);
  } catch {
    return null;
  }
}

async function writeCacheFile(filename: string, content: string): Promise<void> {
  const dir = await getUserdataDir();
  const path = `${dir}/cache/${filename}`;
  try {
    await writeFile(path, content);
  } catch (err) {
    throw new Error(`Write failed: ${path} — ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Normalize transforms ──────────────────────────────────────────────────────

export function normalizeEn(raw: RawEnCard): Card {
  return { ...raw, cardNo: raw.enCardNo, displayName: raw.name, imageUrl: raw.imageUrlEn, region: "EN" };
}

export function normalizeJp(raw: RawJpCard): Card {
  return { ...raw, cardNo: raw.jpCardNo, displayName: raw.nameJp, imageUrl: raw.imageUrlJp, region: "JP" };
}

// ── EN: Cards ─────────────────────────────────────────────────────────────────

export async function loadCards(): Promise<Card[] | null> {
  const content = await readCacheFile("cards.json");
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as RawEnCard[];
    const cards = parsed.map(normalizeEn);
    return cards.length > 0 ? cards : null;
  } catch {
    showToast("⚠️ Card cache is corrupted — fetching from GitHub.", "error");
    return null;
  }
}

export async function saveCards(cards: Card[]): Promise<void> {
  await writeCacheFile("cards.json", JSON.stringify(cards));
}

export async function clearCards(): Promise<void> {
  await writeCacheFile("cards.json", "[]");
}

// ── EN: Meta ──────────────────────────────────────────────────────────────────

export async function loadMeta(): Promise<CacheMeta | null> {
  const content = await readCacheFile("cards-meta.json");
  if (!content) return null;
  try {
    return (JSON.parse(content) as CacheMeta | null) ?? null;
  } catch {
    return null;
  }
}

export async function saveMeta(meta: CacheMeta): Promise<void> {
  await writeCacheFile("cards-meta.json", JSON.stringify(meta));
}

export async function clearMeta(): Promise<void> {
  await writeCacheFile("cards-meta.json", "null");
}

// ── JP: Cards ─────────────────────────────────────────────────────────────────

export async function loadCardsJp(): Promise<Card[] | null> {
  const content = await readCacheFile("cards_jp.json");
  if (!content) return null;
  try {
    const parsed = JSON.parse(content) as RawJpCard[];
    const cards = parsed.map(normalizeJp);
    return cards.length > 0 ? cards : null;
  } catch {
    showToast("⚠️ JP card cache is corrupted — fetching from GitHub.", "error");
    return null;
  }
}

export async function saveCardsJp(cards: Card[]): Promise<void> {
  await writeCacheFile("cards_jp.json", JSON.stringify(cards));
}

export async function clearCardsJp(): Promise<void> {
  await writeCacheFile("cards_jp.json", "[]");
}

// ── JP: Meta ──────────────────────────────────────────────────────────────────

export async function loadMetaJp(): Promise<CacheMeta | null> {
  const content = await readCacheFile("cards_jp-meta.json");
  if (!content) return null;
  try {
    return (JSON.parse(content) as CacheMeta | null) ?? null;
  } catch {
    return null;
  }
}

export async function saveMetaJp(meta: CacheMeta): Promise<void> {
  await writeCacheFile("cards_jp-meta.json", JSON.stringify(meta));
}

export async function clearMetaJp(): Promise<void> {
  await writeCacheFile("cards_jp-meta.json", "null");
}

// ── GitHub fetch ──────────────────────────────────────────────────────────────

export async function fetchVersionInfo(): Promise<VersionInfo | null> {
  try {
    const res = await fetch(VERSION_URL, { cache: "no-cache" });
    if (!res.ok) return null;
    return await res.json() as VersionInfo;
  } catch { return null; }
}

export async function fetchFromGitHub(): Promise<FetchResult> {
  const fetchStart = performance.now();
  const response = await fetch(DB_URL_EN, { cache: "no-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  const text = await response.text();
  const fetchEnd = performance.now();
  const totalBytes = new Blob([text]).size;
  const parseStart = performance.now();
  const cards = (JSON.parse(text) as RawEnCard[]).map(normalizeEn);
  const parseEnd = performance.now();
  return { cards, totalBytes, fetchTimeMs: fetchEnd - fetchStart, parseTimeMs: parseEnd - parseStart };
}

export async function fetchFromGitHubJp(): Promise<FetchResult> {
  const fetchStart = performance.now();
  const response = await fetch(DB_URL_JP, { cache: "no-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  const text = await response.text();
  const fetchEnd = performance.now();
  const totalBytes = new Blob([text]).size;
  const parseStart = performance.now();
  const cards = (JSON.parse(text) as RawJpCard[]).map(normalizeJp);
  const parseEnd = performance.now();
  return { cards, totalBytes, fetchTimeMs: fetchEnd - fetchStart, parseTimeMs: parseEnd - parseStart };
}

export async function fetchLatestCommitSha(): Promise<string | null> {
  try {
    const res = await fetch(COMMIT_API_EN, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data[0]?.sha ? data[0].sha : null;
  } catch { return null; }
}

export async function fetchLatestCommitShaJp(): Promise<string | null> {
  try {
    const res = await fetch(COMMIT_API_JP, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data[0]?.sha ? data[0].sha : null;
  } catch { return null; }
}

// ── Convenience: load from cache ──────────────────────────────────────────────

export async function loadFromCache(): Promise<{ cards: Card[]; meta: CacheMeta } | null> {
  const [cachedCards, meta] = await Promise.all([loadCards(), loadMeta()]);
  if (!cachedCards || cachedCards.length === 0 || !meta) return null;
  return { cards: cachedCards, meta };
}

export async function loadFromCacheJp(): Promise<{ cards: Card[]; meta: CacheMeta } | null> {
  const [cachedCards, meta] = await Promise.all([loadCardsJp(), loadMetaJp()]);
  if (!cachedCards || cachedCards.length === 0 || !meta) return null;
  return { cards: cachedCards, meta };
}

// ── Utility ───────────────────────────────────────────────────────────────────

export const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

export function isCacheStale(meta: CacheMeta): boolean {
  return Date.now() - meta.lastFetchAt > STALE_THRESHOLD_MS;
}

export function formatRelativeTime(timestamp: number): string {
  const diff    = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours   = Math.floor(diff / 3600000);
  const days    = Math.floor(diff / 86400000);

  if (days > 0)    return `${days} hari lalu`;
  if (hours > 0)   return `${hours} jam lalu`;
  if (minutes > 0) return `${minutes} menit lalu`;
  return "baru saja";
}
