import { getAllLocations, addLocation, removeLocation } from "./collection-db.ts";
import { showConfirm } from "./confirm-dialog.ts";

let _overlay: HTMLElement | null = null;
let _onClose: (() => void) | undefined;

export function openLocationManager(onClose?: () => void): void {
  _onClose = onClose;
  if (!_overlay) {
    _overlay = document.createElement("div");
    _overlay.className = "modal-overlay";
    _overlay.addEventListener("click", (e) => {
      if (e.target === _overlay) _close();
    });
    document.body.appendChild(_overlay);
  }
  _overlay.classList.add("is-open");
  _render();
}

function _close(): void {
  _overlay!.classList.remove("is-open");
  _onClose?.();
}

async function _render(): Promise<void> {
  const locations = await getAllLocations();

  _overlay!.innerHTML = "";
  const dialog = document.createElement("div");
  dialog.className = "modal-dialog";

  // Header
  const header = document.createElement("div");
  header.className = "modal-header";
  const title = document.createElement("h3");
  title.textContent = "Manage Locations";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn-preview-close";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", _close);
  header.append(title, closeBtn);

  // Add new location row
  const addRow = document.createElement("div");
  addRow.className = "location-add-row";
  const newInput = document.createElement("input");
  newInput.type = "text";
  newInput.className = "location-new-input";
  newInput.placeholder = "New location name…";
  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn-secondary btn-sm";
  addBtn.textContent = "Add";

  const doAdd = async () => {
    const name = newInput.value.trim();
    if (!name) return;
    await addLocation(name);
    newInput.value = "";
    _render();
  };
  addBtn.addEventListener("click", doAdd);
  newInput.addEventListener("keydown", (e) => { if (e.key === "Enter") doAdd(); });
  addRow.append(newInput, addBtn);

  // Location list
  const list = document.createElement("ul");
  list.className = "location-list";
  if (locations.length === 0) {
    const empty = document.createElement("li");
    empty.className = "location-list-empty";
    empty.textContent = "No locations yet.";
    list.appendChild(empty);
  } else {
    for (const loc of locations) {
      const li = document.createElement("li");
      li.className = "location-list-item";
      const nameSpan = document.createElement("span");
      nameSpan.textContent = loc;
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "location-delete-btn";
      delBtn.textContent = "×";
      delBtn.title = "Remove location";
      delBtn.addEventListener("click", async () => {
        const ok = await showConfirm(`Remove location "${loc}" from the list?\n\nCards already in this location are not affected.`);
        if (!ok) return;
        await removeLocation(loc);
        _render();
      });
      li.append(nameSpan, delBtn);
      list.appendChild(li);
    }
  }

  dialog.append(header, addRow, list);
  _overlay!.appendChild(dialog);
  newInput.focus();
}
