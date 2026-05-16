let _overlay: HTMLElement | null = null;

export function showConfirm(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!_overlay) {
      _overlay = document.createElement("div");
      _overlay.className = "modal-overlay";
      document.body.appendChild(_overlay);
    }

    _overlay.innerHTML = "";
    const dialog = document.createElement("div");
    dialog.className = "confirm-dialog";

    const msg = document.createElement("p");
    msg.className = "confirm-message";
    msg.textContent = message;

    const actions = document.createElement("div");
    actions.className = "confirm-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn-neutral";
    cancelBtn.textContent = "Cancel";

    const confirmBtn = document.createElement("button");
    confirmBtn.type = "button";
    confirmBtn.className = "btn-secondary";
    confirmBtn.textContent = "Confirm";

    actions.append(cancelBtn, confirmBtn);
    dialog.append(msg, actions);
    _overlay.appendChild(dialog);
    _overlay.classList.add("is-open");

    const cleanup = (result: boolean) => {
      _overlay!.classList.remove("is-open");
      resolve(result);
    };

    cancelBtn.addEventListener("click", () => cleanup(false), { once: true });
    confirmBtn.addEventListener("click", () => cleanup(true), { once: true });
    _overlay.addEventListener("click", (e) => {
      if (e.target === _overlay) cleanup(false);
    }, { once: true });
  });
}
