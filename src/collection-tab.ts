import type { Card, CollectionEntry } from "./types.ts";
import {
  getAllCollectionEntries,
  updateCollectionEntry, removeCollectionEntry,
  getAllWishlistEntries, getAllLocations,
} from "./collection-db.ts";
import { VirtualList } from "./virtual-list.ts";
import { buildCollectionRow } from "./collection-row.ts";
import { showConfirm } from "./confirm-dialog.ts";
import { openLocationManager } from "./location-manager.ts";

// ── DOM refs ───────────────────────────────────────────────────────────────────

const statsEl      = document.getElementById("collectionStats")!;
const searchEl     = document.getElementById("collectionSearch") as HTMLInputElement;
const listMetaEl   = document.getElementById("collectionListMeta")!;
const listContainer = document.getElementById("collectionListContainer")!;
const previewPane  = document.getElementById("collectionPreviewPane")!;
const previewBody  = document.getElementById("collectionPreviewBody")!;
const previewClose = document.getElementById("collectionPreviewClose")!;

// ── State ──────────────────────────────────────────────────────────────────────

let allEntries: CollectionEntry[] = [];
let visibleEntries: CollectionEntry[] = [];
let cardMap = new Map<string, Card>();
let selectedId: number | null = null;
let wishlistCount = 0;
let virtualList: VirtualList<CollectionEntry> | null = null;

// ── Init ───────────────────────────────────────────────────────────────────────

export function initCollectionTab(cards: Card[]): void {
  cardMap = new Map(cards.map((c) => [c.enCardNo, c]));

  previewClose.addEventListener("click", closePreview);

  document.getElementById("manageLocationsBtn")?.addEventListener("click", () => {
    openLocationManager(async () => {
      if (selectedId !== null) {
        const entry = allEntries.find((e) => e.id === selectedId);
        if (entry) await renderPreview(entry);
      }
    });
  });

  searchEl.addEventListener("input", () => {
    applySearch();
  });

  if (!virtualList) {
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
      emptyMessage: "No cards in collection yet — add from Browse tab",
    });
  }
}

// ── Load / refresh ─────────────────────────────────────────────────────────────

export async function loadCollectionTab(): Promise<void> {
  const [entries, wishlist] = await Promise.all([
    getAllCollectionEntries(),
    getAllWishlistEntries(),
  ]);
  wishlistCount = wishlist.length;
  allEntries = sortEntries(entries);
  applySearch();
  renderStats();
}

function sortEntries(entries: CollectionEntry[]): CollectionEntry[] {
  return [...entries].sort((a, b) => {
    const loc = a.location.localeCompare(b.location);
    if (loc !== 0) return loc;
    return a.cardCode.localeCompare(b.cardCode);
  });
}

function applySearch(): void {
  const q = searchEl.value.trim().toLowerCase();
  if (!q) {
    visibleEntries = allEntries;
  } else {
    visibleEntries = allEntries.filter((e) => {
      const card = cardMap.get(e.cardCode);
      return (
        e.cardCode.toLowerCase().includes(q) ||
        e.location.toLowerCase().includes(q) ||
        (card?.name.toLowerCase().includes(q) ?? false)
      );
    });
  }

  virtualList?.setItems(visibleEntries);
  listMetaEl.textContent = q
    ? `${visibleEntries.length} of ${allEntries.length} entries`
    : `${allEntries.length} entries`;
}

function renderStats(): void {
  const uniqueCards = new Set(allEntries.map((e) => e.cardCode)).size;
  const totalCopies = allEntries.reduce((s, e) => s + e.quantity, 0);
  const locations   = new Set(allEntries.map((e) => e.location).filter((l) => l !== "")).size;

  statsEl.innerHTML = [
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
  const locations = await getAllLocations();

  previewBody.innerHTML = "";

  // Image
  if (card?.imageUrlEn) {
    const wrap = document.createElement("div");
    wrap.className = "preview-image-wrap";
    const img = document.createElement("img");
    img.src = card.imageUrlEn;
    img.alt = card.name;
    img.className = "preview-image";
    img.loading = "lazy";
    wrap.appendChild(img);
    previewBody.appendChild(wrap);
  }

  // Name + code
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

  // Edit section
  const editSection = buildEditSection(entry, locations);
  previewBody.appendChild(editSection);
}

function buildEditSection(entry: CollectionEntry, locations: string[]): HTMLElement {
  const section = document.createElement("div");
  section.className = "collection-edit-section";

  // Quantity row
  const qtyRow = document.createElement("div");
  qtyRow.className = "collection-qty-row";

  const qtyLabel = document.createElement("span");
  qtyLabel.className = "collection-edit-label";
  qtyLabel.textContent = "Quantity";

  const minusBtn = document.createElement("button");
  minusBtn.className = "qty-btn";
  minusBtn.textContent = "−";
  minusBtn.type = "button";

  const qtyDisplay = document.createElement("span");
  qtyDisplay.className = "qty-display";
  qtyDisplay.textContent = String(entry.quantity);

  const plusBtn = document.createElement("button");
  plusBtn.className = "qty-btn";
  plusBtn.textContent = "+";
  plusBtn.type = "button";

  let currentQty = entry.quantity;

  plusBtn.addEventListener("click", async () => {
    currentQty++;
    qtyDisplay.textContent = String(currentQty);
    await updateCollectionEntry({ ...entry, quantity: currentQty });
    entry.quantity = currentQty;
    syncEntryInList(entry);
    renderStats();
  });

  minusBtn.addEventListener("click", async () => {
    if (currentQty === 1) {
      if (!await showConfirm("Remove this entry from collection?")) return;
      await removeCollectionEntry(entry.id!);
      allEntries = allEntries.filter((e) => e.id !== entry.id);
      applySearch();
      renderStats();
      closePreview();
      return;
    }
    currentQty--;
    qtyDisplay.textContent = String(currentQty);
    await updateCollectionEntry({ ...entry, quantity: currentQty });
    entry.quantity = currentQty;
    syncEntryInList(entry);
    renderStats();
  });

  qtyRow.append(qtyLabel, minusBtn, qtyDisplay, plusBtn);

  // Location select (move to a different existing location)
  const locationRow = document.createElement("div");
  locationRow.className = "collection-location-row";

  const locLabel = document.createElement("label");
  locLabel.className = "collection-edit-label";
  locLabel.textContent = "Location";

  const locSelect = document.createElement("select");
  locSelect.className = "collection-location-select";
  for (const loc of locations) {
    const opt = document.createElement("option");
    opt.value = loc;
    opt.textContent = loc;
    if (loc === entry.location) opt.selected = true;
    locSelect.appendChild(opt);
  }

  locSelect.addEventListener("change", async () => {
    const newLoc = locSelect.value;
    if (newLoc === entry.location) return;
    await updateCollectionEntry({ ...entry, location: newLoc });
    entry.location = newLoc;
    allEntries = sortEntries(allEntries.map((e) => e.id === entry.id ? entry : e));
    applySearch();
  });

  locationRow.append(locLabel, locSelect);

  // Remove button
  const removeBtn = document.createElement("button");
  removeBtn.className = "btn-danger btn-remove-collection";
  removeBtn.textContent = "Remove from Collection";
  removeBtn.type = "button";
  removeBtn.addEventListener("click", async () => {
    if (!await showConfirm("Remove this entry from collection?")) return;
    await removeCollectionEntry(entry.id!);
    allEntries = allEntries.filter((e) => e.id !== entry.id);
    applySearch();
    renderStats();
    closePreview();
  });

  section.append(qtyRow, locationRow, removeBtn);
  return section;
}

function syncEntryInList(updated: CollectionEntry): void {
  const idx = allEntries.findIndex((e) => e.id === updated.id);
  if (idx !== -1) allEntries[idx] = { ...updated };
  applySearch();
}

// ── Public: scroll to entry (called from Browse "Edit →") ─────────────────────

export function scrollToEntry(id: number): void {
  const idx = visibleEntries.findIndex((e) => e.id === id);
  if (idx === -1) return;
  selectedId = id;
  virtualList?.scrollToIndex(idx);
  virtualList?.refresh();
  const entry = visibleEntries[idx];
  if (entry) openPreview(entry);
}
