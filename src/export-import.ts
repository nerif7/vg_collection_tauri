import { invoke } from "@tauri-apps/api/core";
import type { CollectionEntry, WishlistEntry } from "./types.ts";
import type { CacheMeta } from "./cache.ts";
import { loadMeta } from "./cache.ts";
import {
  getAllCollectionEntries, getAllWishlistEntries,
  mergeOrAdd, addToWishlist,
  clearAllCollectionEntries, clearAllWishlistEntries,
  getAllLocations, replaceAllLocations, addLocation,
} from "./collection-db.ts";
import { showConfirm } from "./confirm-dialog.ts";
import { trapFocus } from "./focus-trap.ts";

// version field absent = legacy (pre-JP) format; version 2 = includes region
interface BackupData {
  version?:   number;
  collection: Array<Omit<CollectionEntry, "region"> & { region?: "EN" | "JP" }>;
  wishlist:   Array<Omit<WishlistEntry,   "region"> & { region?: "EN" | "JP" }>;
  meta:       CacheMeta | null;
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
    version: 2,
    collection,
    wishlist,
    meta,
    exportedAt: Date.now(),
    appVersion: "0.2.0",
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

  // Legacy format (no version field): all entries belong to EN
  if (!backup.version) {
    backup.collection = backup.collection.map((e) => ({ ...e, region: "EN" as const }));
    backup.wishlist   = backup.wishlist.map((e)   => ({ ...e, region: "EN" as const }));
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

  const confirmMsg = mode === "merge"
    ? `Add ${backup.collection.length} collection + ${backup.wishlist.length} wishlist entries to your current data?`
    : `Delete ALL existing collection and wishlist data, then import ${backup.collection.length} entries?\n\nThis cannot be undone.`;
  const confirmed = await showConfirm(confirmMsg);
  if (!confirmed) return "cancelled";

  if (mode === "replace") {
    await Promise.all([clearAllCollectionEntries(), clearAllWishlistEntries()]);
  }

  for (const entry of backup.collection) {
    await mergeOrAdd(entry.cardCode, entry.location, entry.quantity, entry.region ?? "EN");
  }
  for (const entry of backup.wishlist) {
    await addToWishlist(entry.cardCode, entry.region ?? "EN");
  }

  // Sync locations from backup entries into locations.json
  const backupLocations = [
    ...new Set(backup.collection.map((e) => e.location).filter((l): l is string => !!l)),
  ];
  if (backupLocations.length > 0) {
    if (mode === "replace") {
      await replaceAllLocations(backupLocations);
    } else {
      const existing = await getAllLocations();
      const toAdd = backupLocations.filter((l) => !existing.includes(l));
      for (const loc of toAdd) await addLocation(loc);
    }
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
    overlay.className = "modal-overlay";

    const box = document.createElement("div");
    box.className = "confirm-dialog import-dialog";

    const title = document.createElement("div");
    title.className = "import-dialog-title";
    title.textContent = "Import Backup";
    box.appendChild(title);

    const found = document.createElement("div");
    found.className = "import-dialog-found";
    found.textContent = `Found ${collectionCount} collection + ${wishlistCount} wishlist entries.`;
    box.appendChild(found);

    if (unknownCount > 0) {
      const warn = document.createElement("p");
      warn.className = "import-warn";
      warn.textContent = `⚠ ${unknownCount} card code(s) not found in current database — will still be imported.`;
      box.appendChild(warn);
    }

    const modes = document.createElement("div");
    modes.className = "import-dialog-modes";
    modes.setAttribute("role", "group");
    modes.setAttribute("aria-label", "Import mode");

    const makeOpt = (label: string, desc: string): HTMLElement => {
      const el = document.createElement("div");
      el.className = "import-mode-option";
      el.setAttribute("role", "button");
      el.setAttribute("tabindex", "0");
      el.setAttribute("aria-pressed", "false");
      el.innerHTML = `<strong>${label}</strong><span>${desc}</span>`;
      return el;
    };

    const mergeOpt   = makeOpt("Merge", "Add to existing collection. Same card + location combines quantities.");
    const replaceOpt = makeOpt("Replace all", "Delete all existing collection and wishlist data first, then import.");

    modes.append(mergeOpt, replaceOpt);
    box.appendChild(modes);

    const btnRow = document.createElement("div");
    btnRow.className = "confirm-actions";

    let selectedMode: "merge" | "replace" | null = null;

    let releaseTrap = () => {};
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") done("cancel");
    };

    const done = (val: "merge" | "replace" | "cancel") => {
      overlay.remove();
      releaseTrap();
      document.removeEventListener("keydown", onKeydown);
      resolve(val);
    };

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button"; confirmBtn.className = "btn-secondary";
    confirmBtn.textContent = "Confirm";
    confirmBtn.disabled = true;
    confirmBtn.addEventListener("click", () => { if (selectedMode) done(selectedMode); });

    const select = (mode: "merge" | "replace") => {
      selectedMode = mode;
      mergeOpt.classList.toggle("import-mode-option--selected", mode === "merge");
      mergeOpt.setAttribute("aria-pressed", String(mode === "merge"));
      replaceOpt.classList.toggle("import-mode-option--selected", mode === "replace");
      replaceOpt.setAttribute("aria-pressed", String(mode === "replace"));
      confirmBtn.disabled = false;
    };

    const activate = (opt: HTMLElement, mode: "merge" | "replace") => {
      opt.addEventListener("click", () => select(mode));
      opt.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(mode); }
      });
    };
    activate(mergeOpt, "merge");
    activate(replaceOpt, "replace");

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button"; cancelBtn.className = "btn-neutral";
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => done("cancel"));

    btnRow.append(cancelBtn, confirmBtn);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => {
      overlay.classList.add("is-open");
      document.addEventListener("keydown", onKeydown);
      releaseTrap = trapFocus(box);
    });

    overlay.addEventListener("click", (e) => { if (e.target === overlay) done("cancel"); }, { once: true });
  });
}
