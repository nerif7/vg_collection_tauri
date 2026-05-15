import type { CollectionEntry } from "./types.ts";
import { updateCollectionEntry, removeCollectionEntry } from "./collection-db.ts";
import { showConfirm } from "./confirm-dialog.ts";

export interface EditCallbacks {
  onQtyChanged: (updatedEntry: CollectionEntry) => void;
  onRemoved: (id: number) => void;
  onMoved: (entryAtCurrentQty: CollectionEntry, toLocation: string, qty: number) => Promise<void>;
}

export function buildEditSection(
  entry: CollectionEntry,
  locations: string[],
  callbacks: EditCallbacks,
): HTMLElement {
  const section = document.createElement("div");
  section.className = "collection-edit-section";

  // Quantity row
  const qtyRow   = document.createElement("div");
  qtyRow.className = "collection-qty-row";
  const qtyLabel = document.createElement("span");
  qtyLabel.className = "collection-edit-label"; qtyLabel.textContent = "Quantity";
  const minusBtn = document.createElement("button");
  minusBtn.className = "qty-btn"; minusBtn.textContent = "−"; minusBtn.type = "button";
  const qtyDisplay = document.createElement("span");
  qtyDisplay.className = "qty-display"; qtyDisplay.textContent = String(entry.quantity);
  const plusBtn = document.createElement("button");
  plusBtn.className = "qty-btn"; plusBtn.textContent = "+"; plusBtn.type = "button";

  let moveQtyInput: HTMLInputElement | null = null;
  let currentQty = entry.quantity;

  plusBtn.addEventListener("click", async () => {
    currentQty++;
    qtyDisplay.textContent = String(currentQty);
    if (moveQtyInput) moveQtyInput.max = String(currentQty);
    await updateCollectionEntry({ ...entry, quantity: currentQty });
    callbacks.onQtyChanged({ ...entry, quantity: currentQty });
  });

  minusBtn.addEventListener("click", async () => {
    if (currentQty === 1) {
      if (!await showConfirm("Remove this entry from collection?")) return;
      await removeCollectionEntry(entry.id!);
      callbacks.onRemoved(entry.id!);
      return;
    }
    currentQty--;
    qtyDisplay.textContent = String(currentQty);
    if (moveQtyInput) moveQtyInput.max = String(currentQty);
    await updateCollectionEntry({ ...entry, quantity: currentQty });
    callbacks.onQtyChanged({ ...entry, quantity: currentQty });
  });

  qtyRow.append(qtyLabel, minusBtn, qtyDisplay, plusBtn);

  // Move copies section
  const moveSection = document.createElement("div");
  moveSection.className = "collection-move-section";
  const moveLabel = document.createElement("div");
  moveLabel.className = "collection-edit-label"; moveLabel.textContent = "Move copies";

  const otherLocations = locations.filter((l) => l !== entry.location);

  if (otherLocations.length === 0) {
    const noLoc = document.createElement("p");
    noLoc.className = "collection-move-empty";
    noLoc.textContent = "No other locations — add one via the Locations button.";
    moveSection.append(moveLabel, noLoc);
  } else {
    const moveRow = document.createElement("div");
    moveRow.className = "collection-move-row";

    moveQtyInput = document.createElement("input");
    moveQtyInput.type = "number"; moveQtyInput.min = "1";
    moveQtyInput.max = String(currentQty); moveQtyInput.value = "1";
    moveQtyInput.className = "collection-move-qty";

    const moveToLabel = document.createElement("span");
    moveToLabel.className = "collection-move-to-label"; moveToLabel.textContent = "to";

    const moveLocSelect = document.createElement("select");
    moveLocSelect.className = "collection-location-select";
    for (const loc of otherLocations) {
      const opt = document.createElement("option");
      opt.value = loc; opt.textContent = loc;
      moveLocSelect.appendChild(opt);
    }

    const moveBtn = document.createElement("button");
    moveBtn.type = "button"; moveBtn.className = "btn-secondary btn-sm";
    moveBtn.textContent = "Move →";

    moveBtn.addEventListener("click", async () => {
      const qty = Math.min(Math.max(1, parseInt(moveQtyInput!.value, 10) || 1), currentQty);
      await callbacks.onMoved({ ...entry, quantity: currentQty }, moveLocSelect.value, qty);
    });

    moveRow.append(moveQtyInput, moveToLabel, moveLocSelect, moveBtn);
    moveSection.append(moveLabel, moveRow);
  }

  // Remove button
  const removeBtn = document.createElement("button");
  removeBtn.className = "btn-danger btn-remove-collection";
  removeBtn.textContent = "Remove from Collection"; removeBtn.type = "button";
  removeBtn.addEventListener("click", async () => {
    if (!await showConfirm("Remove this entry from collection?")) return;
    await removeCollectionEntry(entry.id!);
    callbacks.onRemoved(entry.id!);
  });

  section.append(qtyRow, moveSection, removeBtn);
  return section;
}
