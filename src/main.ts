import type { Card, FetchResult } from "./types.ts";
import {
  saveCards, loadCards,
  saveMeta, loadMeta,
  clearCards, clearMeta,
  formatRelativeTime, isCacheStale,
  type CacheMeta,
} from "./cache.ts";
import { getCollectionQtyMap } from "./collection-db.ts";
import { VirtualList } from "./virtual-list.ts";
import { buildCardRow } from "./card-row.ts";
import { applyFilters, extractUniqueOptions, hasActiveFilter, sortCards, type FilterState, type BrowseSortKey } from "./filters.ts";
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
import "./styles.css";

const DB_URL     = "https://raw.githubusercontent.com/nerif7/vanguard-library-db/main/cards.json";
const COMMIT_API = "https://api.github.com/repos/nerif7/vanguard-library-db/commits?path=cards.json&per_page=1";

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
const refreshBtn      = document.querySelector<HTMLButtonElement>("#refreshBtn")!;
const clearBtn        = document.querySelector<HTMLButtonElement>("#clearBtn")!;
const updateSpinnerEl = document.querySelector<HTMLElement>("#updateSpinner")!;
const statusEl      = document.querySelector<HTMLDivElement>("#status")!;
const statsEl       = document.querySelector<HTMLDivElement>("#stats")!;
const cacheInfoEl   = document.querySelector<HTMLDivElement>("#cacheInfo")!;
const listContainer = document.querySelector<HTMLDivElement>("#cardListContainer")!;
const listMetaEl    = document.querySelector<HTMLDivElement>("#listMeta")!;
const filterBarEl   = document.querySelector<HTMLDivElement>("#filterBar")!;
const previewPaneEl = document.querySelector<HTMLElement>("#previewPane")!;

// ── Fetch helpers ─────────────────────────────────────────────────────────────

async function fetchFromGitHub(): Promise<FetchResult> {
  const fetchStart = performance.now();
  const response = await fetch(DB_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  const text = await response.text();
  const fetchEnd = performance.now();
  const totalBytes = new Blob([text]).size;
  const parseStart = performance.now();
  const parsed = JSON.parse(text) as Card[];
  const parseEnd = performance.now();
  return { cards: parsed, totalBytes, fetchTimeMs: fetchEnd - fetchStart, parseTimeMs: parseEnd - parseStart };
}

async function fetchLatestCommitSha(): Promise<string | null> {
  try {
    const res = await fetch(COMMIT_API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data[0]?.sha ? data[0].sha : null;
  } catch { return null; }
}

async function loadFromCache(): Promise<{ cards: Card[]; meta: CacheMeta } | null> {
  const [cachedCards, meta] = await Promise.all([loadCards(), loadMeta()]);
  if (!cachedCards || cachedCards.length === 0 || !meta) return null;
  return { cards: cachedCards, meta };
}

// ── Update check + toast ──────────────────────────────────────────────────────

function showUpdateSpinner(visible: boolean): void {
  updateSpinnerEl.hidden = !visible;
}

function showToast(msg: string): void {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast--visible"));
  setTimeout(() => {
    toast.classList.remove("toast--visible");
    setTimeout(() => toast.remove(), 250);
  }, 3500);
}

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

// ── Browse UI helpers ─────────────────────────────────────────────────────────

function setStatus(msg: string, kind: "info" | "loading" | "success" | "error" = "info") {
  statusEl.textContent = msg;
  statusEl.className = `status status-${kind}`;
}

function renderStats(opts: {
  count: number; sizeBytes: number;
  fetchTimeMs?: number; parseTimeMs?: number;
  loadFromCacheMs?: number; renderTimeMs?: number;
}) {
  const mb = (opts.sizeBytes / 1024 / 1024).toFixed(2);
  const cells: string[] = [
    cell("Total cards", opts.count.toLocaleString("id-ID")),
    cell("Data size", `${mb} MB`),
  ];
  if (opts.fetchTimeMs !== undefined)     cells.push(cell("Fetch time", `${opts.fetchTimeMs.toFixed(0)} ms`));
  if (opts.parseTimeMs !== undefined)     cells.push(cell("Parse time", `${opts.parseTimeMs.toFixed(0)} ms`));
  if (opts.loadFromCacheMs !== undefined) cells.push(cell("Load cache", `${opts.loadFromCacheMs.toFixed(0)} ms ⚡`));
  if (opts.renderTimeMs !== undefined)    cells.push(cell("Render list", `${opts.renderTimeMs.toFixed(0)} ms 🚀`));
  statsEl.innerHTML = cells.join("");
}

function cell(label: string, value: string): string {
  return `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
}

function renderCacheInfo(meta: CacheMeta | null) {
  if (!meta) {
    cacheInfoEl.innerHTML = `<span class="cache-empty">Cache empty</span>`;
    return;
  }
  const stale = isCacheStale(meta);
  cacheInfoEl.innerHTML = `
    <div class="cache-row">
      <span class="cache-label">${stale ? "⏰" : "✨"} Cache:</span>
      <span class="cache-value">${meta.cardCount.toLocaleString("id-ID")} cards, ${(meta.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
    </div>
    <div class="cache-row">
      <span class="cache-label">Last fetch:</span>
      <span class="cache-value">${formatRelativeTime(meta.lastFetchAt)} <span class="cache-status">(${stale ? "Stale" : "Fresh"})</span></span>
    </div>
  `;
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
        cellHeight: 200,
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
  setControlsDisabled(true);
  setStatus("Loading…", "loading");
  statsEl.innerHTML = "";

  try {
    const startLoad = performance.now();
    const cached = await loadFromCache();
    const loadTime = performance.now() - startLoad;

    if (cached) {
      allCards = cached.cards;
      visibleCards = allCards;

      setupFilters();
      refreshList();

      setStatus(`⚡ Loaded ${allCards.length.toLocaleString("id-ID")} cards from cache in ${loadTime.toFixed(0)} ms`, "success");
      renderStats({ count: allCards.length, sizeBytes: cached.meta.sizeBytes, loadFromCacheMs: loadTime });
      renderCacheInfo(cached.meta);
      updateListMeta(visibleCards.length, allCards.length, readFilterState(filterRefs!));

      // Non-blocking SHA check — auto-refresh if cards.json has changed
      checkForUpdates(cached.meta).catch(() => {});
    } else {
      await doFetchAndCache();
    }

    // After cards are loaded, init collection + wishlist tabs
    initCollectionTab(allCards);
    initWishlistTab(allCards);
    await Promise.all([loadCollectionTab(), loadWishlistTab(), refreshCollectionOverlay()]);

  } catch (err) {
    setStatus(`❌ Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    console.error(err);
  } finally {
    setControlsDisabled(false);
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
  statsEl.innerHTML = "";
  try { await doFetchAndCache(); }
  catch (err) { setStatus(`❌ Refresh failed: ${err instanceof Error ? err.message : String(err)}`, "error"); }
  finally { setControlsDisabled(false); }
}

async function handleClearCache() {
  if (!confirm("Clear card cache?")) return;
  try {
    await Promise.all([clearCards(), clearMeta()]);
    allCards = [];
    visibleCards = [];
    if (virtualList) virtualList.clear();
    filterBarEl.style.display = "none";
    filterRefs = null;
    setStatus("🗑️ Cache cleared.", "info");
    statsEl.innerHTML = "";
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
  tabNav = new TabNav();

  // Close preview panes on tab switch
  tabNav.onTabSwitch((from, _to) => {
    if (from === "browse") cardPreview?.hide();
    if (from === "collection") closeCollectionPreview();
    if (from === "wishlist") closeWishlistPreview();
  });

  // Wire preview pane for Browse tab
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

  // Export/Import buttons (stub — Tauri commands wired in later)
  document.getElementById("exportBtn")?.addEventListener("click", () => {
    alert("Export: coming soon");
  });
  document.getElementById("importBtn")?.addEventListener("click", () => {
    alert("Import: coming soon");
  });

  refreshBtn.addEventListener("click", handleForceRefresh);
  clearBtn.addEventListener("click", handleClearCache);

  filterBarEl.style.display = "none";

  const meta = await loadMeta();
  renderCacheInfo(meta);
  listMetaEl.textContent = "— cards";

  await handleLoad();
}

init();
