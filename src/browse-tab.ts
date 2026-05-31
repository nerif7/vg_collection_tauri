import type { Card, CollectionEntry } from "./types.ts";
import type { BackPane } from "./back-button.ts";
import { VirtualList } from "./virtual-list.ts";
import { VirtualGrid } from "./virtual-grid.ts";
import { buildCardRow } from "./card-row.ts";
import { buildCardTile } from "./card-tile.ts";
import { CardPreview } from "./card-preview.ts";
import {
  applyFilters, extractUniqueOptions, hasActiveFilter, sortCards,
  type FilterState, type BrowseSortKey,
} from "./filters.ts";
import {
  getFilterBarRefs, populateDropdowns, readFilterState,
  resetFilters, attachFilterListeners, setFilterActiveIndicator,
  type FilterBarRefs,
} from "./filter-bar.ts";
import { showToast } from "./toast.ts";

export interface BrowseCallbacks {
  onCollectionChanged: () => Promise<void>;
  onWishlistChanged:   () => Promise<void>;
  onEditInCollection:  (entry: CollectionEntry) => void;
}

// ── DOM refs ──────────────────────────────────────────────────────────────────

const listContainer = document.querySelector<HTMLDivElement>("#cardListContainer")!;
const listMetaEl    = document.querySelector<HTMLDivElement>("#listMeta")!;
const filterBarEl   = document.querySelector<HTMLDivElement>("#filterBar")!;
const previewPaneEl = document.querySelector<HTMLElement>("#previewPane")!;

// ── State ─────────────────────────────────────────────────────────────────────

let _cards:       Card[] = [];
let _qtyMap:      Map<string, number> = new Map();
let visibleCards: Card[] = [];
let virtualList:  VirtualList<Card> | null = null;
let virtualGrid:  VirtualGrid<Card> | null = null;
let viewMode:     "list" | "grid" = "list";
let sortKey:      BrowseSortKey = "code";
let filterRefs:   FilterBarRefs | null = null;
let selectedCardNo: string | null = null;
let cardPreview:  CardPreview | null = null;

// ── Internal ──────────────────────────────────────────────────────────────────

function makeEmptyNode(): HTMLElement {
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
    refresh();
  });
  wrap.append(text, btn);
  return wrap;
}

function refresh(): void {
  if (!filterRefs) return;
  const filter = readFilterState(filterRefs);
  setFilterActiveIndicator(hasActiveFilter(filter));
  const filtered = applyFilters(_cards, filter);
  visibleCards = sortCards(filtered, sortKey, _qtyMap);

  if (viewMode === "list") {
    if (!virtualList) {
      virtualList = new VirtualList<Card>(listContainer, {
        rowHeight: 62,
        buffer: 8,
        renderRow: (card, _i) =>
          buildCardRow(card, _i, card.cardNo === selectedCardNo, _qtyMap.get(card.cardNo)),
        onRowClick: (card) => {
          selectedCardNo = card.cardNo;
          virtualList!.refresh();
          cardPreview!.show(card);
        },
        emptyNode: makeEmptyNode,
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
            badgeQty: _qtyMap.get(card.cardNo),
          }),
        onCellClick: (card) => {
          selectedCardNo = card.cardNo;
          virtualGrid!.refresh();
          cardPreview!.show(card);
        },
        emptyNode: makeEmptyNode,
      });
    }
    virtualGrid.setItems(visibleCards);
  }

  updateMeta(visibleCards.length, _cards.length, filter);
}

function toggleView(): void {
  virtualList?.destroy(); virtualList = null;
  virtualGrid?.destroy(); virtualGrid = null;
  listContainer.innerHTML = "";
  viewMode = viewMode === "list" ? "grid" : "list";
  const btn = document.querySelector<HTMLButtonElement>("#browseViewToggle");
  if (btn) btn.textContent = viewMode === "grid" ? "☰ List" : "⊞ Grid";
  refresh();
}

function updateMeta(visible: number, total: number, filter: FilterState): void {
  if (hasActiveFilter(filter)) {
    listMetaEl.innerHTML = `<strong>${visible.toLocaleString("id-ID")}</strong> of ${total.toLocaleString("id-ID")} cards`;
  } else {
    listMetaEl.innerHTML = `<strong>${total.toLocaleString("id-ID")}</strong> cards`;
  }
}

function setupFilters(): void {
  if (filterRefs) return;
  filterBarEl.style.display = "";
  filterRefs = getFilterBarRefs();
  populateDropdowns(filterRefs, extractUniqueOptions(_cards));
  attachFilterListeners(filterRefs, refresh);
  filterRefs.clearBtn.addEventListener("click", () => {
    if (!filterRefs) return;
    resetFilters(filterRefs);
    refresh();
  });
}

// ── Public API ────────────────────────────────────────────────────────────────

export function initBrowseTab(callbacks: BrowseCallbacks): void {
  cardPreview = new CardPreview(previewPaneEl);
  cardPreview.setCallbacks({
    onCollectionChanged: callbacks.onCollectionChanged,
    onWishlistChanged:   callbacks.onWishlistChanged,
    onEditInCollection:  callbacks.onEditInCollection,
  });

  document.querySelector<HTMLButtonElement>('[data-tab="browse"]')
    ?.addEventListener("click", (e) => {
      if (_cards.length === 0) {
        e.stopImmediatePropagation();
        showToast("Card database unavailable. Connect to the internet and relaunch the app.");
      }
    }, { capture: true });

  document.querySelector<HTMLSelectElement>("#browseSort")
    ?.addEventListener("change", (e) => {
      sortKey = (e.target as HTMLSelectElement).value as BrowseSortKey;
      refresh();
    });

  document.querySelector<HTMLButtonElement>("#browseViewToggle")
    ?.addEventListener("click", toggleView);

  filterBarEl.style.display = "none";
  listMetaEl.textContent = "— cards";
}

// Initial load or background update for the active region.
export function loadBrowseTab(cards: Card[], qtyMap: Map<string, number>): void {
  _cards = cards;
  _qtyMap = qtyMap;
  if (_cards.length > 0) {
    setupFilters();
    refresh();
  }
  updateBrowseAvailability();
}

// Region switch — destroys current list and repopulates filter dropdowns.
export function reloadBrowseTab(cards: Card[], qtyMap: Map<string, number>): void {
  _cards = cards;
  _qtyMap = qtyMap;
  virtualList?.destroy(); virtualList = null;
  virtualGrid?.destroy(); virtualGrid = null;
  listContainer.innerHTML = "";
  selectedCardNo = null;
  if (filterRefs) populateDropdowns(filterRefs, extractUniqueOptions(_cards));
  if (_cards.length > 0) {
    setupFilters();
    refresh();
  }
  updateBrowseAvailability();
}

// Light refresh — only qty badges change (collection mutated).
export function refreshBrowseQtyMap(qtyMap: Map<string, number>): void {
  _qtyMap = qtyMap;
  virtualList?.refresh();
  virtualGrid?.refresh();
}

export function clearBrowseTab(): void {
  _cards = []; _qtyMap = new Map(); visibleCards = [];
  virtualList?.clear();
  filterBarEl.style.display = "none";
  filterRefs = null;
  listMetaEl.textContent = "— cards";
  updateBrowseAvailability();
}

export function closeBrowsePreview(): void {
  cardPreview?.hide();
}

export function updateBrowseAvailability(): void {
  const browseBtn = document.querySelector<HTMLButtonElement>('[data-tab="browse"]');
  if (browseBtn) browseBtn.classList.toggle("tab-btn--unavailable", _cards.length === 0);

  const panel = document.getElementById("tabBrowse");
  if (!panel) return;
  const existing = panel.querySelector(".browse-unavailable");
  if (_cards.length === 0 && !existing) {
    const msg = document.createElement("div");
    msg.className = "browse-unavailable";
    msg.textContent = "Card database unavailable. Connect to the internet and relaunch the app.";
    panel.prepend(msg);
  } else if (_cards.length > 0 && existing) {
    existing.remove();
  }
}

export function getBrowseBackPanes(): BackPane[] {
  return [
    {
      isOpen: () => cardPreview?.isOpen ?? false,
      close:  () => cardPreview?.hide(),
    },
  ];
}
