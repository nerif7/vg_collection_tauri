import { invoke } from "@tauri-apps/api/core";
import type { Card } from "./types.ts";

export interface CacheMeta {
  lastFetchAt:   number;
  lastCommitSha: string | null;
  cardCount:     number;
  sizeBytes:     number;
}

// ── Userdata dir (cached after first call) ────────────────────────────────────

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

// ── Public API: Cards ─────────────────────────────────────────────────────────

export async function loadCards(): Promise<Card[] | null> {
  try {
    const dir = await getUserdataDir();
    const content = await readFile(`${dir}/cache/cards.json`);
    if (!content) return null;
    const parsed = JSON.parse(content) as Card[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

export async function saveCards(cards: Card[]): Promise<void> {
  const dir = await getUserdataDir();
  await writeFile(`${dir}/cache/cards.json`, JSON.stringify(cards));
}

export async function clearCards(): Promise<void> {
  const dir = await getUserdataDir();
  await writeFile(`${dir}/cache/cards.json`, "[]");
}

// ── Public API: Meta ──────────────────────────────────────────────────────────

export async function loadMeta(): Promise<CacheMeta | null> {
  try {
    const dir = await getUserdataDir();
    const content = await readFile(`${dir}/cache/cards-meta.json`);
    if (!content) return null;
    const parsed = JSON.parse(content) as CacheMeta | null;
    return parsed ?? null;
  } catch {
    return null;
  }
}

export async function saveMeta(meta: CacheMeta): Promise<void> {
  const dir = await getUserdataDir();
  await writeFile(`${dir}/cache/cards-meta.json`, JSON.stringify(meta));
}

export async function clearMeta(): Promise<void> {
  const dir = await getUserdataDir();
  await writeFile(`${dir}/cache/cards-meta.json`, "null");
}

// ── Utility ───────────────────────────────────────────────────────────────────

export const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

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
