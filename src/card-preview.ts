import type { Card } from "./types.ts";
import { getImageSrc } from "./image-cache.ts";
import { addSwipeToDismiss } from "./swipe-dismiss.ts";
import { showLightbox, hideLightbox, isLightboxOpen } from "./lightbox.ts";
import { buildCollectionAddSection } from "./collection-add-section.ts";

export interface BrowsePreviewCallbacks {
  onCollectionChanged: () => void;
  onWishlistChanged: () => void;
  onEditInCollection: (firstEntry: import("./types.ts").CollectionEntry) => void;
}

export class CardPreview {
  private panel: HTMLElement;
  private body: HTMLElement;
  private callbacks: BrowsePreviewCallbacks | null = null;
  private _lastLocation: { current: string } = { current: "" };

  constructor(panel: HTMLElement) {
    this.panel = panel;
    this.body = panel.querySelector<HTMLElement>("#previewBody")!;

    panel.querySelector<HTMLButtonElement>("#previewClose")
      ?.addEventListener("click", () => this.hide());

    panel.addEventListener("click", (e) => {
      if (e.target === panel) this.hide();
    });

    const inner = panel.querySelector<HTMLElement>(".preview-inner");
    const header = panel.querySelector<HTMLElement>(".preview-header");
    if (inner && header) addSwipeToDismiss(inner, header, () => this.hide());
  }

  setCallbacks(cb: BrowsePreviewCallbacks): void {
    this.callbacks = cb;
  }

  show(card: Card): void {
    this._render(card);
    this.panel.classList.add("is-open");
  }

  hide(): void {
    this.panel.classList.remove("is-open");
  }

  get isOpen(): boolean {
    return this.panel.classList.contains("is-open");
  }

  get isLightboxOpen(): boolean {
    return isLightboxOpen();
  }

  hideLightbox(): void {
    hideLightbox();
  }

  private async _render(card: Card): Promise<void> {
    this.body.innerHTML = "";

    const imageWrap = document.createElement("div");
    imageWrap.className = "preview-image-wrap";
    if (card.imageUrl) {
      const img = document.createElement("img");
      const src = await getImageSrc(card.cardNo, card.imageUrl) ?? card.imageUrl;
      img.src = src;
      img.alt = card.displayName;
      img.className = "preview-image";
      img.loading = "lazy";
      img.decoding = "async";
      img.title = "Click to enlarge";
      img.addEventListener("click", () => showLightbox(src, card.displayName));
      imageWrap.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "preview-image-placeholder";
      ph.textContent = "No Image";
      imageWrap.appendChild(ph);
    }

    const info = document.createElement("div");
    info.className = "preview-info";

    const nameEl = document.createElement("div");
    nameEl.className = "preview-name";
    nameEl.textContent = card.displayName;

    const metaRow = document.createElement("div");
    metaRow.className = "preview-meta-row";
    const codeEl = document.createElement("span");
    codeEl.className = "preview-code";
    codeEl.textContent = card.cardNo;
    const rarityEl = document.createElement("span");
    rarityEl.className = "preview-rarity";
    rarityEl.textContent = card.rarity ?? "—";
    metaRow.append(codeEl, rarityEl);
    info.append(nameEl, metaRow);

    const tags = document.createElement("div");
    tags.className = "preview-tags";
    this._appendTag(tags, "Grade",   card.grade !== null ? `G${card.grade}` : null);
    this._appendTag(tags, "Type",    card.unitType);
    this._appendTag(tags, "Trigger", card.trigger);
    this._appendTag(tags, "Nation",  card.nations.length > 0 ? card.nations.join(" / ") : null);
    this._appendTag(tags, "Clan",    card.clan.length > 0 ? card.clan.join(" / ") : null);
    this._appendTag(tags, "Race",    card.races.length > 0 ? card.races.join(" / ") : null);

    this.body.append(imageWrap, info, tags);

    const collSection = await buildCollectionAddSection(card, this._lastLocation, this.callbacks);
    this.body.appendChild(collSection);
  }

  private _appendTag(
    container: HTMLElement,
    label: string,
    value: string | null | undefined,
  ): void {
    if (!value) return;
    const labelEl = document.createElement("span");
    labelEl.className = "preview-tag-label";
    labelEl.textContent = label;
    const valueEl = document.createElement("span");
    valueEl.className = "preview-tag-value";
    valueEl.textContent = value;
    container.append(labelEl, valueEl);
  }
}
