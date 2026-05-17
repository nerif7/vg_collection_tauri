import type { Card, WishlistEntry } from "./types.ts";
import { getAllWishlistEntries, removeFromWishlist } from "./collection-db.ts";
import { VirtualList } from "./virtual-list.ts";
import { VirtualGrid } from "./virtual-grid.ts";
import { buildCardTile } from "./card-tile.ts";
import { addSwipeToDismiss } from "./swipe-dismiss.ts";
import { createStatsCollapsible } from "./stats-collapsible.ts";
import { buildWishlistRow } from "./wishlist-row.ts";

type WishlistSortKey = "name" | "code" | "nation";
type WishlistViewMode = "list" | "grid";

// ── DOM refs ───────────────────────────────────────────────────────────────────

const statsEl       = document.getElementById("wishlistStats")!;
const listContainer = document.getElementById("wishlistListContainer")!;
const previewPane   = document.getElementById("wishlistPreviewPane")!;
const previewBody   = document.getElementById("wishlistPreviewBody")!;
const previewClose  = document.getElementById("wishlistPreviewClose")!;

// ── State ──────────────────────────────────────────────────────────────────────

let allEntries: WishlistEntry[] = [];
let visibleEntries: WishlistEntry[] = [];
let cardMap = new Map<string, Card>();
let selectedCode: string | null = null;
let virtualList: VirtualList<WishlistEntry> | null = null;
let virtualGrid: VirtualGrid<WishlistEntry> | null = null;
let viewMode: WishlistViewMode = "list";

// Filter/sort refs — wired in initWishlistTab
let searchEl:      HTMLInputElement;
let sortEl:        HTMLSelectElement;
let nationFilterEl: HTMLSelectElement;
let typeFilterEl:  HTMLSelectElement;
let viewToggleBtn: HTMLButtonElement;

let statsBody: HTMLElement | null = null;

// ── Init ───────────────────────────────────────────────────────────────────────

export function initWishlistTab(cards: Card[]): void {
  cardMap = new Map(cards.map((c) => [c.enCardNo, c]));

  statsBody = createStatsCollapsible(statsEl);

  const previewHeader = previewPane.querySelector<HTMLElement>(".preview-header");
  if (previewHeader) addSwipeToDismiss(previewPane, previewHeader, closePreview);

  searchEl      = document.getElementById("wishlistSearch")       as HTMLInputElement;
  sortEl        = document.getElementById("wishlistSort")         as HTMLSelectElement;
  nationFilterEl = document.getElementById("wishlistNationFilter") as HTMLSelectElement;
  typeFilterEl  = document.getElementById("wishlistTypeFilter")   as HTMLSelectElement;
  viewToggleBtn = document.getElementById("wishlistViewToggle")   as HTMLButtonElement;

  previewClose.addEventListener("click", closePreview);

  searchEl.addEventListener("input",        applyFilters);
  sortEl.addEventListener("change",         applyFilters);
  nationFilterEl.addEventListener("change", applyFilters);
  typeFilterEl.addEventListener("change",   applyFilters);

  viewToggleBtn.addEventListener("click", () => {
    setViewMode(viewMode === "grid" ? "list" : "grid");
    applyFilters();
  });

  setViewMode("list");
}

// ── View mode ──────────────────────────────────────────────────────────────────

function setViewMode(mode: WishlistViewMode): void {
  viewMode = mode;
  virtualList?.destroy(); virtualList = null;
  virtualGrid?.destroy(); virtualGrid = null;
  listContainer.innerHTML = "";

  viewToggleBtn.textContent = mode === "grid" ? "☰ List" : "⊞ Grid";

  if (mode === "list") {
    virtualList = new VirtualList<WishlistEntry>(listContainer, {
      rowHeight: 62,
      buffer: 8,
      renderRow: (entry) => buildWishlistRow(entry, cardMap.get(entry.cardCode), entry.cardCode === selectedCode),
      onRowClick: (entry) => {
        selectedCode = entry.cardCode;
        virtualList!.refresh();
        openPreview(entry);
      },
      emptyMessage: "Wishlist is empty — add cards from Browse tab",
    });
  } else {
    virtualGrid = new VirtualGrid<WishlistEntry>(listContainer, {
      cellHeight: 320,
      gap: 10,
      buffer: 3,
      renderCell: (entry) =>
        buildCardTile(cardMap.get(entry.cardCode), entry.cardCode === selectedCode),
      onCellClick: (entry) => {
        selectedCode = entry.cardCode;
        virtualGrid!.refresh();
        openPreview(entry);
      },
      emptyMessage: "Wishlist is empty — add cards from Browse tab",
    });
  }
}

// ── Load / refresh ─────────────────────────────────────────────────────────────

export async function loadWishlistTab(): Promise<void> {
  if (viewMode === "list") virtualList?.setSkeleton(6);

  const t0 = performance.now();
  allEntries = await getAllWishlistEntries();
  console.debug(`[perf] wishlist DB load: ${(performance.now() - t0).toFixed(1)} ms (${allEntries.length} entries)`);

  populateWishlistFilters();
  applyFilters();
  renderStats();
}

function populateWishlistFilters(): void {
  const nations = new Set<string>();
  const types   = new Set<string>();

  for (const e of allEntries) {
    const card = cardMap.get(e.cardCode);
    if (card) {
      for (const n of card.nations) nations.add(n);
      if (card.unitType) types.add(card.unitType);
    }
  }

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

  fill(nationFilterEl, [...nations], "All nations");
  fill(typeFilterEl,   [...types],   "All types");

  if (curNation) nationFilterEl.value = curNation;
  if (curType)   typeFilterEl.value   = curType;
}

function sortWishlist(entries: WishlistEntry[], key: WishlistSortKey): WishlistEntry[] {
  const arr = [...entries];
  switch (key) {
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
    case "nation":
      arr.sort((a, b) => {
        const na = cardMap.get(a.cardCode)?.nations[0] ?? "";
        const nb = cardMap.get(b.cardCode)?.nations[0] ?? "";
        return na.localeCompare(nb) || a.cardCode.localeCompare(b.cardCode);
      });
      break;
  }
  return arr;
}

function applyFilters(): void {
  const q      = searchEl?.value.trim().toLowerCase() ?? "";
  const nation = nationFilterEl?.value ?? "all";
  const type   = typeFilterEl?.value   ?? "all";
  const key    = (sortEl?.value ?? "name") as WishlistSortKey;

  let filtered = allEntries;

  if (q) {
    filtered = filtered.filter((e) => {
      const card = cardMap.get(e.cardCode);
      return (
        e.cardCode.toLowerCase().includes(q) ||
        (card?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }
  if (nation !== "all") filtered = filtered.filter((e) => cardMap.get(e.cardCode)?.nations.includes(nation) ?? false);
  if (type   !== "all") filtered = filtered.filter((e) => cardMap.get(e.cardCode)?.unitType === type);

  visibleEntries = sortWishlist(filtered, key);

  if (viewMode === "list") virtualList?.setItems(visibleEntries);
  else virtualGrid?.setItems(visibleEntries);
}

function renderStats(): void {
  statsBody!.innerHTML = `<div class="stat"><span class="stat-label">Wishlist</span><span class="stat-value">${allEntries.length.toLocaleString()}</span></div>`;
}

// ── Preview pane ───────────────────────────────────────────────────────────────

function closePreview(): void {
  previewPane.classList.remove("is-open");
  selectedCode = null;
  virtualList?.refresh();
  virtualGrid?.refresh();
}

export function closeWishlistPreview(): void {
  closePreview();
}

function openPreview(entry: WishlistEntry): void {
  previewPane.classList.add("is-open");
  renderPreview(entry);
}

function renderPreview(entry: WishlistEntry): void {
  const card = cardMap.get(entry.cardCode);
  previewBody.innerHTML = "";

  if (card?.imageUrlEn) {
    const wrap = document.createElement("div");
    wrap.className = "preview-image-wrap";
    const img = document.createElement("img");
    img.src = card.imageUrlEn; img.alt = card.name;
    img.className = "preview-image"; img.loading = "lazy";
    wrap.appendChild(img);
    previewBody.appendChild(wrap);
  }

  const info = document.createElement("div");
  info.className = "preview-info";
  const nameEl = document.createElement("div");
  nameEl.className = "preview-name"; nameEl.textContent = card?.name ?? entry.cardCode;
  const codeEl = document.createElement("span");
  codeEl.className = "preview-code"; codeEl.textContent = entry.cardCode;
  info.append(nameEl, codeEl);
  previewBody.appendChild(info);

  const removeBtn = document.createElement("button");
  removeBtn.className = "btn-danger btn-remove-collection";
  removeBtn.textContent = "Remove from Wishlist"; removeBtn.type = "button";
  removeBtn.addEventListener("click", async () => {
    await removeFromWishlist(entry.cardCode);
    allEntries = allEntries.filter((e) => e.cardCode !== entry.cardCode);
    visibleEntries = visibleEntries.filter((e) => e.cardCode !== entry.cardCode);
    if (viewMode === "list") virtualList?.setItems(visibleEntries);
    else virtualGrid?.setItems(visibleEntries);
    renderStats();
    closePreview();
  });
  previewBody.appendChild(removeBtn);
}

// ── Public refresh (called after wishlist changes from Browse tab) ─────────────

export async function refreshWishlistTab(): Promise<void> {
  await loadWishlistTab();
}
