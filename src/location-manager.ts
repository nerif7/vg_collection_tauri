import { getAllLocations, addLocation, removeLocation, renameLocation } from "./collection-db.ts";
import { showConfirm } from "./confirm-dialog.ts";

let _overlay: HTMLElement | null = null;
let _onClose: (() => void) | undefined;
let _escCleanup: (() => void) | null = null;

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

  const onKeydown = (e: KeyboardEvent) => { if (e.key === "Escape") _close(); };
  document.addEventListener("keydown", onKeydown);
  _escCleanup = () => document.removeEventListener("keydown", onKeydown);

  _render();
}

function _close(): void {
  _overlay!.classList.remove("is-open");
  _escCleanup?.();
  _escCleanup = null;
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
      nameSpan.className = "location-name";
      nameSpan.textContent = loc;

      const renameInput = document.createElement("input");
      renameInput.type = "text";
      renameInput.className = "location-rename-input";
      renameInput.value = loc;
      renameInput.hidden = true;
      renameInput.setAttribute("aria-label", `Rename ${loc}`);

      const renameBtn = document.createElement("button");
      renameBtn.type = "button";
      renameBtn.className = "location-rename-btn";
      renameBtn.textContent = "✎";
      renameBtn.title = "Rename location";

      const confirmRenameBtn = document.createElement("button");
      confirmRenameBtn.type = "button";
      confirmRenameBtn.className = "btn-primary btn-sm";
      confirmRenameBtn.textContent = "Save";
      confirmRenameBtn.hidden = true;

      const cancelRenameBtn = document.createElement("button");
      cancelRenameBtn.type = "button";
      cancelRenameBtn.className = "btn-neutral btn-sm";
      cancelRenameBtn.textContent = "Cancel";
      cancelRenameBtn.hidden = true;

      const startRename = () => {
        nameSpan.hidden = true;
        renameBtn.hidden = true;
        renameInput.hidden = false;
        confirmRenameBtn.hidden = false;
        cancelRenameBtn.hidden = false;
        renameInput.focus();
        renameInput.select();
      };

      const cancelRename = () => {
        nameSpan.hidden = false;
        renameBtn.hidden = false;
        renameInput.hidden = true;
        confirmRenameBtn.hidden = true;
        cancelRenameBtn.hidden = true;
        renameInput.value = loc;
      };

      const doRename = async () => {
        const newName = renameInput.value.trim();
        if (!newName || newName === loc) { cancelRename(); return; }
        await renameLocation(loc, newName);
        _render();
      };

      renameBtn.addEventListener("click", startRename);
      cancelRenameBtn.addEventListener("click", cancelRename);
      confirmRenameBtn.addEventListener("click", doRename);
      renameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") doRename();
        if (e.key === "Escape") cancelRename();
      });

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

      li.append(nameSpan, renameInput, renameBtn, confirmRenameBtn, cancelRenameBtn, delBtn);
      list.appendChild(li);
    }
  }

  dialog.append(header, addRow, list);
  _overlay!.appendChild(dialog);
  newInput.focus();
}
