export interface ContextMenuItem {
  label: string;
  action: () => void;
  danger?: boolean;
}

let activeMenu: HTMLElement | null = null;
let docCloseListener: (() => void) | null = null;

export function showContextMenu(x: number, y: number, items: ContextMenuItem[]): void {
  closeContextMenu();

  const menu = document.createElement("div");
  menu.className = "context-menu";

  for (const item of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `context-menu-item${item.danger ? " context-menu-item--danger" : ""}`;
    btn.textContent = item.label;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      closeContextMenu();
      item.action();
    });
    menu.appendChild(btn);
  }

  document.body.appendChild(menu);
  activeMenu = menu;

  requestAnimationFrame(() => {
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    const left = Math.min(x, window.innerWidth - mw - 8);
    const top  = Math.min(y, window.innerHeight - mh - 8);
    menu.style.left = `${Math.max(8, left)}px`;
    menu.style.top  = `${Math.max(8, top)}px`;
    menu.classList.add("context-menu--visible");
  });

  setTimeout(() => {
    docCloseListener = () => closeContextMenu();
    document.addEventListener("click",      docCloseListener, { once: true });
    document.addEventListener("touchstart", docCloseListener, { once: true, passive: true });
  }, 0);
}

export function closeContextMenu(): void {
  if (docCloseListener) {
    document.removeEventListener("click",      docCloseListener);
    document.removeEventListener("touchstart", docCloseListener);
    docCloseListener = null;
  }
  activeMenu?.remove();
  activeMenu = null;
}
