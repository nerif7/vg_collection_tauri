import type { Card, WishlistEntry } from "./types.ts";
import { getAllWishlistEntries, removeFromWishlist } from "./collection-db.ts";
import { VirtualList } from "./virtual-list.ts";

// ── DOM refs ───────────────────────────────────────────────────────────────────

const statsEl      = document.getElementById("wishlistStats")!;
const listContainer = document.getElementById("wishlistListContainer")!;
const previewPane  = document.getElementById("wishlistPreviewPane")!;
const previewBody  = document.getElementById("wishlistPreviewBody")!;
const previewClose = document.getElementById("wishlistPreviewClose")!;

// ── State ──────────────────────────────────────────────────────────────────────

let allEntries: WishlistEntry[] = [];
let cardMap = new Map<string, Card>();
let selectedCode: string | null = null;
let virtualList: VirtualList<WishlistEntry> | null = null;

// ── Init ───────────────────────────────────────────────────────────────────────

export function initWishlistTab(cards: Card[]): void {
  cardMap = new Map(cards.map((c) => [c.enCardNo, c]));

  previewClose.addEventListener("click", closePreview);

  if (!virtualList) {
    virtualList = new VirtualList<WishlistEntry>(listContainer, {
      rowHeight: 62,
      buffer: 8,
      renderRow: (entry) => buildWishlistRow(entry, entry.cardCode === selectedCode),
      onRowClick: (entry) => {
        selectedCode = entry.cardCode;
        virtualList!.refresh();
        openPreview(entry);
      },
      emptyMessage: "Wishlist is empty — add cards from Browse tab",
    });
  }
}

// ── Load / refresh ─────────────────────────────────────────────────────────────

export async function loadWishlistTab(): Promise<void> {
  allEntries = await getAllWishlistEntries();
  allEntries.sort((a, b) => a.cardCode.localeCompare(b.cardCode));
  virtualList?.setItems(allEntries);
  renderStats();
}

function renderStats(): void {
  statsEl.innerHTML = `<div class="stat"><span class="stat-label">Wishlist</span><span class="stat-value">${allEntries.length.toLocaleString()}</span></div>`;
}

// ── Row builder ────────────────────────────────────────────────────────────────

function buildWishlistRow(entry: WishlistEntry, selected: boolean): HTMLElement {
  const card = cardMap.get(entry.cardCode);
  const row = document.createElement("div");
  row.className = selected ? "card-row card-row--selected" : "card-row";

  const codeEl = document.createElement("div");
  codeEl.className = "card-row-code";
  codeEl.textContent = entry.cardCode;

  const middle = document.createElement("div");
  middle.className = "card-row-middle";

  const nameEl = document.createElement("div");
  nameEl.className = "card-row-name";
  nameEl.textContent = card?.name ?? entry.cardCode;

  const metaEl = document.createElement("div");
  metaEl.className = "card-row-meta";
  if (card) {
    const parts: string[] = [];
    if (card.unitType) parts.push(card.unitType);
    if (card.grade !== null) parts.push(`G${card.grade}`);
    if (card.nations.length > 0) parts.push(card.nations.join("/"));
    metaEl.textContent = parts.join(" · ");
  }

  middle.append(nameEl, metaEl);

  const rarityEl = document.createElement("span");
  rarityEl.className = "card-row-rarity";
  rarityEl.textContent = card?.rarity ?? "—";

  row.append(codeEl, middle, rarityEl);
  return row;
}

// ── Preview pane ───────────────────────────────────────────────────────────────

function closePreview(): void {
  previewPane.classList.remove("is-open");
  selectedCode = null;
  virtualList?.refresh();
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
    img.src = card.imageUrlEn;
    img.alt = card.name;
    img.className = "preview-image";
    img.loading = "lazy";
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

  const removeBtn = document.createElement("button");
  removeBtn.className = "btn-danger btn-remove-collection";
  removeBtn.textContent = "Remove from Wishlist";
  removeBtn.type = "button";
  removeBtn.addEventListener("click", async () => {
    await removeFromWishlist(entry.cardCode);
    allEntries = allEntries.filter((e) => e.cardCode !== entry.cardCode);
    virtualList?.setItems(allEntries);
    renderStats();
    closePreview();
  });
  previewBody.appendChild(removeBtn);
}

// ── Public refresh (called after wishlist changes from Browse tab) ─────────────

export async function refreshWishlistTab(): Promise<void> {
  await loadWishlistTab();
}
