import type { Card, Settings } from "./types.ts";
import {
  saveCards, saveMeta, clearCards, clearMeta,
  saveCardsJp, saveMetaJp, clearCardsJp, clearMetaJp,
  fetchFromGitHub, fetchFromGitHubJp,
  fetchLatestCommitSha, fetchLatestCommitShaJp,
  fetchVersionInfo, loadFromCache, loadFromCacheJp,
  type CacheMeta,
} from "./cache.ts";
import { getCollectionQtyMap, deduplicateCollection } from "./collection-db.ts";
import { VirtualList } from "./virtual-list.ts";
import { buildCardRow } from "./card-row.ts";
import {
  applyFilters, extractUniqueOptions, hasActiveFilter, sortCards,
  type FilterState, type BrowseSortKey,
} from "./filters.ts";
import {
  getFilterBarRefs, populateDropdowns, readFilterState,
  resetFilters, attachFilterListeners, setFilterActiveIndicator,
  type FilterBarRefs,
} from "./filter-bar.ts";

function makeBrowseEmptyNode(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "virtual-list-empty";
  const text = document.createElement("p");
  text.textContent = "No cards match — try clearing filters";
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "empty-clear-btn";
  btn.textContent = "Clear filters";
  btn.addEventListener("click", () => {
    if (!filterRefs) return;
    resetFilters(filterRefs);
    refreshList();
  });
  wrap.append(text, btn);
  return wrap;
}

import { CardPreview } from "./card-preview.ts";
import { VirtualGrid } from "./virtual-grid.ts";
import { buildCardTile } from "./card-tile.ts";
import { TabNav } from "./tab-nav.ts";
import {
  initCollectionTab, loadCollectionTab,
  closeCollectionPreview, scrollToEntry,
} from "./collection-tab.ts";
import {
  initWishlistTab, loadWishlistTab,
  closeWishlistPreview,
} from "./wishlist-tab.ts";
import { exportBackup, importBackup, type ImportResult } from "./export-import.ts";
import { showConfirm } from "./confirm-dialog.ts";
import { showAboutDialog } from "./about-dialog.ts";
import { showToast } from "./toast.ts";
import { initThemeToggle } from "./theme.ts";
import { initBackButton, setOnboardingMode } from "./back-button.ts";
import {
  setStartupProgress, setStatus, renderStats, clearStats,
  renderCacheInfo, showUpdateSpinner,
} from "./browse-stats.ts";
import { loadSettings, saveSettings } from "./settings.ts";
import { showOnboarding } from "./onboarding.ts";
import { initOverviewTab, loadOverviewTab } from "./overview-tab.ts";
import "./styles.css";

// ── State ─────────────────────────────────────────────────────────────────────
let allEnCards:       Card[] = [];
let allJpCards:       Card[] = [];
let allCards:         Card[] = [];    // pointer: allEnCards or allJpCards
let activeRegion:     "EN" | "JP" = "EN";
let regionPreference: "EN" | "JP" | "BOTH" = "EN";
let enMeta: CacheMeta | null = null;
let jpMeta: CacheMeta | null = null;

let visibleCards: Card[] = [];
let virtualList: VirtualList<Card> | null = null;
let virtualGrid: VirtualGrid<Card> | null = null;
let browseViewMode: "list" | "grid" = "list";
let browseSort: BrowseSortKey = "name";
let filterRefs: FilterBarRefs | null = null;
let selectedCardNo: string | null = null;
let cardPreview: CardPreview | null = null;
let collectionQtyMap = new Map<string, number>();
let tabNav: TabNav | null = null;

// ── DOM refs (Browse tab) ─────────────────────────────────────────────────────
const refreshBtn    = document.querySelector<HTMLButtonElement>("#refreshBtn")!;
const clearBtn      = document.querySelector<HTMLButtonElement>("#clearBtn")!;
const listContainer = document.querySelector<HTMLDivElement>("#cardListContainer")!;
const listMetaEl    = document.querySelector<HTMLDivElement>("#listMeta")!;
const filterBarEl   = document.querySelector<HTMLDivElement>("#filterBar")!;
const previewPaneEl = document.querySelector<HTMLElement>("#previewPane")!;

// ── Browse tab availability guard ─────────────────────────────────────────────

function setupBrowseGuard(): void {
  const browseBtn = document.querySelector<HTMLButtonElement>('[data-tab="browse"]');
  if (!browseBtn) return;
  browseBtn.addEventListener("click", (e) => {
    if (allCards.length === 0) {
      e.stopImmediatePropagation();
      showToast("Card database unavailable. Connect to the internet and relaunch the app.");
    }
  }, { capture: true });
}

function updateBrowseTabState(): void {
  const browseBtn = document.querySelector<HTMLButtonElement>('[data-tab="browse"]');
  if (browseBtn) browseBtn.classList.toggle("tab-btn--unavailable", allCards.length === 0);

  const panel = document.getElementById("tabBrowse");
  if (!panel) return;
  const existing = panel.querySelector(".browse-unavailable");
  if (allCards.length === 0 && !existing) {
    const msg = document.createElement("div");
    msg.className = "browse-unavailable";
    msg.textContent = "Card database unavailable. Connect to the internet and relaunch the app.";
    panel.prepend(msg);
  } else if (allCards.length > 0 && existing) {
    existing.remove();
  }
}

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

// ── Browse virtual list ───────────────────────────────────────────────────────

function refreshList() {
  if (!filterRefs) return;
  const filter = readFilterState(filterRefs);
  setFilterActiveIndicator(hasActiveFilter(filter));
  const filtered = applyFilters(allCards, filter);
  visibleCards = sortCards(filtered, browseSort, collectionQtyMap);

  if (browseViewMode === "list") {
    if (!virtualList) {
      virtualList = new VirtualList<Card>(listContainer, {
        rowHeight: 62,
        buffer: 8,
        renderRow: (card, _i) =>
          buildCardRow(card, _i, card.cardNo === selectedCardNo, collectionQtyMap.get(card.cardNo)),
        onRowClick: (card) => {
          selectedCardNo = card.cardNo;
          virtualList!.refresh();
          cardPreview!.show(card);
        },
        emptyNode: makeBrowseEmptyNode,
      });
    }
    virtualList.setItems(visibleCards);
  } else {
    if (!virtualGrid) {
      virtualGrid = new VirtualGrid<Card>(listContainer, {
        cellHeight: 320,
        gap: 10,
        buffer: 3,
        renderCell: (card) =>
          buildCardTile(card, card.cardNo === selectedCardNo, {
            badgeQty: collectionQtyMap.get(card.cardNo),
          }),
        onCellClick: (card) => {
          selectedCardNo = card.cardNo;
          virtualGrid!.refresh();
          cardPreview!.show(card);
        },
        emptyNode: makeBrowseEmptyNode,
      });
    }
    virtualGrid.setItems(visibleCards);
  }

  updateListMeta(visibleCards.length, allCards.length, filter);
}

function toggleBrowseView() {
  virtualList?.destroy(); virtualList = null;
  virtualGrid?.destroy(); virtualGrid = null;
  listContainer.innerHTML = "";
  browseViewMode = browseViewMode === "list" ? "grid" : "list";
  const btn = document.querySelector<HTMLButtonElement>("#browseViewToggle");
  if (btn) btn.textContent = browseViewMode === "grid" ? "☰ List" : "⊞ Grid";
  refreshList();
}

function updateListMeta(visible: number, total: number, filter: FilterState) {
  if (hasActiveFilter(filter)) {
    listMetaEl.innerHTML = `<strong>${visible.toLocaleString("id-ID")}</strong> of ${total.toLocaleString("id-ID")} cards`;
  } else {
    listMetaEl.innerHTML = `<strong>${total.toLocaleString("id-ID")}</strong> cards`;
  }
}

function setupFilters() {
  if (filterRefs) return;
  filterBarEl.style.display = "";
  filterRefs = getFilterBarRefs();
  const options = extractUniqueOptions(allCards);
  populateDropdowns(filterRefs, options);
  attachFilterListeners(filterRefs, refreshList);
  filterRefs.clearBtn.addEventListener("click", () => {
    if (!filterRefs) return;
    resetFilters(filterRefs);
    refreshList();
  });

  document.querySelector<HTMLSelectElement>("#browseSort")
    ?.addEventListener("change", (e) => {
      browseSort = (e.target as HTMLSelectElement).value as BrowseSortKey;
      refreshList();
    });

  document.querySelector<HTMLButtonElement>("#browseViewToggle")
    ?.addEventListener("click", toggleBrowseView);
}

// ── Refresh collection overlay data ──────────────────────────────────────────

async function refreshCollectionOverlay() {
  collectionQtyMap = await getCollectionQtyMap(activeRegion);
  virtualList?.refresh();
  virtualGrid?.refresh();
}

// ── Fetch and cache ───────────────────────────────────────────────────────────

async function doFetchAndCacheEn(): Promise<void> {
  if (activeRegion === "EN") setStatus("Fetching EN cards from GitHub…", "loading");
  const result = await fetchFromGitHub();
  allEnCards = result.cards;
  if (activeRegion === "EN") { allCards = allEnCards; visibleCards = allCards; }
  const sha = await fetchLatestCommitSha();

  if (activeRegion === "EN") setStatus("Saving EN cards to cache…", "loading");
  await saveCards(result.cards);
  enMeta = {
    lastFetchAt: Date.now(), lastCommitSha: sha,
    cardCount: result.cards.length, sizeBytes: result.totalBytes,
  };
  await saveMeta(enMeta);

  if (activeRegion === "EN") {
    setupFilters();
    refreshList();
    setStatus(`✅ Fetched ${result.cards.length.toLocaleString("id-ID")} EN cards (${(result.fetchTimeMs + result.parseTimeMs).toFixed(0)} ms) + cached`, "success");
    renderStats({ count: result.cards.length, sizeBytes: result.totalBytes, fetchTimeMs: result.fetchTimeMs, parseTimeMs: result.parseTimeMs });
    renderCacheInfo(enMeta);
    updateListMeta(visibleCards.length, allCards.length, readFilterState(filterRefs!));
  }
}

async function doFetchAndCacheJp(): Promise<void> {
  if (activeRegion === "JP") setStatus("Fetching JP cards from GitHub…", "loading");
  const result = await fetchFromGitHubJp();
  allJpCards = result.cards;
  if (activeRegion === "JP") { allCards = allJpCards; visibleCards = allCards; }
  const sha = await fetchLatestCommitShaJp();

  if (activeRegion === "JP") setStatus("Saving JP cards to cache…", "loading");
  await saveCardsJp(result.cards);
  jpMeta = {
    lastFetchAt: Date.now(), lastCommitSha: sha,
    cardCount: result.cards.length, sizeBytes: result.totalBytes,
  };
  await saveMetaJp(jpMeta);

  if (activeRegion === "JP") {
    setupFilters();
    refreshList();
    setStatus(`✅ Fetched ${result.cards.length.toLocaleString("id-ID")} JP cards (${(result.fetchTimeMs + result.parseTimeMs).toFixed(0)} ms) + cached`, "success");
    renderStats({ count: result.cards.length, sizeBytes: result.totalBytes, fetchTimeMs: result.fetchTimeMs, parseTimeMs: result.parseTimeMs });
    renderCacheInfo(jpMeta);
    updateListMeta(visibleCards.length, allCards.length, readFilterState(filterRefs!));
  }
}

// ── Switch region (BOTH mode) ─────────────────────────────────────────────────

async function switchRegion(region: "EN" | "JP"): Promise<void> {
  if (activeRegion === region) return;
  activeRegion = region;
  allCards     = region === "JP" ? allJpCards : allEnCards;

  await saveSettings({ region_preference: regionPreference, last_active_region: region, migration_version: 1 });

  virtualList?.destroy(); virtualList = null;
  virtualGrid?.destroy(); virtualGrid = null;
  listContainer.innerHTML = "";
  selectedCardNo = null;

  if (filterRefs) {
    populateDropdowns(filterRefs, extractUniqueOptions(allCards));
  }
  refreshList();

  await Promise.all([
    loadCollectionTab(region, allCards),
    loadWishlistTab(region, allCards),
    refreshCollectionOverlay(),
  ]);

  tabNav?.switchTo("collection");
}

// ── Region button ─────────────────────────────────────────────────────────────

function updateRegionButton(): void {
  const btn = document.getElementById("regionBtn");
  if (!btn) return;
  btn.textContent = regionPreference === "BOTH"
    ? `${activeRegion} ▾`
    : regionPreference;
}

async function handleChangeRegion(): Promise<void> {
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

  tabNav?.setTabVisible("overview", regionPreference === "BOTH");
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
          setupFilters();
          refreshList();
          setStartupProgress(70);
          setStatus(`⚡ Loaded ${allEnCards.length.toLocaleString("id-ID")} EN cards from cache in ${loadMs.toFixed(0)} ms`, "success");
          renderStats({ count: allEnCards.length, sizeBytes: enMeta.sizeBytes, loadFromCacheMs: loadMs });
          renderCacheInfo(enMeta);
          updateListMeta(visibleCards.length, allCards.length, readFilterState(filterRefs!));
        }
        checkForUpdatesEn(enMeta).catch(() => {});
      } else {
        await doFetchAndCacheEn();
        setStartupProgress(70);
      }
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
          setupFilters();
          refreshList();
          setStartupProgress(70);
          setStatus(`⚡ Loaded ${allJpCards.length.toLocaleString("id-ID")} JP cards from cache in ${loadMs.toFixed(0)} ms`, "success");
          renderStats({ count: allJpCards.length, sizeBytes: jpMeta.sizeBytes, loadFromCacheMs: loadMs });
          renderCacheInfo(jpMeta);
          updateListMeta(visibleCards.length, allCards.length, readFilterState(filterRefs!));
        }
        checkForUpdatesJp(jpMeta).catch(() => {});
      } else {
        await doFetchAndCacheJp();
        setStartupProgress(70);
      }
    }

    // Safety: ensure allCards pointer is set (BOTH mode edge cases)
    if (allCards.length === 0) {
      allCards = activeRegion === "JP" ? allJpCards : allEnCards;
      if (allCards.length > 0 && !filterRefs) {
        setupFilters();
        refreshList();
      }
    }

    initCollectionTab(allCards, () => { refreshCollectionOverlay().catch(() => {}); });
    initWishlistTab(allCards);
    setStartupProgress(85);
    const mergedGroups = await deduplicateCollection();
    if (mergedGroups > 0) showToast(`Cleaned up ${mergedGroups} duplicate collection ${mergedGroups === 1 ? "entry" : "entries"}.`);
    await Promise.all([loadCollectionTab(activeRegion), loadWishlistTab(activeRegion), refreshCollectionOverlay()]);
    setStartupProgress(100);

  } catch (err) {
    setStartupProgress(100);
    setStatus(`❌ Failed: ${err instanceof Error ? err.message : String(err)}`, "error", () => handleForceRefresh());
    console.error(err);
  } finally {
    setControlsDisabled(false);
    updateBrowseTabState();
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
    updateBrowseTabState();
  }
}

async function handleClearCache() {
  const ok = await showConfirm("Clear card cache? The local card database will be removed. You'll need an internet connection to reload.");
  if (!ok) return;
  try {
    await Promise.all([clearCards(), clearMeta(), clearCardsJp(), clearMetaJp()]);
    allEnCards = []; allJpCards = []; allCards = []; enMeta = null; jpMeta = null;
    visibleCards = [];
    if (virtualList) virtualList.clear();
    filterBarEl.style.display = "none";
    filterRefs = null;
    setStatus("🗑️ Cache cleared.", "info");
    clearStats();
    renderCacheInfo(null);
    listMetaEl.textContent = "— cards";
  } catch (err) {
    setStatus(`❌ Clear failed: ${err instanceof Error ? err.message : String(err)}`, "error");
  }
}

function setControlsDisabled(disabled: boolean) {
  refreshBtn.disabled = disabled;
  clearBtn.disabled = disabled;
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  window.addEventListener("unhandledrejection", (e) => {
    const msg = e.reason instanceof Error ? e.reason.message : String(e.reason);
    showToast(`❌ ${msg}`, "error");
    e.preventDefault();
  });

  tabNav = new TabNav();

  tabNav.onTabSwitch((from, to) => {
    if (from === "browse")     cardPreview?.hide();
    if (from === "collection") closeCollectionPreview();
    if (from === "wishlist")   closeWishlistPreview();
    if (to === "overview") {
      loadOverviewTab(allEnCards, allJpCards, enMeta, jpMeta, activeRegion, (region) => {
        switchRegion(region).catch(() => {});
      }).catch(() => {});
    }
  });

  initOverviewTab();

  cardPreview = new CardPreview(previewPaneEl);
  cardPreview.setCallbacks({
    onCollectionChanged: async () => {
      await refreshCollectionOverlay();
      await loadCollectionTab(activeRegion);
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
      await Promise.all([loadCollectionTab(activeRegion), loadWishlistTab(activeRegion), refreshCollectionOverlay()]);
      const unknownMsg = result.unknownCount > 0
        ? ` (${result.unknownCount} unknown codes kept)`
        : "";
      showToast(
        `Imported ${(result as ImportResult).collectionCount} collection + ` +
        `${(result as ImportResult).wishlistCount} wishlist entries.${unknownMsg}`
      );
    }
  });

  document.getElementById("regionBtn")?.addEventListener("click", handleChangeRegion);
  document.getElementById("aboutBtn")?.addEventListener("click", showAboutDialog);

  initThemeToggle();
  initBackButton([
    {
      isOpen: () => cardPreview?.isLightboxOpen ?? false,
      close: () => cardPreview?.hideLightbox(),
    },
    {
      isOpen: () => cardPreview?.isOpen ?? false,
      close: () => cardPreview?.hide(),
    },
    {
      isOpen: () => document.getElementById("collectionPreviewPane")?.classList.contains("is-open") ?? false,
      close: () => closeCollectionPreview(),
    },
    {
      isOpen: () => document.getElementById("wishlistPreviewPane")?.classList.contains("is-open") ?? false,
      close: () => closeWishlistPreview(),
    },
  ]);

  refreshBtn.addEventListener("click", handleForceRefresh);
  clearBtn.addEventListener("click", handleClearCache);

  setupBrowseGuard();
  filterBarEl.style.display = "none";

  const meta = await loadFromCache().then((c) => c?.meta ?? null);
  renderCacheInfo(meta);
  listMetaEl.textContent = "— cards";

  await handleLoad();
}

init();
