export type TabId = "collection" | "wishlist" | "browse";

export class TabNav {
  private buttons: NodeListOf<HTMLButtonElement>;
  private panels: Map<TabId, HTMLElement>;
  private current: TabId = "collection";
  private onSwitch: ((from: TabId, to: TabId) => void) | null = null;

  constructor() {
    this.buttons = document.querySelectorAll<HTMLButtonElement>("#tabNav .tab-btn");
    this.panels = new Map([
      ["collection", document.getElementById("tabCollection")!],
      ["wishlist",   document.getElementById("tabWishlist")!],
      ["browse",     document.getElementById("tabBrowse")!],
    ]);

    this.buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const tab = btn.dataset["tab"] as TabId;
        if (tab && tab !== this.current) this.switchTo(tab);
      });
    });
  }

  switchTo(tab: TabId): void {
    const from = this.current;

    // Update buttons
    this.buttons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset["tab"] === tab);
    });

    // Update panels
    this.panels.forEach((panel, id) => {
      panel.classList.toggle("tab-panel--hidden", id !== tab);
    });

    this.current = tab;
    this.onSwitch?.(from, tab);
  }

  get activeTab(): TabId {
    return this.current;
  }

  onTabSwitch(fn: (from: TabId, to: TabId) => void): void {
    this.onSwitch = fn;
  }
}
