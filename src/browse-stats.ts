import { isCacheStale, formatRelativeTime, type CacheMeta } from "./cache.ts";

const statusEl        = document.querySelector<HTMLDivElement>("#status")!;
const statsEl         = document.querySelector<HTMLDivElement>("#stats")!;
const cacheInfoEl     = document.querySelector<HTMLDivElement>("#cacheInfo")!;
const updateSpinnerEl = document.querySelector<HTMLElement>("#updateSpinner")!;
const progressBarEl   = document.getElementById("startupProgress");

export function setStartupProgress(pct: number): void {
  if (!progressBarEl) return;
  progressBarEl.style.width = `${pct}%`;
  if (pct >= 100) setTimeout(() => progressBarEl.classList.add("done"), 300);
}

export function setStatus(
  msg: string,
  kind: "info" | "loading" | "success" | "error" = "info",
): void {
  statusEl.textContent = msg;
  statusEl.className = `status status-${kind}`;
}

export function renderStats(opts: {
  count: number;
  sizeBytes: number;
  fetchTimeMs?: number;
  parseTimeMs?: number;
  loadFromCacheMs?: number;
  renderTimeMs?: number;
}): void {
  const mb = (opts.sizeBytes / 1024 / 1024).toFixed(2);
  const cells: string[] = [
    cell("Total cards", opts.count.toLocaleString("id-ID")),
    cell("Data size", `${mb} MB`),
  ];
  if (opts.fetchTimeMs !== undefined)     cells.push(cell("Fetch time",  `${opts.fetchTimeMs.toFixed(0)} ms`));
  if (opts.parseTimeMs !== undefined)     cells.push(cell("Parse time",  `${opts.parseTimeMs.toFixed(0)} ms`));
  if (opts.loadFromCacheMs !== undefined) cells.push(cell("Load cache",  `${opts.loadFromCacheMs.toFixed(0)} ms ⚡`));
  if (opts.renderTimeMs !== undefined)    cells.push(cell("Render list", `${opts.renderTimeMs.toFixed(0)} ms 🚀`));
  statsEl.innerHTML = cells.join("");
}

export function clearStats(): void {
  statsEl.innerHTML = "";
}

function cell(label: string, value: string): string {
  return `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
}

export function renderCacheInfo(meta: CacheMeta | null): void {
  if (!meta) {
    cacheInfoEl.innerHTML = `<span class="cache-empty">Cache empty</span>`;
    return;
  }
  const stale = isCacheStale(meta);
  cacheInfoEl.innerHTML = `
    <div class="cache-row">
      <span class="cache-label">${stale ? "⏰" : "✨"} Cache:</span>
      <span class="cache-value">${meta.cardCount.toLocaleString("id-ID")} cards, ${(meta.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
    </div>
    <div class="cache-row">
      <span class="cache-label">Last fetch:</span>
      <span class="cache-value">${formatRelativeTime(meta.lastFetchAt)} <span class="cache-status">(${stale ? "Stale" : "Fresh"})</span></span>
    </div>
  `;
}

export function showUpdateSpinner(visible: boolean): void {
  updateSpinnerEl.hidden = !visible;
}
