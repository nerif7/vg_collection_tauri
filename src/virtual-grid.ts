export interface VirtualGridOptions<T> {
  cellHeight: number;
  gap?: number;
  buffer?: number;
  renderCell: (item: T, index: number) => HTMLElement;
  onCellClick?: (item: T) => void;
  emptyMessage?: string;
  emptyNode?: () => HTMLElement;
}

export class VirtualGrid<T> {
  private container: HTMLElement;
  private spacer: HTMLDivElement;
  private items: T[] = [];
  private opts: Required<Omit<VirtualGridOptions<T>, "emptyNode">> & Pick<VirtualGridOptions<T>, "emptyNode">;
  private cols = 3;
  private scrollHandler: () => void;
  private rafId: number | null = null;
  private ro: ResizeObserver;

  constructor(container: HTMLElement, options: VirtualGridOptions<T>) {
    this.container = container;
    this.opts = {
      gap: 10, buffer: 3, onCellClick: () => {}, emptyMessage: "No items", ...options,
    };
    container.style.overflowY = "auto";
    container.style.position  = "relative";

    this.spacer = document.createElement("div");
    this.spacer.style.position = "relative";
    this.spacer.style.width    = "100%";
    container.appendChild(this.spacer);

    this.scrollHandler = () => {
      if (this.rafId !== null) return;
      this.rafId = requestAnimationFrame(() => { this._render(); this.rafId = null; });
    };
    container.addEventListener("scroll", this.scrollHandler);

    this.ro = new ResizeObserver(() => {
      this._recalcCols();
      this._updateHeight();
      this._render();
    });
    this.ro.observe(container);
    this._recalcCols();
  }

  private _recalcCols(): void {
    const w = this.container.clientWidth || 320;
    this.cols = Math.max(1, Math.floor((w + this.opts.gap) / (160 + this.opts.gap)));
  }

  private _rowH(): number { return this.opts.cellHeight + this.opts.gap; }
  private _rowCount(): number { return Math.ceil(this.items.length / this.cols); }

  private _updateHeight(): void {
    this.spacer.style.height = this.items.length === 0 ? "0px" : `${this._rowCount() * this._rowH()}px`;
  }

  setItems(items: T[]): void {
    this.items = items;
    this._recalcCols();
    this._updateHeight();
    this.container.scrollTop = 0;
    this._render();
  }

  refresh(): void { this._render(); }

  clear(): void {
    this.items = [];
    this.spacer.innerHTML = "";
    this.spacer.style.height = "0px";
  }

  get count(): number { return this.items.length; }

  scrollToIndex(index: number): void {
    const row = Math.floor(index / this.cols);
    this.container.scrollTop = row * this._rowH();
  }

  destroy(): void {
    this.container.removeEventListener("scroll", this.scrollHandler);
    this.ro.disconnect();
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.spacer.remove();
  }

  private _render(): void {
    if (this.items.length === 0) {
      this.spacer.innerHTML = "";
      if (this.opts.emptyNode) {
        this.spacer.appendChild(this.opts.emptyNode());
      } else {
        const el = document.createElement("div");
        el.className = "virtual-list-empty";
        el.textContent = this.opts.emptyMessage;
        this.spacer.appendChild(el);
      }
      return;
    }

    const rowH    = this._rowH();
    const total   = this._rowCount();
    const scrollTop = this.container.scrollTop;
    const viewport  = this.container.clientHeight || 600;
    const buf = this.opts.buffer;

    const firstRow = Math.max(0, Math.floor(scrollTop / rowH) - buf);
    const lastRow  = Math.min(total - 1, Math.ceil((scrollTop + viewport) / rowH) + buf);

    this.spacer.innerHTML = "";
    const gap = this.opts.gap;

    for (let r = firstRow; r <= lastRow; r++) {
      const rowEl = document.createElement("div");
      rowEl.style.cssText = `position:absolute;top:${r * rowH}px;left:${gap}px;right:${gap}px;display:grid;grid-template-columns:repeat(${this.cols},1fr);gap:${gap}px`;

      const start = r * this.cols;
      const end   = Math.min(start + this.cols, this.items.length);
      for (let i = start; i < end; i++) {
        const cell = this.opts.renderCell(this.items[i], i);
        cell.style.cursor = "pointer";
        cell.addEventListener("click", () => this.opts.onCellClick(this.items[i]));
        rowEl.appendChild(cell);
      }
      this.spacer.appendChild(rowEl);
    }
  }
}
