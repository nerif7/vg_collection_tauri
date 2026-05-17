import type { Card, CollectionEntry } from "./types.ts";
import {
  getAllCollectionEntries,
  getAllWishlistEntries, getAllLocations, movePartial, removeCollectionEntry,
} from "./collection-db.ts";
import { showConfirm } from "./confirm-dialog.ts";
import { showContextMenu } from "./context-menu.ts";
import { VirtualList } from "./virtual-list.ts";
import { VirtualGrid } from "./virtual-grid.ts";
import { buildCollectionRow } from "./collection-row.ts";
import { buildCardTile } from "./card-tile.ts";
import { renderGroupedView } from "./collection-grouped.ts";
import { openLocationManager } from "./location-manager.ts";
import { buildEditSection } from "./collection-edit.ts";
import { addSwipeToDismiss } from "./swipe-dismiss.ts";
import { createStatsCollapsible } from "./stats-collapsible.ts";

// ── Types ──────────────────────────────────────────────────────────────────────

type CollectionSortKey = "loc-code" | "name" | "code" | "qty-desc" | "id-desc";
type CollectionViewMode = "list" | "grid" | "grouped";

// ── DOM refs ───────────────────────────────────────────────────────────────────

const statsEl       = document.getElementById("collectionStats")!;
const searchEl      = document.getElementById("collectionSearch") as HTMLInputElement;
const listMetaEl    = document.getElementById("collectionListMeta")!;
const listContainer = document.getElementById("collectionListContainer")!;
const previewPane   = document.getElementById("collectionPreviewPane")!;
const previewBody   = document.getElementById("collectionPreviewBody")!;
const previewClose  = document.getElementById("collectionPreviewClose")!;

// ── State ──────────────────────────────────────────────────────────────────────

let allEntries: CollectionEntry[] = [];
let visibleEntries: CollectionEntry[] = [];
let cardMap = new Map<string, Card>();
let selectedId: number | null = null;
let wishlistCount = 0;
let virtualList: VirtualList<CollectionEntry> | null = null;
let virtualGrid: VirtualGrid<CollectionEntry> | null = null;
let viewMode: CollectionViewMode = "list";
let collapsedGroups = new Set<string>();

// Filter/sort refs — wired in initCollectionTab
let sortEl:         HTMLSelectElement;
let locFilterEl:    HTMLSelectElement;
let nationFilterEl: HTMLSelectElement;
let typeFilterEl:   HTMLSelectElement;
let viewToggleBtn:  HTMLButtonElement;
let groupToggleBtn: HTMLButtonElement;

let onCollectionChanged: (() => void) | null = null;
let statsBody: HTMLElement | null = null;

// ── Init ───────────────────────────────────────────────────────────────────────

export function initCollectionTab(cards: Card[], onChange?: () => void): void {
  cardMap = new Map(cards.map((c) => [c.enCardNo, c]));
  onCollectionChanged = onChange ?? null;

  statsBody = createStatsCollapsible(statsEl);

  const previewHeader = previewPane.querySelector<HTMLElement>(".preview-header");
  if (previewHeader) addSwipeToDismiss(previewPane, previewHeader, closePreview);

  sortEl         = document.getElementById("collectionSort")       as HTMLSelectElement;
  locFilterEl    = document.getElementById("collectionLocFilter")   as HTMLSelectElement;
  nationFilterEl = document.getElementById("collectionNationFilter") as HTMLSelectElement;
  typeFilterEl   = document.getElementById("collectionTypeFilter")  as HTMLSelectElement;
  viewToggleBtn  = document.getElementById("collectionViewToggle")  as HTMLButtonElement;
  groupToggleBtn = document.getElementById("collectionGroupToggle") as HTMLButtonElement;

  previewClose.addEventListener("click", closePreview);

  document.getElementById("manageLocationsBtn")?.addEventListener("click", () => {
    openLocationManager(async () => {
      if (selectedId !== null) {
        const entry = allEntries.find((e) => e.id === selectedId);
        if (entry) await renderPreview(entry);
      }
    });
  });

  searchEl.addEventListener("input",       applyFilters);
  sortEl.addEventListener("change",        applyFilters);
  locFilterEl.addEventListener("change",   applyFilters);
  nationFilterEl.addEventListener("change", applyFilters);
  typeFilterEl.addEventListener("change",  applyFilters);

  viewToggleBtn.addEventListener("click", () => {
    setViewMode(viewMode === "grid" ? "list" : "grid");
    applyFilters();
  });

  groupToggleBtn.addEventListener("click", () => {
    setViewMode(viewMode === "grouped" ? "list" : "grouped");
    applyFilters();
  });

  setViewMode("list");
}

// ── View mode ──────────────────────────────────────────────────────────────────

function setViewMode(mode: CollectionViewMode): void {
  viewMode = mode;
  virtualList?.destroy(); virtualList = null;
  virtualGrid?.destroy(); virtualGrid = null;
  listContainer.innerHTML = "";

  viewToggleBtn.textContent  = mode === "grid" ? "☰ List" : "⊞ Grid";
  groupToggleBtn.textContent = mode === "grouped" ? "☰ Flat" : "≡ Grouped";
  groupToggleBtn.style.display = mode === "grid" ? "none" : "";

  if (mode === "list") {
    virtualList = new VirtualList<CollectionEntry>(listContainer, {
      rowHeight: 62,
      buffer: 8,
      renderRow: (entry, _i) =>
        buildCollectionRow(entry, cardMap.get(entry.cardCode), entry.id === selectedId),
      onRowClick: (entry) => {
        selectedId = entry.id ?? null;
        virtualList!.refresh();
        openPreview(entry);
      },
      onRowLongPress: (entry, _i, x, y) => {
        showContextMenu(x, y, [
          {
            label: "Edit",
            action: () => {
              selectedId = entry.id ?? null;
              virtualList?.refresh();
              openPreview(entry);
            },
          },
          {
            label: "Delete",
            danger: true,
            action: async () => {
              const ok = await showConfirm("Remove this entry from collection?");
              if (!ok) return;
              await removeCollectionEntry(entry.id!);
              allEntries = allEntries.filter((e) => e.id !== entry.id);
              applyFilters();
              renderStats();
              onCollectionChanged?.();
              if (selectedId === entry.id) closePreview();
            },
          },
        ]);
      },
      emptyMessage: "No cards in collection yet — add from Browse tab",
    });
  } else if (mode === "grid") {
    virtualGrid = new VirtualGrid<CollectionEntry>(listContainer, {
      cellHeight: 320,
      gap: 10,
      buffer: 3,
      renderCell: (entry) =>
        buildCardTile(cardMap.get(entry.cardCode), entry.id === selectedId, {
          badgeQty: entry.quantity,
          extraInfo: entry.location || "—",
        }),
      onCellClick: (entry) => {
        selectedId = entry.id ?? null;
        virtualGrid!.refresh();
        openPreview(entry);
      },
      emptyMessage: "No cards in collection yet — add from Browse tab",
    });
  }
}

// ── Load / refresh ─────────────────────────────────────────────────────────────

export async function loadCollectionTab(): Promise<void> {
  if (viewMode === "list") virtualList?.setSkeleton(8);

  const t0 = performance.now();
  const [entries, wishlist] = await Promise.all([
    getAllCollectionEntries(),
    getAllWishlistEntries(),
  ]);
  console.debug(`[perf] collection DB load: ${(performance.now() - t0).toFixed(1)} ms (${entries.length} entries)`);

  wishlistCount  = wishlist.length;
  allEntries     = entries;

  const t1 = performance.now();
  populateCollectionFilters();
  applyFilters();
  console.debug(`[perf] collection filter+render: ${(performance.now() - t1).toFixed(1)} ms`);

  renderStats();
}

function populateCollectionFilters(): void {
  const nations = new Set<string>();
  const types   = new Set<string>();
  const locs    = new Set<string>();

  for (const e of allEntries) {
    if (e.location) locs.add(e.location);
    const card = cardMap.get(e.cardCode);
    if (card) {
      for (const n of card.nations) nations.add(n);
      if (card.unitType) types.add(card.unitType);
    }
  }

  const curLoc    = locFilterEl?.value;
  const curNation = nationFilterEl?.value;
  const curType   = typeFilterEl?.value;

  const fill = (el: HTMLSelectElement, items: string[], label: string) => {
    el.innerHTML = `<option value="all">${label}</option>`;
    for (const v of [...items].sort()) {
      const opt = document.createElement("option");
      opt.value = v; opt.textContent = v;
      el.appendChild(opt);
    }
  };

  fill(locFilterEl,    [...locs],    "All locations");
  fill(nationFilterEl, [...nations], "All nations");
  fill(typeFilterEl,   [...types],   "All types");

  if (curLoc)    locFilterEl.value    = curLoc;
  if (curNation) nationFilterEl.value = curNation;
  if (curType)   typeFilterEl.value   = curType;
}

function sortEntries(entries: CollectionEntry[], key: CollectionSortKey): CollectionEntry[] {
  const arr = [...entries];
  switch (key) {
    case "loc-code":
      arr.sort((a, b) => {
        const l = a.location.localeCompare(b.location);
        return l !== 0 ? l : a.cardCode.localeCompare(b.cardCode);
      });
      break;
    case "name":
      arr.sort((a, b) => {
        const na = cardMap.get(a.cardCode)?.name ?? a.cardCode;
        const nb = cardMap.get(b.cardCode)?.name ?? b.cardCode;
        return na.localeCompare(nb);
      });
      break;
    case "code":
      arr.sort((a, b) => a.cardCode.localeCompare(b.cardCode));
      break;
    case "qty-desc":
      arr.sort((a, b) => b.quantity - a.quantity || a.cardCode.localeCompare(b.cardCode));
      break;
    case "id-desc":
      arr.sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
      break;
  }
  return arr;
}

function applyFilters(): void {
  const q      = searchEl?.value.trim().toLowerCase() ?? "";
  const loc    = locFilterEl?.value    ?? "all";
  const nation = nationFilterEl?.value ?? "all";
  const type   = typeFilterEl?.value   ?? "all";
  const key    = (sortEl?.value ?? "loc-code") as CollectionSortKey;

  let filtered = allEntries;

  if (q) {
    filtered = filtered.filter((e) => {
      const card = cardMap.get(e.cardCode);
      return (
        e.cardCode.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        (card?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }
  if (loc    !== "all") filtered = filtered.filter((e) => e.location === loc);
  if (nation !== "all") filtered = filtered.filter((e) => cardMap.get(e.cardCode)?.nations.includes(nation) ?? false);
  if (type   !== "all") filtered = filtered.filter((e) => cardMap.get(e.cardCode)?.unitType === type);

  visibleEntries = viewMode !== "grouped" ? sortEntries(filtered, key) : filtered;

  updateView();

  const hasFilter = q || loc !== "all" || nation !== "all" || type !== "all";
  listMetaEl.textContent = hasFilter
    ? `${visibleEntries.length} of ${allEntries.length} entries`
    : `${allEntries.length} entries`;
}

function updateView(): void {
  if (viewMode === "list") {
    virtualList?.setItems(visibleEntries);
  } else if (viewMode === "grid") {
    virtualGrid?.setItems(visibleEntries);
  } else {
    renderGroupedView(
      listContainer, visibleEntries, cardMap, collapsedGroups,
      (loc) => {
        if (collapsedGroups.has(loc)) collapsedGroups.delete(loc);
        else collapsedGroups.add(loc);
        updateView();
      },
      (entry) => { selectedId = entry.id ?? null; openPreview(entry); },
      selectedId,
    );
  }
}

function renderStats(): void {
  const uniqueCards = new Set(allEntries.map((e) => e.cardCode)).size;
  const totalCopies = allEntries.reduce((s, e) => s + e.quantity, 0);
  const locations   = new Set(allEntries.map((e) => e.location).filter((l) => l !== "")).size;

  statsBody!.innerHTML = [
    stat("Unique cards", uniqueCards.toLocaleString()),
    stat("Total copies", totalCopies.toLocaleString()),
    stat("Wishlist", wishlistCount.toLocaleString()),
    stat("Locations", locations.toLocaleString()),
  ].join("");
}

function stat(label: string, value: string): string {
  return `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
}

// ── Preview pane ───────────────────────────────────────────────────────────────

function closePreview(): void {
  previewPane.classList.remove("is-open");
  selectedId = null;
  virtualList?.refresh();
  virtualGrid?.refresh();
  if (viewMode === "grouped") updateView();
}

export function closeCollectionPreview(): void {
  closePreview();
}

async function openPreview(entry: CollectionEntry): Promise<void> {
  previewPane.classList.add("is-open");
  await renderPreview(entry);
}

async function renderPreview(entry: CollectionEntry): Promise<void> {
  const card = cardMap.get(entry.cardCode);
  const managerLocs = await getAllLocations();
  const entryLocs   = [...new Set(allEntries.map((e) => e.location).filter((l) => l !== ""))];
  const locations   = [...new Set([...managerLocs, ...entryLocs])].sort();

  previewBody.innerHTML = "";

  if (card?.imageUrlEn) {
    const wrap = document.createElement("div");
    wrap.className = "preview-image-wrap";
    const img = document.createElement("img");
    img.src = card.imageUrlEn; img.alt = card.name;
    img.className = "preview-image"; img.loading = "lazy"; img.decoding = "async";
    wrap.appendChild(img);
    previewBody.appendChild(wrap);
  }

  const info = document.createElement("div");
  info.className = "preview-info";
  const nameEl = document.createElement("div");
  nameEl.className = "preview-name";
  nameEl.textContent = card?.name ?? entry.cardCode;
  const codeEl = document.createElement("span");
  codeEl.className = "preview-code";
  codeEl.textContent = entry.cardCode;
  info.append(nameEl, codeEl);
  previewBody.appendChild(info);

  previewBody.appendChild(buildEditSection(entry, locations, {
    onQtyChanged: (updated) => {
      syncEntryInList(updated);
      renderStats();
      onCollectionChanged?.();
    },
    onRemoved: (id) => {
      allEntries = allEntries.filter((e) => e.id !== id);
      applyFilters(); renderStats(); closePreview();
      onCollectionChanged?.();
    },
    onMoved: async (entryAtCurrentQty, toLocation, qty) => {
      const isFullMove = qty >= entryAtCurrentQty.quantity;
      await movePartial(entryAtCurrentQty, toLocation, qty);
      await loadCollectionTab();
      onCollectionChanged?.();
      if (isFullMove) {
        closePreview();
      } else {
        const updated = allEntries.find((e) => e.id === entryAtCurrentQty.id);
        if (updated) { selectedId = updated.id ?? null; virtualList?.refresh(); virtualGrid?.refresh(); await openPreview(updated); }
        else closePreview();
      }
    },
  }));
}

function syncEntryInList(updated: CollectionEntry): void {
  const idx = allEntries.findIndex((e) => e.id === updated.id);
  if (idx !== -1) allEntries[idx] = { ...updated };
  applyFilters();
}

// ── Public: scroll to entry (called from Browse "Edit →") ─────────────────────

export function scrollToEntry(id: number): void {
  const idx = visibleEntries.findIndex((e) => e.id === id);
  if (idx === -1) return;
  selectedId = id;

  if (viewMode === "list") {
    virtualList?.scrollToIndex(idx);
    virtualList?.refresh();
  } else if (viewMode === "grid") {
    virtualGrid?.scrollToIndex(idx);
    virtualGrid?.refresh();
  } else {
    const entry = visibleEntries[idx];
    if (entry) {
      const loc = entry.location || "—";
      collapsedGroups.delete(loc);
      updateView();
    }
  }

  const entry = visibleEntries[idx];
  if (entry) openPreview(entry);
}
