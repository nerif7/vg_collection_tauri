import { clearCards, clearMeta, clearCardsJp, clearMetaJp, loadFromCache } from "./cache.ts";
import { getCollectionQtyMap, getAllCollectionCardNos, clearAllCollectionEntries } from "./collection-db.ts";
import { TabNav } from "./tab-nav.ts";
import { loadCollectionTab, closeCollectionPreview, scrollToEntry } from "./collection-tab.ts";
import { loadWishlistTab, closeWishlistPreview } from "./wishlist-tab.ts";
import {
  initBrowseTab, refreshBrowseQtyMap, clearBrowseTab,
  closeBrowsePreview, updateBrowseAvailability, getBrowseBackPanes,
} from "./browse-tab.ts";
import { clearAllImageCache, clearOrphanedImageCache } from "./image-cache.ts";
import { exportBackup, importBackup, type ImportResult } from "./export-import.ts";
import { showConfirm } from "./confirm-dialog.ts";
import { showContextMenu } from "./context-menu.ts";
import { showAboutDialog } from "./about-dialog.ts";
import { showToast } from "./toast.ts";
import { initThemeToggle } from "./theme.ts";
import { initBackButton } from "./back-button.ts";
import { isLightboxOpen, hideLightbox } from "./lightbox.ts";
import { renderCacheInfo, setStatus, clearStats } from "./browse-stats.ts";
import { runSync } from "./sync.ts";
import { handleSyncResult, type SyncDeps } from "./sync-handlers.ts";
import { switchRegion, openChangeRegionDialog, handleSwitchRegionClick } from "./region.ts";
import { doFetchAndCacheEn, doFetchAndCacheJp } from "./card-loader.ts";
import { runStartup, type AppState } from "./startup.ts";
import "./styles.css";

// ── State ─────────────────────────────────────────────────────────────────────

const state: AppState = {
  allEnCards:       [],
  allJpCards:       [],
  allCards:         [],
  activeRegion:     "EN",
  regionPreference: "EN",
  enMeta:           null,
  jpMeta:           null,
  collectionQtyMap: new Map(),
};

// ── DOM refs ──────────────────────────────────────────────────────────────────

const refreshBtn         = document.querySelector<HTMLButtonElement>("#refreshBtn")!;
const clearBtn           = document.querySelector<HTMLButtonElement>("#clearBtn")!;
const clearImageCacheBtn = document.querySelector<HTMLButtonElement>("#clearImageCacheBtn")!;

let tabNav: TabNav | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function refreshCollectionOverlay(): Promise<void> {
  state.collectionQtyMap = await getCollectionQtyMap(state.activeRegion);
  refreshBrowseQtyMap(state.collectionQtyMap);
}

async function reloadAllTabs(): Promise<void> {
  await Promise.all([
    loadCollectionTab(state.activeRegion, undefined, state.regionPreference),
    loadWishlistTab(state.activeRegion),
    refreshCollectionOverlay(),
  ]);
}

function setControlsDisabled(disabled: boolean): void {
  refreshBtn.disabled         = disabled;
  clearBtn.disabled           = disabled;
  clearImageCacheBtn.disabled = disabled;
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function handleForceRefresh(): Promise<void> {
  setControlsDisabled(true);
  try {
    if (state.activeRegion === "EN") await doFetchAndCacheEn(state);
    else                              await doFetchAndCacheJp(state);
  } catch (err) {
    setStatus(`❌ Refresh failed: ${err instanceof Error ? err.message : String(err)}`, "error", handleForceRefresh);
  } finally {
    setControlsDisabled(false);
    updateBrowseAvailability();
  }
}

async function handleClearCache(): Promise<void> {
  const ok = await showConfirm("Clear card cache? The local card database will be removed. You'll need an internet connection to reload.");
  if (!ok) return;
  try {
    await Promise.all([clearCards(), clearMeta(), clearCardsJp(), clearMetaJp()]);
    state.allEnCards = []; state.allJpCards = []; state.allCards = [];
    state.enMeta = null; state.jpMeta = null;
    clearBrowseTab();
    setStatus("🗑️ Cache cleared.", "info");
    clearStats();
    renderCacheInfo(null);
  } catch (err) {
    setStatus(`❌ Clear failed: ${err instanceof Error ? err.message : String(err)}`, "error");
  }
}

function handleClearImageCache(e: MouseEvent): void {
  const btn  = e.currentTarget as HTMLElement;
  const rect = btn.getBoundingClientRect();
  showContextMenu(rect.left, rect.bottom + 4, [
    {
      label: "Clear all image cache",
      action: async () => {
        const ok = await showConfirm("Delete all locally cached card images? They will be re-downloaded next time you open a card preview.");
        if (!ok) return;
        const count = await clearAllImageCache();
        showToast(count > 0
          ? `Deleted ${count} cached image${count !== 1 ? "s" : ""}.`
          : "No cached images found.");
      },
    },
    {
      label: "Clear orphaned images",
      action: async () => {
        const ok = await showConfirm("Delete cached images for cards not currently in your collection? This includes cards you browsed but never added.");
        if (!ok) return;
        const cardNos = await getAllCollectionCardNos();
        const count   = await clearOrphanedImageCache(cardNos);
        showToast(count > 0
          ? `Deleted ${count} orphaned image${count !== 1 ? "s" : ""}.`
          : "No orphaned images found.");
      },
    },
  ]);
}

// ── Sync outcome (called by sync-menu.ts via dynamic import) ──────────────────

export function handleSyncOutcome(result: Awaited<ReturnType<typeof runSync>>): void {
  const syncDeps: SyncDeps = {
    getAllCards:       () => state.allCards,
    activeRegion:     () => state.activeRegion,
    regionPreference: () => state.regionPreference,
    reloadTabs:       reloadAllTabs,
  };
  void handleSyncResult(result, syncDeps);
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init(): Promise<void> {
  window.addEventListener("unhandledrejection", (e) => {
    const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
    showToast(`❌ ${msg}`, "error");
    e.preventDefault();
  });

  tabNav = new TabNav();
  tabNav.onTabSwitch((from) => {
    if (from === "browse")     closeBrowsePreview();
    if (from === "collection") closeCollectionPreview();
    if (from === "wishlist")   closeWishlistPreview();
  });

  initBrowseTab({
    onCollectionChanged: async () => {
      await refreshCollectionOverlay();
      await loadCollectionTab(state.activeRegion, undefined, state.regionPreference);
    },
    onWishlistChanged: async () => { await loadWishlistTab(state.activeRegion); },
    onEditInCollection: (entry) => {
      tabNav!.switchTo("collection");
      scrollToEntry(entry.id!);
    },
  });

  document.getElementById("exportBtn")?.addEventListener("click", async () => {
    const result = await exportBackup();
    if (result === "saved") showToast("Collection exported successfully.");
    else if (result === "browser") alert("Export requires the desktop app.");
  });

  document.getElementById("importBtn")?.addEventListener("click", async () => {
    const cardSet = new Set([
      ...state.allEnCards.map((c) => c.cardNo),
      ...state.allJpCards.map((c) => c.cardNo),
    ]);
    const result = await importBackup(cardSet);
    if (result === "browser") {
      alert("Import requires the desktop app.");
    } else if (result === "invalid") {
      alert("Import failed: invalid or unrecognised backup file.");
    } else if (typeof result === "object") {
      await reloadAllTabs();
      const unknownMsg = result.unknownCount > 0 ? ` (${result.unknownCount} unknown codes kept)` : "";
      showToast(
        `Imported ${(result as ImportResult).collectionCount} collection + ` +
        `${(result as ImportResult).wishlistCount} wishlist entries.${unknownMsg}`
      );
    }
  });

  document.getElementById("clearCollectionBtn")?.addEventListener("click", async () => {
    const first = await showConfirm("Clear ALL collection entries?\n\nThis will permanently delete every card in your collection. This cannot be undone.");
    if (!first) return;
    const second = await showConfirm("Are you absolutely sure?\n\nAll collection data will be lost forever.");
    if (!second) return;
    await clearAllCollectionEntries();
    await Promise.all([
      loadCollectionTab(state.activeRegion, undefined, state.regionPreference),
      refreshCollectionOverlay(),
    ]);
    showToast("Collection cleared.");
  });

  document.getElementById("regionBtn")?.addEventListener("click", () =>
    openChangeRegionDialog(state.regionPreference, state.activeRegion).catch(() => {}));
  document.getElementById("regionSwitchBtn")?.addEventListener("click", (e) =>
    handleSwitchRegionClick(e, () => state.activeRegion, (r) =>
      switchRegion(r, state, refreshCollectionOverlay).catch(() => {})));
  document.getElementById("aboutBtn")?.addEventListener("click", showAboutDialog);

  initThemeToggle();
  initBackButton([
    { isOpen: isLightboxOpen, close: hideLightbox },
    ...getBrowseBackPanes(),
    {
      isOpen: () => document.getElementById("collectionPreviewPane")?.classList.contains("is-open") ?? false,
      close:  closeCollectionPreview,
    },
    {
      isOpen: () => document.getElementById("wishlistPreviewPane")?.classList.contains("is-open") ?? false,
      close:  closeWishlistPreview,
    },
  ]);

  refreshBtn.addEventListener("click", handleForceRefresh);
  clearBtn.addEventListener("click", handleClearCache);
  clearImageCacheBtn.addEventListener("click", handleClearImageCache);

  const meta = await loadFromCache().then((c) => c?.meta ?? null);
  renderCacheInfo(meta);

  const syncDeps: SyncDeps = {
    getAllCards:       () => state.allCards,
    activeRegion:     () => state.activeRegion,
    regionPreference: () => state.regionPreference,
    reloadTabs:       reloadAllTabs,
  };

  await runStartup(state, {
    setControlsDisabled,
    refreshCollectionOverlay,
    onSyncResult: (r) => handleSyncResult(r, syncDeps),
    onForceRefresh: () => void handleForceRefresh(),
  });
}

init();
