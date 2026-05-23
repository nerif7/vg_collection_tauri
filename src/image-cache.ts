import { invoke } from "@tauri-apps/api/core";
import { getUserdataDir } from "./cache.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

const memCache         = new Map<string, string>(); // cardNo → data URL
const pendingDownloads = new Set<string>();          // cardNos currently being fetched

let _imagesDir: string | null = null;

async function getImagesDir(): Promise<string> {
  if (!_imagesDir) {
    const base = await getUserdataDir();
    _imagesDir = `${base}/images`;
  }
  return _imagesDir;
}

// CardNos like "V-BT01/001EN" contain "/" — sanitize for use as a filename.
function fileKey(cardNo: string): string {
  return cardNo.replace(/\//g, "_").replace(/[<>:"\\|?*]/g, "_");
}

function mimeFor(url: string): string {
  if (url.includes(".png"))  return "image/png";
  if (url.includes(".gif"))  return "image/gif";
  if (url.includes(".webp")) return "image/webp";
  return "image/jpeg";
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const CHUNK = 8192;
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// ── Core API ──────────────────────────────────────────────────────────────────

/**
 * Returns the best src for a card image:
 * - Data URL if the image is already cached locally (mem or disk).
 * - CDN URL otherwise — and triggers a background download so the next call
 *   returns the cached version.
 */
export async function getImageSrc(cardNo: string, cdnUrl: string | null): Promise<string | null> {
  if (!cdnUrl) return null;

  // Fast path: in-memory hit.
  const mem = memCache.get(cardNo);
  if (mem) return mem;

  const dir  = await getImagesDir();
  const path = `${dir}/${fileKey(cardNo)}`;

  // Disk hit.
  const b64 = await invoke<string | null>("read_text_file", { path });
  if (b64) {
    const dataUrl = `data:${mimeFor(cdnUrl)};base64,${b64}`;
    memCache.set(cardNo, dataUrl);
    return dataUrl;
  }

  // Not cached — serve CDN URL now, download in background.
  _downloadBackground(cardNo, cdnUrl, path);
  return cdnUrl;
}

function _downloadBackground(cardNo: string, cdnUrl: string, path: string): void {
  if (memCache.has(cardNo) || pendingDownloads.has(cardNo)) return;
  pendingDownloads.add(cardNo);
  (async () => {
    const res = await fetch(cdnUrl);
    if (!res.ok) return;
    const b64 = arrayBufferToBase64(await res.arrayBuffer());
    await invoke("write_text_file", { path, content: b64 });
    memCache.set(cardNo, `data:${mimeFor(cdnUrl)};base64,${b64}`);
  })().catch(() => {}).finally(() => pendingDownloads.delete(cardNo));
}

// ── Cache management ──────────────────────────────────────────────────────────

/** Delete all locally cached images. Returns number of files deleted. */
export async function clearAllImageCache(): Promise<number> {
  const dir   = await getImagesDir();
  const files = await invoke<string[]>("list_dir_files", { path: dir });
  await Promise.all(files.map((f) => invoke("delete_file", { path: `${dir}/${f}` })));
  memCache.clear();
  return files.length;
}

/**
 * Delete cached images for cards no longer in the collection.
 * Pass the full set of cardNos currently in the collection (all regions).
 * Returns number of files deleted.
 */
export async function clearOrphanedImageCache(collectionCardNos: Set<string>): Promise<number> {
  const dir      = await getImagesDir();
  const files    = await invoke<string[]>("list_dir_files", { path: dir });
  const activeKeys = new Set([...collectionCardNos].map(fileKey));
  const orphans  = files.filter((f) => !activeKeys.has(f));
  await Promise.all(orphans.map((f) => invoke("delete_file", { path: `${dir}/${f}` })));
  // Clear mem cache entries for deleted files (reverse-map fileKey back to cardNo is hard,
  // so clear the whole mem cache — it will be rebuilt lazily on next preview open).
  if (orphans.length > 0) memCache.clear();
  return orphans.length;
}
