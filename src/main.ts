import type { Card } from "./types.ts";
import {
  saveCards, saveMeta, clearCards, clearMeta,
  fetchFromGitHub, fetchLatestCommitSha, loadFromCache,
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
  resetFilters, attachFilterListeners,
  type FilterBarRefs,
} from "./filter-bar.ts";
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
  closeWishlistPreview, refreshWishlistTab,
} from "./wishlist-tab.ts";
import { exportBackup, importBackup, type ImportResult } from "./export-import.ts";
import { showConfirm } from "./confirm-dialog.ts";
import { showAboutDialog } from "./about-dialog.ts";
import { showToast } from "./toast.ts";
import { initThemeToggle } from "./theme.ts";
import { initBackButton } from "./back-button.ts";
import {
  setStartupProgress, setStatus, renderStats, clearStats,
  renderCacheInfo, showUpdateSpinner,
} from "./browse-stats.ts";
import "./styles.css";

// ── State ─────────────────────────────────────────────────────────────────────
let allCards: Card[] = [];
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

async function checkForUpdates(meta: CacheMeta): Promise<void> {
  showUpdateSpinner(true);
  try {
    const latestSha = await fetchLatestCommitSha();
    if (!latestSha || latestSha === meta.lastCommitSha) return;
    await doFetchAndCache();
    showToast(`Cards updated — ${allCards.length.toLocaleString("id-ID")} cards loaded.`);
  } finally {
    showUpdateSpinner(false);
  }
}

// ── Browse virtual list ───────────────────────────────────────────────────────

function refreshList() {
  if (!filterRefs) return;
  const filter = readFilterState(filterRefs);
  const filtered = applyFilters(allCards, filter);
  visibleCards = sortCards(filtered, browseSort, collectionQtyMap);

  if (browseViewMode === "list") {
    if (!virtualList) {
      virtualList = new VirtualList<Card>(listContainer, {
        rowHeight: 62,
        buffer: 8,
        renderRow: (card, _i) =>
          buildCardRow(card, _i, card.enCardNo === selectedCardNo, collectionQtyMap.get(card.enCardNo)),
        onRowClick: (card) => {
          selectedCardNo = card.enCardNo;
          virtualList!.refresh();
          cardPreview!.show(card);
        },
        emptyMessage: "No cards match the filter",
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
          buildCardTile(card, card.enCardNo === selectedCardNo, {
            badgeQty: collectionQtyMap.get(card.enCardNo),
          }),
        onCellClick: (card) => {
          selectedCardNo = card.enCardNo;
          virtualGrid!.refresh();
          cardPreview!.show(card);
        },
        emptyMessage: "No cards match the filter",
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
  collectionQtyMap = await getCollectionQtyMap();
  virtualList?.refresh();
  virtualGrid?.refresh();
}

// ── Load handlers ─────────────────────────────────────────────────────────────

async function handleLoad() {
  setStartupProgress(5);
  setControlsDisabled(true);
  setStatus("Loading…", "loading");
  clearStats();

  try {
    const startLoad = performance.now();
    setStartupProgress(15);
    const cached = await loadFromCache();
    const loadTime = performance.now() - startLoad;

    if (cached) {
      allCards = cached.cards;
      visibleCards = allCards;
      setStartupProgress(50);

      setupFilters();
      refreshList();
      setStartupProgress(70);

      setStatus(`⚡ Loaded ${allCards.length.toLocaleString("id-ID")} cards from cache in ${loadTime.toFixed(0)} ms`, "success");
      renderStats({ count: allCards.length, sizeBytes: cached.meta.sizeBytes, loadFromCacheMs: loadTime });
      renderCacheInfo(cached.meta);
      updateListMeta(visibleCards.length, allCards.length, readFilterState(filterRefs!));

      checkForUpdates(cached.meta).catch(() => {});
    } else {
      await doFetchAndCache();
      setStartupProgress(70);
    }

    initCollectionTab(allCards, () => { refreshCollectionOverlay().catch(() => {}); });
    initWishlistTab(allCards);
    setStartupProgress(85);
    const mergedGroups = await deduplicateCollection();
    if (mergedGroups > 0) showToast(`Cleaned up ${mergedGroups} duplicate collection ${mergedGroups === 1 ? "entry" : "entries"}.`);
    await Promise.all([loadCollectionTab(), loadWishlistTab(), refreshCollectionOverlay()]);
    setStartupProgress(100);

  } catch (err) {
    setStartupProgress(100);
    setStatus(`❌ Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    console.error(err);
  } finally {
    setControlsDisabled(false);
    updateBrowseTabState();
    document.getElementById("fouc-guard")?.remove();
  }
}

async function doFetchAndCache() {
  setStatus("Fetching from GitHub…", "loading");
  const result = await fetchFromGitHub();
  allCards = result.cards;
  visibleCards = allCards;
  const sha = await fetchLatestCommitSha();

  setStatus("Saving to cache…", "loading");
  await saveCards(result.cards);
  const meta: CacheMeta = {
    lastFetchAt: Date.now(), lastCommitSha: sha,
    cardCount: result.cards.length, sizeBytes: result.totalBytes,
  };
  await saveMeta(meta);

  setupFilters();
  refreshList();

  setStatus(`✅ Fetched ${result.cards.length.toLocaleString("id-ID")} cards (${(result.fetchTimeMs + result.parseTimeMs).toFixed(0)} ms) + cached`, "success");
  renderStats({ count: result.cards.length, sizeBytes: result.totalBytes, fetchTimeMs: result.fetchTimeMs, parseTimeMs: result.parseTimeMs });
  renderCacheInfo(meta);
  updateListMeta(visibleCards.length, allCards.length, readFilterState(filterRefs!));
}

async function handleForceRefresh() {
  setControlsDisabled(true);
  clearStats();
  try { await doFetchAndCache(); }
  catch (err) { setStatus(`❌ Refresh failed: ${err instanceof Error ? err.message : String(err)}`, "error"); }
  finally { setControlsDisabled(false); updateBrowseTabState(); }
}

async function handleClearCache() {
  const ok = await showConfirm("Clear card cache? The local card database will be removed. You'll need an internet connection to reload.");
  if (!ok) return;
  try {
    await Promise.all([clearCards(), clearMeta()]);
    allCards = [];
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

  tabNav.onTabSwitch((from, _to) => {
    if (from === "browse") cardPreview?.hide();
    if (from === "collection") closeCollectionPreview();
    if (from === "wishlist") closeWishlistPreview();
  });

  cardPreview = new CardPreview(previewPaneEl);
  cardPreview.setCallbacks({
    onCollectionChanged: async () => {
      await refreshCollectionOverlay();
      await loadCollectionTab();
    },
    onWishlistChanged: async () => {
      await refreshWishlistTab();
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
    const cardSet = new Set(allCards.map((c) => c.enCardNo));
    const result = await importBackup(cardSet);
    if (result === "browser") {
      alert("Import requires the desktop app.");
    } else if (result === "invalid") {
      alert("Import failed: invalid or unrecognised backup file.");
    } else if (typeof result === "object") {
      await Promise.all([loadCollectionTab(), loadWishlistTab(), refreshCollectionOverlay()]);
      const unknownMsg = result.unknownCount > 0
        ? ` (${result.unknownCount} unknown codes kept)`
        : "";
      showToast(
        `Imported ${(result as ImportResult).collectionCount} collection + ` +
        `${(result as ImportResult).wishlistCount} wishlist entries.${unknownMsg}`
      );
    }
  });

  document.getElementById("aboutBtn")?.addEventListener("click", showAboutDialog);

  initThemeToggle();
  initBackButton([
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
