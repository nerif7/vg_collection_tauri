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

// localMtime: snapshot of local file mtime at sync time; omit to auto-read current value.
// Stored separately from server time to avoid clock-skew false-positives on localDirty.
async function saveSyncMeta(lastSyncedAt: number, localMtime?: number): Promise<void> {
  const dir       = await invoke<string>("get_userdata_dir");
  const lastLocalAt = localMtime ?? await getLocalModifiedAt();
  await invoke<void>("write_text_file", {
    path:    `${dir}/sync-meta.json`,
    content: JSON.stringify({ lastSyncedAt, lastLocalAt }, null, 2),
  });
}

export async function clearSyncMeta(): Promise<void> {
  try {
    const dir = await invoke<string>("get_userdata_dir");
    await invoke<void>("delete_file", { path: `${dir}/sync-meta.json` });
  } catch { /* already gone */ }
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
  // Read actual mtime AFTER writing so lastLocalAt reflects the true post-pull state
  const localMtime = await getLocalModifiedAt();
  await saveSyncMeta(serverTime + 1, localMtime);
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
// Set true after explicit sign-in so first sync shows the data-choice dialog
let _justLoggedIn   = false;

// Call this before/after signInWithGoogle so startup sync doesn't race with auth
export function setAuthInProgress(val: boolean): void { _authInProgress = val; }
// Call this after successful sign-in to trigger first-login dialog on next sync
export function setJustLoggedIn(): void { _justLoggedIn = true; }
export function isAuthInProgress(): boolean { return _authInProgress; }

export type SyncOutcome =
  | { status: "not_logged_in" }
  | { status: "up_to_date" }
  | { status: "pushed" }
  | { status: "pulled" }
  | { status: "first_login"; localCount: number; remoteCount: number; localCollection: CollectionEntry[]; remote: SyncPayload; serverTime: number }
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

    // Gap 1: user baru sign-in secara eksplisit, ada data di cloud
    if (_justLoggedIn) {
      _justLoggedIn = false; // reset regardless of path below
      if (remote !== null) {
        const localCollection = await getAllCollectionEntries();
        return {
          status:          "first_login",
          localCount:      localCollection.length,
          remoteCount:     (remote.collection as CollectionEntry[]).length,
          localCollection,
          remote,
          serverTime,
        };
      }
      // Logged in but cloud empty → just push local silently
      const localFirst = await buildLocalPayload();
      const { serverTime: st } = await pushToRemote(session.token, localFirst);
      await saveSyncMeta(st, localModifiedAt);
      return { status: "pushed" };
    }

    // First sync dari device ini (belum ada data di cloud)
    if (remote === null) {
      const local = await buildLocalPayload();
      const { serverTime: st } = await pushToRemote(session.token, local);
      await saveSyncMeta(st, localModifiedAt);
      return { status: "pushed" };
    }

    // localDirty uses lastLocalAt snapshot (avoids clock-skew vs server time)
    const localDirty  = localModifiedAt > (meta.lastLocalAt ?? meta.lastSyncedAt);
    const remoteDirty = remote.last_modified_at > meta.lastSyncedAt;

    if (!localDirty && !remoteDirty) return { status: "up_to_date" };

    if (localDirty && !remoteDirty) {
      const local = await buildLocalPayload();
      // Optimistic locking: kirim expected remote mtime (Gap 5)
      try {
        const { serverTime: st } = await pushToRemote(session.token, local, remote.last_modified_at);
        await saveSyncMeta(st, localModifiedAt);
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
        await saveSyncMeta(st, localModifiedAt);
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

// ── First-login resolution (Gap 1) ───────────────────────────────────────────
// Merge helpers — local wins for duplicates, remote-only entries are added

function _mergeCollections(
  local:  CollectionEntry[],
  remote: CollectionEntry[]
): CollectionEntry[] {
  const localKeys = new Set(local.map((e) => `${e.cardCode}|${e.location}|${e.region}`));
  const result    = [...local];
  for (const e of remote) {
    if (!localKeys.has(`${e.cardCode}|${e.location}|${e.region}`)) result.push(e);
  }
  return result;
}

function _mergeWishlists(
  local:  import("./types.ts").WishlistEntry[],
  remote: import("./types.ts").WishlistEntry[]
): import("./types.ts").WishlistEntry[] {
  const localKeys = new Set(local.map((e) => `${e.cardCode}|${e.region}`));
  const result    = [...local];
  for (const e of remote) {
    if (!localKeys.has(`${e.cardCode}|${e.region}`)) result.push(e);
  }
  return result;
}

// Called from main.ts after user makes a choice in the first-login dialog
export async function resolveFirstLogin(
  choice:     "merge" | "use_cloud" | "keep_local" | "cancel",
  remote:     SyncPayload,
  token:      string,
  serverTime: number
): Promise<void> {
  const dir = await invoke<string>("get_userdata_dir");

  if (choice === "cancel") {
    await saveSyncMeta(serverTime);
    return;
  }

  if (choice === "use_cloud") {
    await applyRemotePayload(remote, serverTime); // reads mtime after write internally
    return;
  }

  if (choice === "keep_local") {
    const localMtime = await getLocalModifiedAt();
    const local = await buildLocalPayload();
    const { serverTime: st } = await pushToRemote(token, local);
    await saveSyncMeta(st, localMtime);
    return;
  }

  // "merge" — combine local + remote-only entries, push merged
  const [localCollection, localWishlist, localLocations] = await Promise.all([
    getAllCollectionEntries(),
    getAllWishlistEntries(),
    getAllLocations(),
  ]);

  const mergedCollection = _mergeCollections(
    localCollection,
    remote.collection as CollectionEntry[]
  );
  const mergedWishlist = _mergeWishlists(
    localWishlist,
    remote.wishlist as import("./types.ts").WishlistEntry[]
  );
  const mergedLocations = [
    ...new Set([...localLocations, ...(remote.locations as string[])]),
  ];

  await Promise.all([
    invoke("write_text_file", { path: `${dir}/collection.json`, content: JSON.stringify(mergedCollection, null, 2) }),
    invoke("write_text_file", { path: `${dir}/wishlist.json`,   content: JSON.stringify(mergedWishlist,   null, 2) }),
    invoke("write_text_file", { path: `${dir}/locations.json`,  content: JSON.stringify(mergedLocations,  null, 2) }),
  ]);

  const localMtime = await getLocalModifiedAt(); // read after write
  const payload: SyncPayload = {
    collection:       mergedCollection,
    wishlist:         mergedWishlist,
    locations:        mergedLocations,
    last_modified_at: Date.now(),
    schema_version:   1,
  };
  const { serverTime: st } = await pushToRemote(token, payload);
  await saveSyncMeta(st, localMtime);
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

  const localMtime = await getLocalModifiedAt();
  const { serverTime } = await pushToRemote(token, payload, remote.last_modified_at);
  await saveSyncMeta(serverTime, localMtime);
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
