import { invoke } from "@tauri-apps/api/core";
import type { CollectionEntry, WishlistEntry } from "./types.ts";
import type { CacheMeta } from "./cache.ts";
import { loadMeta } from "./cache.ts";
import {
  getAllCollectionEntries, getAllWishlistEntries,
  mergeOrAdd, addToWishlist,
  clearAllCollectionEntries, clearAllWishlistEntries,
} from "./collection-db.ts";

interface BackupData {
  collection: CollectionEntry[];
  wishlist: WishlistEntry[];
  meta: CacheMeta | null;
  exportedAt: number;
  appVersion: string;
}

export interface ImportResult {
  collectionCount: number;
  wishlistCount: number;
  unknownCount: number;
  mode: "merge" | "replace";
}

function isTauri(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

// ── Export ────────────────────────────────────────────────────────────────────

export async function exportBackup(): Promise<"saved" | "cancelled" | "browser"> {
  if (!isTauri()) return "browser";

  const [collection, wishlist, meta] = await Promise.all([
    getAllCollectionEntries(),
    getAllWishlistEntries(),
    loadMeta(),
  ]);

  const backup: BackupData = {
    collection,
    wishlist,
    meta,
    exportedAt: Date.now(),
    appVersion: "0.1.0",
  };

  const saved = await invoke<boolean>("export_backup", {
    content: JSON.stringify(backup, null, 2),
  });

  return saved ? "saved" : "cancelled";
}

// ── Import ────────────────────────────────────────────────────────────────────

export async function importBackup(
  cardSet: Set<string>,
): Promise<ImportResult | "cancelled" | "browser" | "invalid"> {
  if (!isTauri()) return "browser";

  const content = await invoke<string | null>("import_backup");
  if (!content) return "cancelled";

  let backup: BackupData;
  try {
    backup = JSON.parse(content) as BackupData;
  } catch {
    return "invalid";
  }

  if (!Array.isArray(backup.collection) || !Array.isArray(backup.wishlist)) {
    return "invalid";
  }

  const unknownCodes = new Set([
    ...backup.collection.map((e) => e.cardCode).filter((c) => !cardSet.has(c)),
    ...backup.wishlist.map((e) => e.cardCode).filter((c) => !cardSet.has(c)),
  ]);

  const mode = await showImportModeDialog(
    backup.collection.length,
    backup.wishlist.length,
    unknownCodes.size,
  );
  if (mode === "cancel") return "cancelled";

  if (mode === "replace") {
    await Promise.all([clearAllCollectionEntries(), clearAllWishlistEntries()]);
  }

  for (const entry of backup.collection) {
    await mergeOrAdd(entry.cardCode, entry.location, entry.quantity);
  }
  for (const entry of backup.wishlist) {
    await addToWishlist(entry.cardCode);
  }

  return {
    collectionCount: backup.collection.length,
    wishlistCount: backup.wishlist.length,
    unknownCount: unknownCodes.size,
    mode,
  };
}

// ── Import mode dialog ────────────────────────────────────────────────────────

function showImportModeDialog(
  collectionCount: number,
  wishlistCount: number,
  unknownCount: number,
): Promise<"merge" | "replace" | "cancel"> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";

    const box = document.createElement("div");
    box.className = "confirm-box";

    const msg = document.createElement("p");
    msg.className = "confirm-message";
    msg.textContent = `Found ${collectionCount} collection + ${wishlistCount} wishlist entries.`;
    box.appendChild(msg);

    if (unknownCount > 0) {
      const warn = document.createElement("p");
      warn.className = "import-warn";
      warn.textContent = `⚠ ${unknownCount} card code(s) not in current database — will still be imported.`;
      box.appendChild(warn);
    }

    const desc = document.createElement("p");
    desc.className = "import-mode-desc";
    desc.innerHTML =
      "<strong>Merge</strong>: add to existing — same card+location sums qty.<br>" +
      "<strong>Replace</strong>: clear entire collection and wishlist first.";
    box.appendChild(desc);

    const btnRow = document.createElement("div");
    btnRow.className = "confirm-buttons";

    const done = (val: "merge" | "replace" | "cancel") => {
      overlay.remove();
      resolve(val);
    };

    const mergeBtn = document.createElement("button");
    mergeBtn.type = "button"; mergeBtn.className = "btn-secondary";
    mergeBtn.textContent = "Merge";
    mergeBtn.addEventListener("click", () => done("merge"));

    const replaceBtn = document.createElement("button");
    replaceBtn.type = "button"; replaceBtn.className = "btn-danger";
    replaceBtn.textContent = "Replace all";
    replaceBtn.addEventListener("click", () => done("replace"));

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button"; cancelBtn.className = "btn-secondary";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => done("cancel"));

    btnRow.append(mergeBtn, replaceBtn, cancelBtn);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("is-open"));

    mergeBtn.focus();
  });
}
