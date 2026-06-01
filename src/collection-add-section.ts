import type { Card, CollectionEntry } from "./types.ts";
import type { BrowsePreviewCallbacks } from "./card-preview.ts";
import {
  getCollectionByCardCode, mergeOrAdd,
  isInWishlist, addToWishlist, removeFromWishlist,
  getAllLocations,
} from "./collection-db.ts";

export async function buildCollectionAddSection(
  card: Card,
  lastLocationRef: { current: string },
  callbacks: BrowsePreviewCallbacks | null
): Promise<HTMLElement> {
  const [existingEntries, inWishlist, locations] = await Promise.all([
    getCollectionByCardCode(card.cardNo, card.region),
    isInWishlist(card.cardNo, card.region),
    getAllLocations(),
  ]);

  const wrapper = document.createElement("div");
  wrapper.className = "preview-collection-section";

  // ── Add to Collection form ────────────────────────────────────────────────
  const addForm = document.createElement("div");
  addForm.className = "preview-add-form";

  const formLabel = document.createElement("div");
  formLabel.className = "preview-add-form-label";
  formLabel.textContent = "Add to Collection";

  const formRow = document.createElement("div");
  formRow.className = "preview-add-form-row";

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
    if (lastLocationRef.current && locations.includes(lastLocationRef.current)) {
      locSelect.value = lastLocationRef.current;
    }

    addBtn.addEventListener("click", async () => {
      addBtn.disabled = true;
      try {
        const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
        const loc = locSelect.value;
        lastLocationRef.current = loc;
        await mergeOrAdd(card.cardNo, loc, qty, card.region);
        qtyInput.value = "1";
        callbacks?.onCollectionChanged();
        const updated = await getCollectionByCardCode(card.cardNo, card.region);
        renderOwned(updated);
      } finally {
        addBtn.disabled = false;
      }
    });

    formRow.append(qtyInput, locSelect, addBtn);
    addForm.append(formLabel, formRow);
  }

  // ── Already owned chips ───────────────────────────────────────────────────
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
      editLink.addEventListener("click", () => callbacks?.onEditInCollection(e));
      chips.append(chip, editLink);
    }
    ownedSection.appendChild(chips);
  };

  renderOwned(existingEntries);

  // ── Wishlist button ───────────────────────────────────────────────────────
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
    if (wishlisted) await removeFromWishlist(card.cardNo, card.region);
    else            await addToWishlist(card.cardNo, card.region);
    wishlisted = !wishlisted;
    setWishlistState(wishlisted);
    callbacks?.onWishlistChanged();
  });

  wrapper.append(addForm, ownedSection, wishlistBtn);
  return wrapper;
}
