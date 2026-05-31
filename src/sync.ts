import { invoke } from "@tauri-apps/api/core";
import { loadSession } from "./auth.ts";
import { WORKER_URL } from "./auth.ts";
import {
  getAllCollectionEntries,
  getAllWishlistEntries,
  getAllLocations,
} from "./collection-db.ts";
import type { SyncPayload, SyncMeta, ConflictEntry, CollectionEntry } from "./types.ts";

// ── Sync metadata ─────────────────────────────────────────────────────────────

async function loadSyncMeta(): Promise<SyncMeta> {
  try {
    const dir  = await invoke<string>("get_userdata_dir");
    const text = await invoke<string | null>("read_text_file", { path: `${dir}/sync-meta.json` });
    if (!text) return { lastSyncedAt: 0 };
    return JSON.parse(text) as SyncMeta;
  } catch {
    return { lastSyncedAt: 0 };
  }
}

async function saveSyncMeta(lastSyncedAt: number): Promise<void> {
  const dir = await invoke<string>("get_userdata_dir");
  await invoke<void>("write_text_file", {
    path:    `${dir}/sync-meta.json`,
    content: JSON.stringify({ lastSyncedAt }, null, 2),
  });
}

// Baca mtime 3 file dari OS — tidak perlu tracking manual di collection-db.ts (Opsi B)
async function getLocalModifiedAt(): Promise<number> {
  const dir = await invoke<string>("get_userdata_dir");
  const [c, w, l] = await Promise.all([
    invoke<number>("get_file_mtime", { path: `${dir}/collection.json` }).catch(() => 0),
    invoke<number>("get_file_mtime", { path: `${dir}/wishlist.json`   }).catch(() => 0),
    invoke<number>("get_file_mtime", { path: `${dir}/locations.json`  }).catch(() => 0),
  ]);
  return Math.max(c, w, l);
}

// ── Remote API helpers ────────────────────────────────────────────────────────

async function fetchRemote(token: string): Promise<{ data: SyncPayload | null; serverTime: number }> {
  const res = await fetch(`${WORKER_URL}/sync`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (!res.ok) throw new Error(`GET /sync failed: ${res.status}`);
  return res.json() as Promise<{ data: SyncPayload | null; serverTime: number }>;
}

async function pushToRemote(
  token: string,
  payload: SyncPayload,
  expectedLastModifiedAt?: number
): Promise<{ serverTime: number }> {
  const body = expectedLastModifiedAt !== undefined
    ? { ...payload, expected_last_modified_at: expectedLastModifiedAt }
    : payload;

  const res = await fetch(`${WORKER_URL}/sync`, {
    method:  "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  if (res.status === 401) throw new Error("UNAUTHORIZED");
  if (res.status === 409) throw new Error("CONFLICT_RETRY");
  if (!res.ok) throw new Error(`PUT /sync failed: ${res.status}`);
  return res.json() as Promise<{ serverTime: number }>;
}

// ── Local data helpers ────────────────────────────────────────────────────────

async function buildLocalPayload(): Promise<SyncPayload> {
  const [collection, wishlist, locations] = await Promise.all([
    getAllCollectionEntries(),
    getAllWishlistEntries(),
    getAllLocations(),
  ]);
  return {
    collection,
    wishlist,
    locations,
    last_modified_at: Date.now(),
    schema_version:   1,
  };
}

async function applyRemotePayload(remote: SyncPayload, serverTime: number): Promise<void> {
  const dir = await invoke<string>("get_userdata_dir");
  await Promise.all([
    invoke("write_text_file", { path: `${dir}/collection.json`, content: JSON.stringify(remote.collection, null, 2) }),
    invoke("write_text_file", { path: `${dir}/wishlist.json`,   content: JSON.stringify(remote.wishlist,   null, 2) }),
    invoke("write_text_file", { path: `${dir}/locations.json`,  content: JSON.stringify(remote.locations,  null, 2) }),
  ]);
  // Gap 6 fix: pakai server timestamp +1 agar lastSyncedAt selalu > mtime file yang baru ditulis
  await saveSyncMeta(serverTime + 1);
}

// ── Conflict detection ────────────────────────────────────────────────────────

function makeKey(e: CollectionEntry): string {
  return `${e.cardCode}|${e.location}|${e.region}`;
}

export function detectConflicts(
  local:  CollectionEntry[],
  remote: CollectionEntry[]
): ConflictEntry[] {
  const localMap  = new Map(local.map((e)  => [makeKey(e), e]));
  const remoteMap = new Map(remote.map((e) => [makeKey(e), e]));
  const conflicts: ConflictEntry[] = [];

  for (const [key, localEntry] of localMap) {
    const remoteEntry = remoteMap.get(key);
    if (remoteEntry && remoteEntry.quantity !== localEntry.quantity) {
      conflicts.push({
        cardCode: localEntry.cardCode,
        region:   localEntry.region,
        local:    localEntry,
        remote:   remoteEntry,
      });
    }
  }
  return conflicts;
}

// ── Concurrent sync guard (Gap 18) ───────────────────────────────────────────

let _syncInProgress = false;
let _pendingSync    = false;
let _authInProgress = false;

// Call this before/after signInWithGoogle so startup sync doesn't race with auth
export function setAuthInProgress(val: boolean): void { _authInProgress = val; }

export type SyncOutcome =
  | { status: "not_logged_in" }
  | { status: "up_to_date" }
  | { status: "pushed" }
  | { status: "pulled" }
  | { status: "first_login"; localCount: number; remoteCount: number }
  | { status: "conflict"; conflicts: ConflictEntry[]; remote: SyncPayload }
  | { status: "unauthorized" }
  | { status: "error"; message: string };

export async function runSync(): Promise<SyncOutcome> {
  if (_authInProgress) return { status: "not_logged_in" };
  if (_syncInProgress) { _pendingSync = true; return { status: "up_to_date" }; }
  _syncInProgress = true;
  try {
    return await _performSync();
  } finally {
    _syncInProgress = false;
    if (_pendingSync) { _pendingSync = false; void runSync(); }
  }
}

async function _performSync(): Promise<SyncOutcome> {
  const session = await loadSession();
  if (!session) return { status: "not_logged_in" };

  try {
    const [meta, localModifiedAt, { data: remote, serverTime }] = await Promise.all([
      loadSyncMeta(),
      getLocalModifiedAt(),
      fetchRemote(session.token),
    ]);

    // Gap 1: first login — lastSyncedAt=0 dan ada data di keduanya
    if (meta.lastSyncedAt === 0 && remote !== null) {
      const localCollection = await getAllCollectionEntries();
      return {
        status:       "first_login",
        localCount:   localCollection.length,
        remoteCount:  (remote.collection as CollectionEntry[]).length,
      };
    }

    // First sync dari device ini (belum ada data di cloud)
    if (remote === null) {
      const local = await buildLocalPayload();
      const { serverTime: st } = await pushToRemote(session.token, local);
      await saveSyncMeta(st);
      return { status: "pushed" };
    }

    const localDirty  = localModifiedAt > meta.lastSyncedAt;
    const remoteDirty = remote.last_modified_at > meta.lastSyncedAt;

    if (!localDirty && !remoteDirty) return { status: "up_to_date" };

    if (localDirty && !remoteDirty) {
      const local = await buildLocalPayload();
      // Optimistic locking: kirim expected remote mtime (Gap 5)
      try {
        const { serverTime: st } = await pushToRemote(session.token, local, remote.last_modified_at);
        await saveSyncMeta(st);
      } catch (err) {
        if (err instanceof Error && err.message === "CONFLICT_RETRY") {
          // Remote berubah sejak kita fetch — jalankan ulang
          return await _performSync();
        }
        throw err;
      }
      return { status: "pushed" };
    }

    if (!localDirty && remoteDirty) {
      await applyRemotePayload(remote, serverTime);
      return { status: "pulled" };
    }

    // Keduanya dirty — cek conflict per-entry
    const localCollection = await getAllCollectionEntries();
    const conflicts = detectConflicts(localCollection, remote.collection as CollectionEntry[]);

    if (conflicts.length === 0) {
      // Tidak ada conflict murni — push local
      const local = await buildLocalPayload();
      try {
        const { serverTime: st } = await pushToRemote(session.token, local, remote.last_modified_at);
        await saveSyncMeta(st);
      } catch (err) {
        if (err instanceof Error && err.message === "CONFLICT_RETRY") {
          return await _performSync();
        }
        throw err;
      }
      return { status: "pushed" };
    }

    // Gap 14: auto-snapshot sebelum conflict dialog
    await _savePreConflictBackup();
    return { status: "conflict", conflicts, remote };

  } catch (err) {
    if (err instanceof Error && err.message === "UNAUTHORIZED") {
      return { status: "unauthorized" };
    }
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

// Gap 14: simpan snapshot sebelum user melihat conflict dialog
async function _savePreConflictBackup(): Promise<void> {
  try {
    const [collection, wishlist, locations] = await Promise.all([
      getAllCollectionEntries(),
      getAllWishlistEntries(),
      getAllLocations(),
    ]);
    const dir = await invoke<string>("get_userdata_dir");
    const filename = `pre-conflict-${Date.now()}.json`;
    await invoke("write_text_file", {
      path:    `${dir}/backups/${filename}`,
      content: JSON.stringify({ collection, wishlist, locations }, null, 2),
    });
  } catch { /* backup gagal tidak boleh block sync */ }
}

// Dipanggil setelah user resolve conflict
export async function resolveAndSync(
  token: string,
  resolvedCollection: CollectionEntry[],
  remote: SyncPayload
): Promise<void> {
  const [wishlist, locations] = await Promise.all([getAllWishlistEntries(), getAllLocations()]);
  const dir = await invoke<string>("get_userdata_dir");

  await invoke("write_text_file", {
    path:    `${dir}/collection.json`,
    content: JSON.stringify(resolvedCollection, null, 2),
  });

  const payload: SyncPayload = {
    collection:       resolvedCollection,
    wishlist,
    locations,
    last_modified_at: Date.now(),
    schema_version:   1,
  };

  const { serverTime } = await pushToRemote(token, payload, remote.last_modified_at);
  await saveSyncMeta(serverTime);
}

// ── Debounce push (Gap 11: maxWait 60s) ──────────────────────────────────────

let _debounceTimer: ReturnType<typeof setTimeout> | null = null;
let _maxWaitTimer:  ReturnType<typeof setTimeout> | null = null;

export function scheduleDebounce(): void {
  if (_debounceTimer) clearTimeout(_debounceTimer);
  _debounceTimer = setTimeout(() => { _debounceTimer = null; void _doPush(); }, 5_000);

  if (!_maxWaitTimer) {
    _maxWaitTimer = setTimeout(() => {
      _maxWaitTimer = null;
      if (_debounceTimer) { clearTimeout(_debounceTimer); _debounceTimer = null; }
      void _doPush();
    }, 60_000);
  }
}

async function _doPush(): Promise<void> {
  if (_maxWaitTimer) { clearTimeout(_maxWaitTimer); _maxWaitTimer = null; }

  const session = await loadSession();
  if (!session) return;

  const [meta, localModifiedAt] = await Promise.all([loadSyncMeta(), getLocalModifiedAt()]);
  if (localModifiedAt <= meta.lastSyncedAt) return;

  try {
    const local = await buildLocalPayload();
    const { serverTime } = await pushToRemote(session.token, local);
    await saveSyncMeta(serverTime);
  } catch {
    // Offline atau error → biarkan, mtime tetap > lastSyncedAt
    // Saat app dibuka berikutnya, runSync() akan deteksi dan push
  }
}
