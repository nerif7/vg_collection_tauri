/**
 * vg_collection_tauri — POC: search + filter + virtualized list
 *
 * Features:
 *   - Hybrid cache loader (IndexedDB)
 *   - Virtualized list (1ms render untuk 24k cards)
 *   - Filter bar: search, set, nation, unit type, trigger
 *   - Debounced search (200ms)
 *   - Active filter count + Clear button
 */

import type { Card, FetchResult } from "./types.ts";
import {
  saveCards, loadCards,
  saveMeta,  loadMeta,
  clearCards, clearMeta,
  formatRelativeTime, isCacheStale,
  type CacheMeta,
} from "./cache.ts";
import { VirtualList } from "./virtual-list.ts";
import { buildCardRow } from "./card-row.ts";
import { applyFilters, extractUniqueOptions, hasActiveFilter, type FilterState } from "./filters.ts";
import {
  getFilterBarRefs, populateDropdowns, readFilterState,
  resetFilters, attachFilterListeners,
  type FilterBarRefs,
} from "./filter-bar.ts";
import { CardPreview } from "./card-preview.ts";
import "./styles.css";

const DB_URL     = "https://raw.githubusercontent.com/nerif7/vanguard-library-db/main/cards.json";
const COMMIT_API = "https://api.github.com/repos/nerif7/vanguard-library-db/commits?path=cards.json&per_page=1";

// ── State ─────────────────────────────────────────────────────────────────────
let allCards: Card[] = [];
let visibleCards: Card[] = [];
let virtualList: VirtualList<Card> | null = null;
let filterRefs: FilterBarRefs | null = null;
let selectedCardNo: string | null = null;
let cardPreview: CardPreview | null = null;

// ── DOM refs (non-filter) ─────────────────────────────────────────────────────
const refreshBtn    = document.querySelector<HTMLButtonElement>("#refreshBtn")!;
const clearBtn      = document.querySelector<HTMLButtonElement>("#clearBtn")!;
const statusEl      = document.querySelector<HTMLDivElement>("#status")!;
const statsEl       = document.querySelector<HTMLDivElement>("#stats")!;
const cacheInfoEl   = document.querySelector<HTMLDivElement>("#cacheInfo")!;
const listContainer = document.querySelector<HTMLDivElement>("#cardListContainer")!;
const listMetaEl    = document.querySelector<HTMLDivElement>("#listMeta")!;
const filterBarEl   = document.querySelector<HTMLDivElement>("#filterBar")!;
const previewPaneEl = document.querySelector<HTMLElement>("#previewPane")!;

// ── Fetch from GitHub ─────────────────────────────────────────────────────────

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

  return {
    cards: parsed,
    totalBytes,
    fetchTimeMs: fetchEnd - fetchStart,
    parseTimeMs: parseEnd - parseStart,
  };
}

async function fetchLatestCommitSha(): Promise<string | null> {
  try {
    const res = await fetch(COMMIT_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data[0]?.sha ? data[0].sha : null;
  } catch {
    return null;
  }
}

async function loadFromCache(): Promise<{ cards: Card[]; meta: CacheMeta } | null> {
  const [cachedCards, meta] = await Promise.all([loadCards(), loadMeta()]);
  if (!cachedCards || cachedCards.length === 0 || !meta) return null;
  return { cards: cachedCards, meta };
}

// ── Render helpers ────────────────────────────────────────────────────────────

function setStatus(msg: string, kind: "info" | "loading" | "success" | "error" = "info") {
  statusEl.textContent = msg;
  statusEl.className = `status status-${kind}`;
}

function renderStats(opts: {
  count: number;
  sizeBytes: number;
  fetchTimeMs?: number;
  parseTimeMs?: number;
  loadFromCacheMs?: number;
  renderTimeMs?: number;
}) {
  const mb = (opts.sizeBytes / 1024 / 1024).toFixed(2);
  const cells: string[] = [
    `<div class="stat"><span class="stat-label">Total kartu</span><span class="stat-value">${opts.count.toLocaleString("id-ID")}</span></div>`,
    `<div class="stat"><span class="stat-label">Ukuran data</span><span class="stat-value">${mb} MB</span></div>`,
  ];

  if (opts.fetchTimeMs !== undefined)     cells.push(`<div class="stat"><span class="stat-label">Fetch time</span><span class="stat-value">${opts.fetchTimeMs.toFixed(0)} ms</span></div>`);
  if (opts.parseTimeMs !== undefined)     cells.push(`<div class="stat"><span class="stat-label">Parse time</span><span class="stat-value">${opts.parseTimeMs.toFixed(0)} ms</span></div>`);
  if (opts.loadFromCacheMs !== undefined) cells.push(`<div class="stat"><span class="stat-label">Load cache</span><span class="stat-value">${opts.loadFromCacheMs.toFixed(0)} ms ⚡</span></div>`);
  if (opts.renderTimeMs !== undefined)    cells.push(`<div class="stat"><span class="stat-label">Render list</span><span class="stat-value">${opts.renderTimeMs.toFixed(0)} ms 🚀</span></div>`);

  statsEl.innerHTML = cells.join("");
}

function renderCacheInfo(meta: CacheMeta | null) {
  if (!meta) {
    cacheInfoEl.innerHTML = `<span class="cache-empty">📭 Cache kosong</span>`;
    return;
  }
  const stale = isCacheStale(meta);
  cacheInfoEl.innerHTML = `
    <div class="cache-row">
      <span class="cache-label">${stale ? "⏰" : "✨"} Cache:</span>
      <span class="cache-value">${meta.cardCount.toLocaleString("id-ID")} kartu, ${(meta.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
    </div>
    <div class="cache-row">
      <span class="cache-label">Last fetch:</span>
      <span class="cache-value">${formatRelativeTime(meta.lastFetchAt)} <span class="cache-status">(${stale ? "Stale" : "Fresh"})</span></span>
    </div>
  `;
}

function setupVirtualList() {
  if (virtualList) return;
  virtualList = new VirtualList<Card>(listContainer, {
    rowHeight: 62,
    buffer:    8,
    renderRow: (card, index) => buildCardRow(card, index, card.enCardNo === selectedCardNo),
    onRowClick: (card) => {
      selectedCardNo = card.enCardNo;
      virtualList!.refresh();
      cardPreview!.show(card);
    },
    emptyMessage: "Tidak ada kartu yang match filter",
  });
}

/** Re-apply filters dan update list. */
function refreshList() {
  if (!filterRefs) return;

  const filterStart = performance.now();
  const filter = readFilterState(filterRefs);
  visibleCards = applyFilters(allCards, filter);
  const filterTime = performance.now() - filterStart;

  setupVirtualList();
  const renderStart = performance.now();
  virtualList!.setItems(visibleCards);
  const renderTime = performance.now() - renderStart;

  updateListMeta(visibleCards.length, allCards.length, filterTime + renderTime, filter);
}

function updateListMeta(
  visible: number,
  total: number,
  durationMs: number,
  filter: FilterState,
) {
  const active = hasActiveFilter(filter);
  if (active) {
    listMetaEl.innerHTML = `
      <strong>${visible.toLocaleString("id-ID")}</strong> dari ${total.toLocaleString("id-ID")} kartu
      <span class="meta-extra">(filter+render: ${durationMs.toFixed(1)} ms)</span>
    `;
  } else {
    listMetaEl.innerHTML = `
      <strong>${total.toLocaleString("id-ID")}</strong> kartu
      <span class="meta-extra">(scroll untuk explore)</span>
    `;
  }
}

// ── Setup filters when cards are loaded ───────────────────────────────────────

function setupFilters() {
  if (filterRefs) return; // already setup

  filterBarEl.style.display = ""; // show filter bar
  filterRefs = getFilterBarRefs();

  const options = extractUniqueOptions(allCards);
  populateDropdowns(filterRefs, options);

  attachFilterListeners(filterRefs, refreshList);

  // Clear button handler
  filterRefs.clearBtn.addEventListener("click", () => {
    if (!filterRefs) return;
    resetFilters(filterRefs);
    refreshList();
  });
}

// ── Main load handlers ────────────────────────────────────────────────────────

async function handleLoad() {
  setControlsDisabled(true);
  setStatus("Loading...", "loading");
  statsEl.innerHTML = "";

  try {
    const startLoad = performance.now();
    const cached = await loadFromCache();
    const loadTime = performance.now() - startLoad;

    if (cached) {
      allCards = cached.cards;
      visibleCards = allCards;

      setupFilters();
      setupVirtualList();

      const renderStart = performance.now();
      virtualList!.setItems(visibleCards);
      const renderTime = performance.now() - renderStart;

      setStatus(
        `⚡ Loaded ${allCards.length.toLocaleString("id-ID")} cards from cache in ${loadTime.toFixed(0)} ms`,
        "success",
      );
      renderStats({
        count: allCards.length,
        sizeBytes: cached.meta.sizeBytes,
        loadFromCacheMs: loadTime,
        renderTimeMs: renderTime,
      });
      renderCacheInfo(cached.meta);
      updateListMeta(visibleCards.length, allCards.length, renderTime, readFilterState(filterRefs!));
    } else {
      await doFetchAndCache();
    }
  } catch (err) {
    setStatus(`❌ Failed: ${err instanceof Error ? err.message : String(err)}`, "error");
    console.error(err);
  } finally {
    setControlsDisabled(false);
  }
}

async function doFetchAndCache() {
  setStatus("Fetching from GitHub...", "loading");

  const result = await fetchFromGitHub();
  allCards = result.cards;
  visibleCards = allCards;
  const sha = await fetchLatestCommitSha();

  setStatus("Saving to cache...", "loading");
  await saveCards(result.cards);
  const meta: CacheMeta = {
    lastFetchAt:   Date.now(),
    lastCommitSha: sha,
    cardCount:     result.cards.length,
    sizeBytes:     result.totalBytes,
  };
  await saveMeta(meta);

  setupFilters();
  setupVirtualList();

  const renderStart = performance.now();
  virtualList!.setItems(visibleCards);
  const renderTime = performance.now() - renderStart;

  setStatus(
    `✅ Fetched ${result.cards.length.toLocaleString("id-ID")} cards (${(result.fetchTimeMs + result.parseTimeMs).toFixed(0)} ms) + cached`,
    "success",
  );
  renderStats({
    count: result.cards.length,
    sizeBytes: result.totalBytes,
    fetchTimeMs: result.fetchTimeMs,
    parseTimeMs: result.parseTimeMs,
    renderTimeMs: renderTime,
  });
  renderCacheInfo(meta);
  updateListMeta(visibleCards.length, allCards.length, renderTime, readFilterState(filterRefs!));
}

async function handleForceRefresh() {
  setControlsDisabled(true);
  statsEl.innerHTML = "";

  try {
    await doFetchAndCache();
  } catch (err) {
    setStatus(`❌ Refresh failed: ${err instanceof Error ? err.message : String(err)}`, "error");
  } finally {
    setControlsDisabled(false);
  }
}

async function handleClearCache() {
  if (!confirm("Hapus semua cache?")) return;

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
    listMetaEl.innerHTML = "— kartu";
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
  cardPreview = new CardPreview(previewPaneEl);

  refreshBtn.addEventListener("click", handleForceRefresh);
  clearBtn.addEventListener("click", handleClearCache);

  filterBarEl.style.display = "none";

  const meta = await loadMeta();
  renderCacheInfo(meta);
  listMetaEl.innerHTML = "— kartu";

  await handleLoad();
}

init();
