import { trapFocus } from "./focus-trap.ts";

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
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-labelledby", "confirm-msg");

    const msg = document.createElement("p");
    msg.id = "confirm-msg";
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

    let releaseTrap = () => {};
    const onKeydown = (e: KeyboardEvent) => {
      if (e.key === "Escape") cleanup(false);
    };

    const cleanup = (result: boolean) => {
      _overlay!.classList.remove("is-open");
      releaseTrap();
      document.removeEventListener("keydown", onKeydown);
      resolve(result);
    };

    document.addEventListener("keydown", onKeydown);
    releaseTrap = trapFocus(dialog);

    cancelBtn.addEventListener("click",  () => cleanup(false), { once: true });
    confirmBtn.addEventListener("click", () => cleanup(true),  { once: true });
    _overlay.addEventListener("click", (e) => {
      if (e.target === _overlay) cleanup(false);
    }, { once: true });
  });
}
