import type { Card, CollectionEntry } from "./types.ts";
import {
  getCollectionByCardCode, mergeOrAdd,
  isInWishlist, addToWishlist, removeFromWishlist,
  getAllLocations,
} from "./collection-db.ts";
import { addSwipeToDismiss } from "./swipe-dismiss.ts";

export interface BrowsePreviewCallbacks {
  onCollectionChanged: () => void;
  onWishlistChanged: () => void;
  onEditInCollection: (firstEntry: CollectionEntry) => void;
}

export class CardPreview {
  private panel: HTMLElement;
  private body: HTMLElement;
  private _lightbox: HTMLElement | null = null;
  private _lightboxImg: HTMLImageElement | null = null;
  private callbacks: BrowsePreviewCallbacks | null = null;

  constructor(panel: HTMLElement) {
    this.panel = panel;
    this.body = panel.querySelector<HTMLElement>("#previewBody")!;

    panel.querySelector<HTMLButtonElement>("#previewClose")
      ?.addEventListener("click", () => this.hide());

    const header = panel.querySelector<HTMLElement>(".preview-header");
    if (header) addSwipeToDismiss(panel, header, () => this.hide());
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
    return this._lightbox?.classList.contains("is-open") ?? false;
  }

  hideLightbox(): void {
    this._hideLightbox();
  }

  private async _render(card: Card): Promise<void> {
    this.body.innerHTML = "";

    // Image
    const imageWrap = document.createElement("div");
    imageWrap.className = "preview-image-wrap";
    if (card.imageUrlEn) {
      const img = document.createElement("img");
      img.src = card.imageUrlEn;
      img.alt = card.name;
      img.className = "preview-image";
      img.loading = "lazy";
      img.decoding = "async";
      img.title = "Click to enlarge";
      img.addEventListener("click", () => this._showLightbox(card.imageUrlEn!, card.name));
      imageWrap.appendChild(img);
    } else {
      const ph = document.createElement("div");
      ph.className = "preview-image-placeholder";
      ph.textContent = "No Image";
      imageWrap.appendChild(ph);
    }

    // Name + code/rarity
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

    // Tags grid
    const tags = document.createElement("div");
    tags.className = "preview-tags";
    this._appendTag(tags, "Grade",   card.grade !== null ? `G${card.grade}` : null);
    this._appendTag(tags, "Type",    card.unitType);
    this._appendTag(tags, "Trigger", card.trigger);
    this._appendTag(tags, "Nation",  card.nations.length > 0 ? card.nations.join(" / ") : null);
    this._appendTag(tags, "Clan",    card.clan.length > 0 ? card.clan.join(" / ") : null);
    this._appendTag(tags, "Race",    card.races.length > 0 ? card.races.join(" / ") : null);

    this.body.append(imageWrap, info, tags);

    // Collection + wishlist section (async)
    const collSection = await this._buildCollectionSection(card);
    this.body.appendChild(collSection);
  }

  private async _buildCollectionSection(card: Card): Promise<HTMLElement> {
    const [existingEntries, inWishlist, locations] = await Promise.all([
      getCollectionByCardCode(card.enCardNo),
      isInWishlist(card.enCardNo),
      getAllLocations(),
    ]);

    const wrapper = document.createElement("div");
    wrapper.className = "preview-collection-section";

    // ── Add to Collection form ────────────────────────────────────────
    const addForm = document.createElement("div");
    addForm.className = "preview-add-form";

    const formLabel = document.createElement("div");
    formLabel.className = "preview-add-form-label";
    formLabel.textContent = "Add to Collection";

    const formRow = document.createElement("div");
    formRow.className = "preview-add-form-row";

    // qty input
    const qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.min = "1";
    qtyInput.value = "1";
    qtyInput.className = "preview-qty-input";

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "btn-add-collection";
    addBtn.textContent = "+ Add";

    if (locations.length === 0) {
      const noLoc = document.createElement("p");
      noLoc.className = "preview-no-locations";
      noLoc.textContent = "No locations found. Create one in the Collection tab first.";
      addBtn.disabled = true;
      formRow.append(qtyInput, addBtn);
      addForm.append(formLabel, noLoc, formRow);
    } else {
      const locSelect = document.createElement("select");
      locSelect.className = "preview-loc-select";
      for (const loc of locations) {
        const opt = document.createElement("option");
        opt.value = loc;
        opt.textContent = loc;
        locSelect.appendChild(opt);
      }

      addBtn.addEventListener("click", async () => {
        addBtn.disabled = true;
        try {
          const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
          const loc = locSelect.value;
          await mergeOrAdd(card.enCardNo, loc, qty);
          qtyInput.value = "1";
          this.callbacks?.onCollectionChanged();
          const updated = await getCollectionByCardCode(card.enCardNo);
          renderOwned(updated);
        } finally {
          addBtn.disabled = false;
        }
      });

      formRow.append(qtyInput, locSelect, addBtn);
      addForm.append(formLabel, formRow);
    }

    // ── Already owned chips ───────────────────────────────────────────
    const ownedSection = document.createElement("div");
    ownedSection.className = "preview-owned-section";

    const renderOwned = (entries: CollectionEntry[]) => {
      ownedSection.innerHTML = "";
      if (entries.length === 0) return;

      const ownedLabel = document.createElement("div");
      ownedLabel.className = "preview-owned-label";
      ownedLabel.textContent = "Already owned:";
      ownedSection.appendChild(ownedLabel);

      const chips = document.createElement("div");
      chips.className = "preview-owned-chips";
      for (const e of entries) {
        const chip = document.createElement("span");
        chip.className = "preview-owned-chip";
        chip.textContent = `×${e.quantity}${e.location ? " " + e.location : ""}`;

        const editLink = document.createElement("button");
        editLink.type = "button";
        editLink.className = "preview-owned-edit";
        editLink.textContent = "Edit →";
        editLink.addEventListener("click", () => {
          this.callbacks?.onEditInCollection(e);
        });

        chips.append(chip, editLink);
      }
      ownedSection.appendChild(chips);
    };

    renderOwned(existingEntries);

    // ── Wishlist button ───────────────────────────────────────────────
    const wishlistBtn = document.createElement("button");
    wishlistBtn.type = "button";
    wishlistBtn.className = "btn-wishlist";

    const setWishlistState = (wished: boolean) => {
      wishlistBtn.textContent = wished ? "♥ Remove from Wishlist" : "♡ Add to Wishlist";
      wishlistBtn.classList.toggle("btn-wishlist--active", wished);
    };
    setWishlistState(inWishlist);

    let wishlisted = inWishlist;
    wishlistBtn.addEventListener("click", async () => {
      if (wishlisted) {
        await removeFromWishlist(card.enCardNo);
      } else {
        await addToWishlist(card.enCardNo);
      }
      wishlisted = !wishlisted;
      setWishlistState(wishlisted);
      this.callbacks?.onWishlistChanged();
    });

    wrapper.append(addForm, ownedSection, wishlistBtn);
    return wrapper;
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

      addSwipeToDismiss(this._lightbox, this._lightbox, () => this._hideLightbox());
    }

    this._lightboxImg!.src = src;
    this._lightboxImg!.alt = alt;
    requestAnimationFrame(() => { this._lightbox!.classList.add("is-open"); });
  }

  private _hideLightbox(): void {
    this._lightbox?.classList.remove("is-open");
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
