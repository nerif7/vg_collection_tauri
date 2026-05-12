/**
 * virtual-list.ts — Reusable virtualized list renderer.
 *
 * Hanya render rows yang visible di viewport (+ buffer atas/bawah).
 * Performance: bisa handle 24k+ rows dengan smooth scroll.
 *
 * Usage:
 *   const list = new VirtualList<Card>(container, {
 *     rowHeight: 62,
 *     renderRow: (card, index) => buildCardRowElement(card),
 *   });
 *   list.setItems(cards);
 */

export interface VirtualListOptions<T> {
  /** Tinggi tiap row dalam pixel. Wajib fixed untuk simple math. */
  rowHeight: number;
  /** Berapa rows extra di-render atas/bawah viewport (smoothness buffer). */
  buffer?: number;
  /** Function untuk build DOM element per row. */
  renderRow: (item: T, index: number) => HTMLElement;
  /** Optional: callback saat row di-click. */
  onRowClick?: (item: T, index: number) => void;
  /** Optional: pesan saat list kosong. */
  emptyMessage?: string;
}

export class VirtualList<T> {
  private container: HTMLElement;
  private spacer: HTMLDivElement;
  private items: T[] = [];
  private options: Required<VirtualListOptions<T>>;
  private scrollHandler: () => void;
  private rafId: number | null = null;

  constructor(container: HTMLElement, options: VirtualListOptions<T>) {
    this.container = container;
    this.options = {
      buffer:       6,
      onRowClick:   () => {},
      emptyMessage: "Tidak ada hasil",
      ...options,
    };

    // Container styling
    this.container.style.overflowY = "auto";
    this.container.style.position  = "relative";

    // Inner spacer (tinggi = total rows × rowHeight)
    this.spacer = document.createElement("div");
    this.spacer.style.position = "relative";
    this.spacer.style.width    = "100%";
    this.container.appendChild(this.spacer);

    // Scroll handler dengan requestAnimationFrame throttling
    this.scrollHandler = () => {
      if (this.rafId !== null) return;
      this.rafId = requestAnimationFrame(() => {
        this.renderVisible();
        this.rafId = null;
      });
    };
    this.container.addEventListener("scroll", this.scrollHandler);
  }

  /** Set items baru, otomatis re-render. */
  setItems(items: T[]): void {
    this.items = items;
    this.spacer.style.height = `${items.length * this.options.rowHeight}px`;
    this.container.scrollTop = 0; // reset scroll ke atas
    this.renderVisible();
  }

  /** Tambah items ke akhir (untuk incremental loading). */
  appendItems(newItems: T[]): void {
    this.items = [...this.items, ...newItems];
    this.spacer.style.height = `${this.items.length * this.options.rowHeight}px`;
    this.renderVisible();
  }

  /** Hapus semua items. */
  clear(): void {
    this.items = [];
    this.spacer.innerHTML = "";
    this.spacer.style.height = "0px";
  }

  /** Get item count. */
  get count(): number {
    return this.items.length;
  }

  /** Scroll to specific index. */
  scrollToIndex(index: number): void {
    const targetTop = index * this.options.rowHeight;
    this.container.scrollTop = targetTop;
  }

  /** Cleanup — call saat component di-destroy. */
  destroy(): void {
    this.container.removeEventListener("scroll", this.scrollHandler);
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.spacer.remove();
  }

  // ── Internal: render rows yang visible ──────────────────────────────────────

  private renderVisible(): void {
    const total = this.items.length;

    // Handle empty state
    if (total === 0) {
      this.spacer.innerHTML = `
        <div class="virtual-list-empty">${this.escapeHtml(this.options.emptyMessage)}</div>
      `;
      return;
    }

    const { rowHeight, buffer, renderRow } = this.options;
    const scrollTop   = this.container.scrollTop;
    const viewport    = this.container.clientHeight || 600;

    const firstIdx = Math.max(0, Math.floor(scrollTop / rowHeight) - buffer);
    const lastIdx  = Math.min(total - 1, Math.ceil((scrollTop + viewport) / rowHeight) + buffer);

    // Clear and re-render visible range
    this.spacer.innerHTML = "";

    for (let i = firstIdx; i <= lastIdx; i++) {
      const item = this.items[i];
      const row = renderRow(item, i);
      row.style.position = "absolute";
      row.style.top      = `${i * rowHeight}px`;
      row.style.left     = "0";
      row.style.right    = "0";
      row.style.height   = `${rowHeight}px`;

      // Wire click handler
      if (this.options.onRowClick) {
        row.style.cursor = "pointer";
        row.addEventListener("click", () => this.options.onRowClick(item, i));
      }

      this.spacer.appendChild(row);
    }
  }

  private escapeHtml(s: string): string {
    const div = document.createElement("div");
    div.textContent = s;
    return div.innerHTML;
  }
}
