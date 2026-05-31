import type { Card, Settings } from "./types.ts";
import {
  saveCards, saveMeta, clearCards, clearMeta,
  saveCardsJp, saveMetaJp, clearCardsJp, clearMetaJp,
  fetchFromGitHub, fetchFromGitHubJp,
  fetchLatestCommitSha, fetchLatestCommitShaJp,
  fetchVersionInfo, loadFromCache, loadFromCacheJp,
  type CacheMeta,
} from "./cache.ts";
import { getCollectionQtyMap, deduplicateCollection, getAllCollectionCardNos, clearAllCollectionEntries } from "./collection-db.ts";
import { TabNav } from "./tab-nav.ts";
import {
  initCollectionTab, loadCollectionTab,
  closeCollectionPreview, scrollToEntry,
} from "./collection-tab.ts";
import {
  initWishlistTab, loadWishlistTab,
  closeWishlistPreview,
} from "./wishlist-tab.ts";
import {
  initBrowseTab, loadBrowseTab, reloadBrowseTab,
  refreshBrowseQtyMap, clearBrowseTab,
  closeBrowsePreview, updateBrowseAvailability, getBrowseBackPanes,
} from "./browse-tab.ts";
import { clearAllImageCache, clearOrphanedImageCache } from "./image-cache.ts";
import { exportBackup, importBackup, type ImportResult } from "./export-import.ts";
import { showConfirm } from "./confirm-dialog.ts";
import { showContextMenu } from "./context-menu.ts";
import { showAboutDialog } from "./about-dialog.ts";
import { showToast } from "./toast.ts";
import { initThemeToggle } from "./theme.ts";
import { initBackButton, setOnboardingMode } from "./back-button.ts";
import { isLightboxOpen, hideLightbox } from "./lightbox.ts";
import {
  setStartupProgress, setStatus, renderStats, clearStats,
  renderCacheInfo, showUpdateSpinner,
} from "./browse-stats.ts";
import { loadSettings, saveSettings } from "./settings.ts";
import { showOnboarding } from "./onboarding.ts";
import { runSync, scheduleDebounce } from "./sync.ts";
import { loadSession } from "./auth.ts";
import { initSyncButton, updateSyncTimestamp } from "./sync-menu.ts";
import "./styles.css";

// ── State ─────────────────────────────────────────────────────────────────────
let allEnCards:       Card[] = [];
let allJpCards:       Card[] = [];
let allCards:         Card[] = [];    // pointer: allEnCards or allJpCards
let activeRegion:     "EN" | "JP" = "EN";
let regionPreference: "EN" | "JP" | "BOTH" = "EN";
let enMeta: CacheMeta | null = null;
let jpMeta: CacheMeta | null = null;
let collectionQtyMap = new Map<string, number>();
let tabNav: TabNav | null = null;

// ── DOM refs ──────────────────────────────────────────────────────────────────
const refreshBtn        = document.querySelector<HTMLButtonElement>("#refreshBtn")!;
const clearBtn          = document.querySelector<HTMLButtonElement>("#clearBtn")!;
const clearImageCacheBtn = document.querySelector<HTMLButtonElement>("#clearImageCacheBtn")!;

// ── Update check ──────────────────────────────────────────────────────────────

async function checkForUpdatesEn(meta: CacheMeta): Promise<void> {
  showUpdateSpinner(true);
  try {
    const version = await fetchVersionInfo();
    let needsUpdate: boolean;
    if (version) {
      needsUpdate = version.cardCount !== meta.cardCount;
    } else {
      const sha = await fetchLatestCommitSha();
      needsUpdate = !!sha && sha !== meta.lastCommitSha;
    }
    if (!needsUpdate) return;
    await doFetchAndCacheEn();
    const setsMsg = version?.newSets.length ? ` — set baru: ${version.newSets.join(", ")}` : "";
    showToast(`EN cards diperbarui${setsMsg} (${allEnCards.length.toLocaleString("id-ID")} kartu).`);
  } finally {
    showUpdateSpinner(false);
  }
}

async function checkForUpdatesJp(meta: CacheMeta): Promise<void> {
  showUpdateSpinner(true);
  try {
    const version = await fetchVersionInfo();
    let needsUpdate: boolean;
    if (version?.cardCountJp !== undefined) {
      needsUpdate = version.cardCountJp !== meta.cardCount;
    } else {
      const sha = await fetchLatestCommitShaJp();
      needsUpdate = !!sha && sha !== meta.lastCommitSha;
    }
    if (!needsUpdate) return;
    await doFetchAndCacheJp();
    const setsMsg = version?.newSetsJp?.length ? ` — set baru: ${version.newSetsJp.join(", ")}` : "";
    showToast(`JP cards diperbarui${setsMsg} (${allJpCards.length.toLocaleString("id-ID")} kartu).`);
  } finally {
    showUpdateSpinner(false);
  }
}

// ── Refresh collection overlay data ──────────────────────────────────────────

async function refreshCollectionOverlay() {
  collectionQtyMap = await getCollectionQtyMap(activeRegion);
  refreshBrowseQtyMap(collectionQtyMap);
}

// ── Fetch and cache ───────────────────────────────────────────────────────────

async function doFetchAndCacheEn(): Promise<void> {
  if (activeRegion === "EN") setStatus("Fetching EN cards from GitHub…", "loading");
  const result = await fetchFromGitHub();
  allEnCards = result.cards;
  if (activeRegion === "EN") allCards = allEnCards;
  const sha = await fetchLatestCommitSha();

  if (activeRegion === "EN") setStatus("Saving EN cards to cache…", "loading");
  await saveCards(result.cards);
  enMeta = {
    lastFetchAt: Date.now(), lastCommitSha: sha,
    cardCount: result.cards.length, sizeBytes: result.totalBytes,
  };
  await saveMeta(enMeta);

  if (activeRegion === "EN") {
    loadBrowseTab(allEnCards, collectionQtyMap);
    setStatus(`✅ Fetched ${result.cards.length.toLocaleString("id-ID")} EN cards (${(result.fetchTimeMs + result.parseTimeMs).toFixed(0)} ms) + cached`, "success");
    renderStats({ count: result.cards.length, sizeBytes: result.totalBytes, fetchTimeMs: result.fetchTimeMs, parseTimeMs: result.parseTimeMs });
    renderCacheInfo(enMeta);
  }
}

async function doFetchAndCacheJp(): Promise<void> {
  if (activeRegion === "JP") setStatus("Fetching JP cards from GitHub…", "loading");
  const result = await fetchFromGitHubJp();
  allJpCards = result.cards;
  if (activeRegion === "JP") allCards = allJpCards;
  const sha = await fetchLatestCommitShaJp();

  if (activeRegion === "JP") setStatus("Saving JP cards to cache…", "loading");
  await saveCardsJp(result.cards);
  jpMeta = {
    lastFetchAt: Date.now(), lastCommitSha: sha,
    cardCount: result.cards.length, sizeBytes: result.totalBytes,
  };
  await saveMetaJp(jpMeta);

  if (activeRegion === "JP") {
    loadBrowseTab(allJpCards, collectionQtyMap);
    setStatus(`✅ Fetched ${result.cards.length.toLocaleString("id-ID")} JP cards (${(result.fetchTimeMs + result.parseTimeMs).toFixed(0)} ms) + cached`, "success");
    renderStats({ count: result.cards.length, sizeBytes: result.totalBytes, fetchTimeMs: result.fetchTimeMs, parseTimeMs: result.parseTimeMs });
    renderCacheInfo(jpMeta);
  }
}

// ── Switch region (BOTH mode) ─────────────────────────────────────────────────

async function switchRegion(region: "EN" | "JP"): Promise<void> {
  if (activeRegion === region) return;
  activeRegion = region;
  allCards     = region === "JP" ? allJpCards : allEnCards;

  await saveSettings({ region_preference: regionPreference, last_active_region: region, migration_version: 1 });

  reloadBrowseTab(allCards, collectionQtyMap);

  await Promise.all([
    loadCollectionTab(region, allCards, regionPreference),
    loadWishlistTab(region, allCards),
    refreshCollectionOverlay(),
  ]);

  updateRegionButton();
}

// ── Region button ─────────────────────────────────────────────────────────────

function updateRegionButton(): void {
  const btn       = document.getElementById("regionBtn")       as HTMLButtonElement | null;
  const switchBtn = document.getElementById("regionSwitchBtn") as HTMLButtonElement | null;
  if (!btn) return;

  if (regionPreference === "BOTH") {
    btn.textContent    = "Both";
    if (switchBtn) {
      switchBtn.textContent = `${activeRegion} ▾`;
      switchBtn.hidden = false;
    }
  } else {
    btn.textContent = regionPreference;
    if (switchBtn) switchBtn.hidden = true;
  }
}

function handleChangeRegion(): void {
  openChangeRegionDialog().catch(() => {});
}

function handleSwitchRegion(e: MouseEvent): void {
  const btn  = e.currentTarget as HTMLElement;
  const rect = btn.getBoundingClientRect();
  showContextMenu(rect.left, rect.bottom + 4, [
    {
      label: activeRegion === "EN" ? "✓ View EN" : "View EN",
      action: () => { switchRegion("EN").catch(() => {}); },
    },
    {
      label: activeRegion === "JP" ? "✓ View JP" : "View JP",
      action: () => { switchRegion("JP").catch(() => {}); },
    },
  ]);
}

async function openChangeRegionDialog(): Promise<void> {
  const chosen = await showOnboarding(regionPreference);
  if (chosen === regionPreference) return;

  const newSettings: Settings = {
    region_preference:  chosen,
    last_active_region: chosen === "BOTH" ? activeRegion : (chosen as "EN" | "JP"),
    migration_version:  1,
  };
  await saveSettings(newSettings);
  window.location.reload();
}

// ── Load handlers ─────────────────────────────────────────────────────────────

// Yield to browser paint loop between heavy operations — critical on Android
const yieldToUI = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

async function handleLoad() {
  const settings = await loadSettings();

  if (!settings) {
    setOnboardingMode(true);
    document.getElementById("fouc-guard")?.remove();
    const chosen = await showOnboarding();
    setOnboardingMode(false);

    const newSettings: Settings = {
      region_preference:  chosen,
      last_active_region: chosen === "BOTH" ? "EN" : (chosen as "EN" | "JP"),
      migration_version:  1,
    };
    await saveSettings(newSettings);
    regionPreference = chosen;
    activeRegion     = newSettings.last_active_region;
  } else {
    regionPreference = settings.region_preference;
    activeRegion     = settings.last_active_region;
  }

  updateRegionButton();

  setStartupProgress(5);
  setControlsDisabled(true);
  setStatus("Loading…", "loading");
  clearStats();

  try {
    setStartupProgress(15);

    // ── Load EN ───────────────────────────────────────────────────────────
    if (regionPreference === "EN" || regionPreference === "BOTH") {
      const t0     = performance.now();
      const cached = await loadFromCache();
      const loadMs = performance.now() - t0;

      if (cached) {
        allEnCards = cached.cards;
        enMeta     = cached.meta;
        if (activeRegion === "EN") {
          allCards = allEnCards;
          setStartupProgress(50);
          loadBrowseTab(allEnCards, collectionQtyMap);
          setStartupProgress(70);
          setStatus(`⚡ Loaded ${allEnCards.length.toLocaleString("id-ID")} EN cards from cache in ${loadMs.toFixed(0)} ms`, "success");
          renderStats({ count: allEnCards.length, sizeBytes: enMeta.sizeBytes, loadFromCacheMs: loadMs });
          renderCacheInfo(enMeta);
        }
        checkForUpdatesEn(enMeta).catch(() => {});
      } else {
        await doFetchAndCacheEn();
        setStartupProgress(70);
      }
      await yieldToUI(); // breathe after heavy JSON parse
    }

    // ── Load JP ───────────────────────────────────────────────────────────
    if (regionPreference === "JP" || regionPreference === "BOTH") {
      const t0     = performance.now();
      const cached = await loadFromCacheJp();
      const loadMs = performance.now() - t0;

      if (cached) {
        allJpCards = cached.cards;
        jpMeta     = cached.meta;
        if (activeRegion === "JP") {
          allCards = allJpCards;
          setStartupProgress(50);
          loadBrowseTab(allJpCards, collectionQtyMap);
          setStartupProgress(70);
          setStatus(`⚡ Loaded ${allJpCards.length.toLocaleString("id-ID")} JP cards from cache in ${loadMs.toFixed(0)} ms`, "success");
          renderStats({ count: allJpCards.length, sizeBytes: jpMeta.sizeBytes, loadFromCacheMs: loadMs });
          renderCacheInfo(jpMeta);
        }
        checkForUpdatesJp(jpMeta).catch(() => {});
      } else {
        await doFetchAndCacheJp();
        setStartupProgress(70);
      }
      await yieldToUI(); // breathe after heavy JSON parse
    }

    // Safety: ensure allCards pointer is set (BOTH mode edge cases)
    if (allCards.length === 0) {
      allCards = activeRegion === "JP" ? allJpCards : allEnCards;
      if (allCards.length > 0) loadBrowseTab(allCards, collectionQtyMap);
    }

    initCollectionTab(allCards, regionPreference, () => {
      refreshCollectionOverlay().catch(() => {});
      scheduleDebounce();
    });
    initWishlistTab(allCards, () => { scheduleDebounce(); });
    setStartupProgress(85);
    await yieldToUI();

    const mergedGroups = await deduplicateCollection();
    if (mergedGroups > 0) showToast(`Cleaned up ${mergedGroups} duplicate collection ${mergedGroups === 1 ? "entry" : "entries"}.`);

    // Sequential load — less peak load than Promise.all, better on Android
    await loadCollectionTab(activeRegion, undefined, regionPreference);
    await yieldToUI();
    await loadWishlistTab(activeRegion);
    await yieldToUI();
    await refreshCollectionOverlay();
    setStartupProgress(100);
    await yieldToUI();

    // Init sync button only after startup — prevents login attempts during heavy load
    initSyncButton();

    // Sync is safe to start now — UI is fully rendered
    setTimeout(() => void runSync().then(handleSyncResult), 500);

  } catch (err) {
    setStartupProgress(100);
    setStatus(`❌ Failed: ${err instanceof Error ? err.message : String(err)}`, "error", () => handleForceRefresh());
    console.error(err);
  } finally {
    setControlsDisabled(false);
    updateBrowseAvailability();
    document.getElementById("fouc-guard")?.remove();
  }
}

async function handleForceRefresh() {
  setControlsDisabled(true);
  clearStats();
  try {
    if (activeRegion === "EN") await doFetchAndCacheEn();
    else                        await doFetchAndCacheJp();
  } catch (err) {
    setStatus(`❌ Refresh failed: ${err instanceof Error ? err.message : String(err)}`, "error", () => handleForceRefresh());
  } finally {
    setControlsDisabled(false);
    updateBrowseAvailability();
  }
}

export function handleSyncOutcome(result: Awaited<ReturnType<typeof runSync>>): void {
  void handleSyncResult(result);
}

async function handleSyncResult(result: Awaited<ReturnType<typeof runSync>>): Promise<void> {
  switch (result.status) {
    case "pulled":
      showToast("Collection updated from cloud", "success");
      await Promise.all([
        loadCollectionTab(activeRegion, undefined, regionPreference),
        loadWishlistTab(activeRegion),
        refreshCollectionOverlay(),
      ]);
      break;
    case "pushed":
      updateSyncTimestamp();
      break;
    case "unauthorized":
      showToast("Sync session expired — please sign in again", "error");
      break;
    case "error":
      showToast(`Sync failed, working offline`, "error");
      break;
    case "first_login":
      // Gap 1: device baru login dengan data lokal yang sudah ada
      await handleFirstLoginSync(result.localCount, result.remoteCount);
      break;
    case "conflict":
      // Phase 10d — placeholder untuk sekarang
      showToast(`${result.conflicts.length} conflict(s) detected — resolve in next update`, "error");
      break;
    // "up_to_date", "not_logged_in" → silent
  }
}

async function handleFirstLoginSync(localCount: number, remoteCount: number): Promise<void> {
  const { showFirstLoginSyncDialog } = await import("./sync-dialog.ts");
  const session = await loadSession();
  if (!session) return;

  showFirstLoginSyncDialog(localCount, remoteCount,
    async (choice) => {
      if (choice === "export_first") {
        const { exportBackup: doExport } = await import("./export-import.ts");
        await doExport();
      }
      if (choice === "use_cloud") {
        const { data: remote } = await fetch(`${(await import("./auth.ts")).WORKER_URL}/sync`, {
          headers: { Authorization: `Bearer ${session.token}` },
        }).then((r) => r.json()) as { data: import("./types.ts").SyncPayload };
        if (remote) {
          const { invoke } = await import("@tauri-apps/api/core");
          const dir = await invoke<string>("get_userdata_dir");
          await Promise.all([
            invoke("write_text_file", { path: `${dir}/collection.json`, content: JSON.stringify(remote.collection, null, 2) }),
            invoke("write_text_file", { path: `${dir}/wishlist.json`,   content: JSON.stringify(remote.wishlist,   null, 2) }),
            invoke("write_text_file", { path: `${dir}/locations.json`,  content: JSON.stringify(remote.locations,  null, 2) }),
          ]);
          await Promise.all([
            loadCollectionTab(activeRegion, undefined, regionPreference),
            loadWishlistTab(activeRegion),
            refreshCollectionOverlay(),
          ]);
          showToast("Collection replaced with cloud data", "success");
        }
      }
      // "merge" dan "cancel" → tidak perlu action, data lokal tetap
    }
  );
}

async function handleClearCache() {
  const ok = await showConfirm("Clear card cache? The local card database will be removed. You'll need an internet connection to reload.");
  if (!ok) return;
  try {
    await Promise.all([clearCards(), clearMeta(), clearCardsJp(), clearMetaJp()]);
    allEnCards = []; allJpCards = []; allCards = []; enMeta = null; jpMeta = null;
    clearBrowseTab();
    setStatus("🗑️ Cache cleared.", "info");
    clearStats();
    renderCacheInfo(null);
  } catch (err) {
    setStatus(`❌ Clear failed: ${err instanceof Error ? err.message : String(err)}`, "error");
  }
}

function setControlsDisabled(disabled: boolean) {
  refreshBtn.disabled        = disabled;
  clearBtn.disabled          = disabled;
  clearImageCacheBtn.disabled = disabled;
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

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  window.addEventListener("unhandledrejection", (e) => {
    const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
    showToast(`❌ ${msg}`, "error");
    e.preventDefault();
  });

  tabNav = new TabNav();

  tabNav.onTabSwitch((from, _to) => {
    if (from === "browse")     closeBrowsePreview();
    if (from === "collection") closeCollectionPreview();
    if (from === "wishlist")   closeWishlistPreview();
  });

  initBrowseTab({
    onCollectionChanged: async () => {
      await refreshCollectionOverlay();
      await loadCollectionTab(activeRegion, undefined, regionPreference);
    },
    onWishlistChanged: async () => {
      await loadWishlistTab(activeRegion);
    },
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
      ...allEnCards.map((c) => c.cardNo),
      ...allJpCards.map((c) => c.cardNo),
    ]);
    const result = await importBackup(cardSet);
    if (result === "browser") {
      alert("Import requires the desktop app.");
    } else if (result === "invalid") {
      alert("Import failed: invalid or unrecognised backup file.");
    } else if (typeof result === "object") {
      await Promise.all([loadCollectionTab(activeRegion, undefined, regionPreference), loadWishlistTab(activeRegion), refreshCollectionOverlay()]);
      const unknownMsg = result.unknownCount > 0
        ? ` (${result.unknownCount} unknown codes kept)`
        : "";
      showToast(
        `Imported ${(result as ImportResult).collectionCount} collection + ` +
        `${(result as ImportResult).wishlistCount} wishlist entries.${unknownMsg}`
      );
    }
  });

  document.getElementById("clearCollectionBtn")?.addEventListener("click", async () => {
    const first = await showConfirm(
      "Clear ALL collection entries?\n\nThis will permanently delete every card in your collection. This cannot be undone."
    );
    if (!first) return;
    const second = await showConfirm(
      "Are you absolutely sure?\n\nAll collection data will be lost forever."
    );
    if (!second) return;
    await clearAllCollectionEntries();
    await Promise.all([
      loadCollectionTab(activeRegion, undefined, regionPreference),
      refreshCollectionOverlay(),
    ]);
    showToast("Collection cleared.");
  });

  document.getElementById("regionBtn")?.addEventListener("click", handleChangeRegion);
  document.getElementById("regionSwitchBtn")?.addEventListener("click", handleSwitchRegion);
  document.getElementById("aboutBtn")?.addEventListener("click", showAboutDialog);

  initThemeToggle();
  // initSyncButton is called in handleLoad() after startup completes
  initBackButton([
    { isOpen: isLightboxOpen, close: hideLightbox },
    ...getBrowseBackPanes(),
    {
      isOpen: () => document.getElementById("collectionPreviewPane")?.classList.contains("is-open") ?? false,
      close:  () => closeCollectionPreview(),
    },
    {
      isOpen: () => document.getElementById("wishlistPreviewPane")?.classList.contains("is-open") ?? false,
      close:  () => closeWishlistPreview(),
    },
  ]);

  refreshBtn.addEventListener("click", handleForceRefresh);
  clearBtn.addEventListener("click", handleClearCache);
  clearImageCacheBtn.addEventListener("click", handleClearImageCache);

  const meta = await loadFromCache().then((c) => c?.meta ?? null);
  renderCacheInfo(meta);

  await handleLoad();
}

init();
