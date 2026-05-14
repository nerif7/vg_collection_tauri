import type { Card } from "./types.ts";

export class CardPreview {
  private panel: HTMLElement;
  private body: HTMLElement;
  private _lightbox: HTMLElement | null = null;
  private _lightboxImg: HTMLImageElement | null = null;
  onAddToCollection?: (card: Card) => void;

  constructor(panel: HTMLElement) {
    this.panel = panel;
    this.body = panel.querySelector<HTMLElement>("#previewBody")!;

    panel.querySelector<HTMLButtonElement>("#previewClose")
      ?.addEventListener("click", () => this.hide());
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

  private _render(card: Card): void {
    this.body.innerHTML = "";

    // ── Image (full-width, click → lightbox) ─────────────────────
    const imageWrap = document.createElement("div");
    imageWrap.className = "preview-image-wrap";
    if (card.imageUrlEn) {
      const img = document.createElement("img");
      img.src = card.imageUrlEn;
      img.alt = card.name;
      img.className = "preview-image";
      img.loading = "lazy";
      img.title = "Click to enlarge";
      img.addEventListener("click", () => this._showLightbox(card.imageUrlEn!, card.name));
      imageWrap.appendChild(img);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "preview-image-placeholder";
      placeholder.textContent = "No Image";
      imageWrap.appendChild(placeholder);
    }

    // ── Info: name + code/rarity row ─────────────────────────────
    const info = document.createElement("div");
    info.className = "preview-info";

    const nameEl = document.createElement("div");
    nameEl.className = "preview-name";
    nameEl.textContent = card.name;

    const metaRow = document.createElement("div");
    metaRow.className = "preview-meta-row";

    const codeEl = document.createElement("span");
    codeEl.className = "preview-code";
    codeEl.textContent = card.enCardNo;

    const rarityEl = document.createElement("span");
    rarityEl.className = "preview-rarity";
    rarityEl.textContent = card.rarity ?? "—";

    metaRow.append(codeEl, rarityEl);
    info.append(nameEl, metaRow);

    // ── Tags grid ─────────────────────────────────────────────────
    const tags = document.createElement("div");
    tags.className = "preview-tags";
    this._appendTag(tags, "Grade",   card.grade !== null ? `G${card.grade}` : null);
    this._appendTag(tags, "Type",    card.unitType);
    this._appendTag(tags, "Trigger", card.trigger);
    this._appendTag(tags, "Nation",  card.nations.length > 0 ? card.nations.join(" / ") : null);
    this._appendTag(tags, "Clan",    card.clan.length > 0 ? card.clan.join(" / ") : null);
    this._appendTag(tags, "Race",    card.races.length > 0 ? card.races.join(" / ") : null);

    // ── Add to Collection button ──────────────────────────────────
    const addBtn = document.createElement("button");
    addBtn.className = "btn-add-collection";
    addBtn.textContent = "+ Add to Collection";
    addBtn.disabled = !this.onAddToCollection;
    if (this.onAddToCollection) {
      addBtn.addEventListener("click", () => this.onAddToCollection!(card));
    }

    this.body.append(imageWrap, info, tags, addBtn);
  }

  private _showLightbox(src: string, alt: string): void {
    if (!this._lightbox) {
      this._lightbox = document.createElement("div");
      this._lightbox.className = "lightbox";
      this._lightbox.addEventListener("click", (e) => {
        if (e.target === this._lightbox) this._hideLightbox();
      });

      this._lightboxImg = document.createElement("img");
      this._lightboxImg.className = "lightbox-img";
      this._lightbox.appendChild(this._lightboxImg);
      document.body.appendChild(this._lightbox);

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") this._hideLightbox();
      });
    }

    this._lightboxImg!.src = src;
    this._lightboxImg!.alt = alt;
    requestAnimationFrame(() => {
      this._lightbox!.classList.add("is-open");
    });
  }

  private _hideLightbox(): void {
    this._lightbox?.classList.remove("is-open");
  }

  private _appendTag(container: HTMLElement, label: string, value: string | null | undefined): void {
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
