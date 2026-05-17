export type TabId = "collection" | "wishlist" | "browse";

const TAB_LABELS: Record<TabId, string> = {
  collection: "Collection",
  wishlist:   "Wishlist",
  browse:     "Browse",
};

export class TabNav {
  private buttons: NodeListOf<HTMLButtonElement>;
  private bottomBtns: NodeListOf<HTMLButtonElement>;
  private panels: Map<TabId, HTMLElement>;
  private mobileTitle: HTMLElement | null;
  private current: TabId = "collection";
  private onSwitch: ((from: TabId, to: TabId) => void) | null = null;

  constructor() {
    this.buttons    = document.querySelectorAll<HTMLButtonElement>("#tabNav .tab-btn");
    this.bottomBtns = document.querySelectorAll<HTMLButtonElement>("#bottomNav .bottom-nav-btn");
    this.mobileTitle = document.getElementById("mobileHeaderTitle");

    this.panels = new Map([
      ["collection", document.getElementById("tabCollection")!],
      ["wishlist",   document.getElementById("tabWishlist")!],
      ["browse",     document.getElementById("tabBrowse")!],
    ]);

    const handleClick = (btn: HTMLButtonElement) => {
      const tab = btn.dataset["tab"] as TabId;
      if (tab && tab !== this.current) this.switchTo(tab);
    };

    this.buttons.forEach((btn) => btn.addEventListener("click", () => handleClick(btn)));
    this.bottomBtns.forEach((btn) => btn.addEventListener("click", () => handleClick(btn)));

    // Filter expand button (Browse tab mobile)
    const filterExpandBtn  = document.getElementById("filterExpandBtn");
    const filterDropdowns  = document.getElementById("filterDropdowns");
    if (filterExpandBtn && filterDropdowns) {
      filterExpandBtn.addEventListener("click", () => {
        const isOpen = filterDropdowns.classList.toggle("is-open");
        filterExpandBtn.textContent = isOpen ? "⊠ Filter" : "⊟ Filter";
      });
    }
  }

  switchTo(tab: TabId): void {
    const from = this.current;

    this.buttons.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset["tab"] === tab);
    });

    this.bottomBtns.forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset["tab"] === tab);
    });

    this.panels.forEach((panel, id) => {
      panel.classList.toggle("tab-panel--hidden", id !== tab);
    });

    if (this.mobileTitle) this.mobileTitle.textContent = TAB_LABELS[tab];

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
