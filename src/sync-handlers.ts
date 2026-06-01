import type { Card, CollectionEntry, SyncPayload } from "./types.ts";
import type { DiffEntry, DiffSummary } from "./sync-dialog.ts";
import { loadSession } from "./auth.ts";
import { exportBackup } from "./export-import.ts";
import { resolveFirstLogin, resolveAndSync, runSync } from "./sync.ts";
import { getAllCollectionEntries } from "./collection-db.ts";
import { updateSyncTimestamp, flashSyncResult } from "./sync-menu.ts";
import { showToast } from "./toast.ts";

export interface SyncDeps {
  getAllCards:       () => Card[];
  activeRegion:     () => "EN" | "JP";
  regionPreference: () => "EN" | "JP" | "BOTH";
  reloadTabs:       () => Promise<void>;
}

function computeDiff(
  local:   CollectionEntry[],
  remote:  CollectionEntry[],
  nameMap: Map<string, string>
): DiffSummary {
  const localMap  = new Map<string, number>();
  const remoteMap = new Map<string, number>();

  for (const e of local) {
    const k = `${e.cardCode}|${e.region}`;
    localMap.set(k, (localMap.get(k) ?? 0) + e.quantity);
  }
  for (const e of remote) {
    const k = `${e.cardCode}|${e.region}`;
    remoteMap.set(k, (remoteMap.get(k) ?? 0) + (e.quantity || 1));
  }

  const onlyLocal: DiffEntry[] = [];
  const onlyCloud: DiffEntry[] = [];
  const diffQty:   DiffEntry[] = [];

  for (const [k, lQty] of localMap) {
    const cardCode    = k.split("|")[0];
    const rQty        = remoteMap.get(k) ?? 0;
    const displayName = nameMap.get(cardCode) ?? cardCode;
    if (rQty === 0)         onlyLocal.push({ cardCode, displayName, localQty: lQty, cloudQty: 0 });
    else if (lQty !== rQty) diffQty.push({ cardCode, displayName, localQty: lQty, cloudQty: rQty });
  }
  for (const [k, rQty] of remoteMap) {
    const cardCode = k.split("|")[0];
    if (!localMap.has(k))
      onlyCloud.push({ cardCode, displayName: nameMap.get(cardCode) ?? cardCode, localQty: 0, cloudQty: rQty });
  }

  return { onlyLocal, onlyCloud, diffQty };
}

export async function handleSyncResult(
  result: Awaited<ReturnType<typeof runSync>>,
  deps: SyncDeps
): Promise<void> {
  switch (result.status) {
    case "pulled":
      showToast("Collection updated from cloud ✓", "success");
      flashSyncResult("✓");
      await deps.reloadTabs();
      break;
    case "pushed":
      showToast("Synced to cloud ✓", "success");
      updateSyncTimestamp();
      flashSyncResult("✓");
      break;
    case "unauthorized":
      showToast("Sync session expired — please sign in again", "error");
      flashSyncResult("⚠");
      break;
    case "error":
      showToast("Sync failed, working offline", "error");
      flashSyncResult("⚠");
      break;
    case "first_login":
      await handleFirstLoginSync(
        result.localCount, result.remoteCount, result.localCollection,
        result.remote, result.serverTime, deps
      );
      break;
    case "conflict": {
      const session = await loadSession();
      if (!session) break;
      const { showConflictDialog } = await import("./sync-dialog.ts");
      const nameMap = new Map(deps.getAllCards().map((c) => [c.cardNo, { displayName: c.displayName }]));
      showConflictDialog(
        result.conflicts,
        nameMap,
        async (choices) => {
          try {
            const localCollection = await getAllCollectionEntries();
            const resolved = [...localCollection];
            for (const conflict of result.conflicts) {
              const key    = `${conflict.cardCode}|${conflict.region}`;
              const choice = choices.get(key) ?? "local";
              if (choice === "remote" && conflict.remote) {
                const idx = resolved.findIndex(
                  (e) => e.cardCode === conflict.cardCode &&
                         e.location === conflict.remote!.location &&
                         e.region   === conflict.region
                );
                if (idx !== -1) resolved[idx] = { ...resolved[idx], quantity: conflict.remote.quantity };
              }
            }
            await resolveAndSync(session.token, resolved, result.remote);
            showToast("Conflicts resolved ✓", "success");
            flashSyncResult("✓");
            await deps.reloadTabs();
          } catch (err) {
            showToast(`Sync failed: ${err instanceof Error ? err.message : String(err)}`, "error");
          }
        },
        () => showToast("Sync cancelled — kept local data", "error")
      );
      break;
    }
    // "up_to_date", "not_logged_in" → silent
  }
}

async function handleFirstLoginSync(
  localCount:      number,
  remoteCount:     number,
  localCollection: CollectionEntry[],
  remote:          SyncPayload,
  serverTime:      number,
  deps: SyncDeps
): Promise<void> {
  const { showFirstLoginSyncDialog } = await import("./sync-dialog.ts");
  const session = await loadSession();
  if (!session) return;

  const nameMap = new Map(deps.getAllCards().map((c) => [c.cardNo, c.displayName]));
  const diff    = computeDiff(localCollection, remote.collection as CollectionEntry[], nameMap);

  showFirstLoginSyncDialog(localCount, remoteCount, diff,
    async (choice) => {
      try {
        if (choice === "export_first") {
          await exportBackup();
          await resolveFirstLogin("use_cloud", remote, session.token, serverTime);
          showToast("Backup disimpan, koleksi diganti dengan data cloud", "success");
        } else if (choice === "use_cloud") {
          await resolveFirstLogin("use_cloud", remote, session.token, serverTime);
          showToast("Koleksi diperbarui dari cloud", "success");
        } else if (choice === "merge") {
          await resolveFirstLogin("merge", remote, session.token, serverTime);
          showToast("Data lokal dan cloud digabungkan", "success");
        } else if (choice === "keep_local") {
          await resolveFirstLogin("keep_local", remote, session.token, serverTime);
          showToast("Data lokal dikirim ke cloud", "success");
        } else {
          await resolveFirstLogin("cancel", remote, session.token, serverTime);
        }
        await deps.reloadTabs();
      } catch (err) {
        showToast(`Sync failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    }
  );
}
