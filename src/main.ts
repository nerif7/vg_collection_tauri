/**
 * vg_collection_tauri — POC: hybrid cache loader
 *
 * Flow:
 *   App startup → cek IndexedDB cache
 *     ├─ Ada + fresh (<7 hari) → load dari cache, instant
 *     ├─ Ada + stale → load dari cache, BUT check GitHub for update in background
 *     └─ Tidak ada → fetch dari GitHub, save ke cache
 *
 *   Force Refresh button → bypass cache, fetch ulang dari GitHub
 */

import type { Card, FetchResult } from "./types.ts";
import {
  saveCards, loadCards,
  saveMeta,  loadMeta,
  clearCards, clearMeta,
  formatRelativeTime, isCacheStale,
  type CacheMeta,
} from "./cache.ts";
import "./styles.css";

const DB_URL     = "https://raw.githubusercontent.com/nerif7/vanguard-library-db/main/cards.json";
const COMMIT_API = "https://api.github.com/repos/nerif7/vanguard-library-db/commits?path=cards.json&per_page=1";

// ── State ─────────────────────────────────────────────────────────────────────
let cards: Card[] = [];

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loadBtn       = document.querySelector<HTMLButtonElement>("#loadBtn")!;
const refreshBtn    = document.querySelector<HTMLButtonElement>("#refreshBtn")!;
const clearBtn      = document.querySelector<HTMLButtonElement>("#clearBtn")!;
const statusEl      = document.querySelector<HTMLDivElement>("#status")!;
const statsEl       = document.querySelector<HTMLDivElement>("#stats")!;
const sampleListEl  = document.querySelector<HTMLDivElement>("#sampleList")!;
const cacheInfoEl   = document.querySelector<HTMLDivElement>("#cacheInfo")!;

// ── Fetch cards from GitHub ───────────────────────────────────────────────────

async function fetchFromGitHub(): Promise<FetchResult> {
  const fetchStart = performance.now();

  const response = await fetch(DB_URL, { cache: "no-cache" });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

  const text = await response.text();
  const fetchEnd = performance.now();
  const totalBytes = new Blob([text]).size;

  const parseStart = performance.now();
  const parsed = JSON.parse(text) as Card[];
  const parseEnd = performance.now();

  return {
    cards:       parsed,
    totalBytes,
    fetchTimeMs: fetchEnd - fetchStart,
    parseTimeMs: parseEnd - parseStart,
  };
}

/** Fetch latest commit SHA for cards.json (untuk track update). */
async function fetchLatestCommitSha(): Promise<string | null> {
  try {
    const res = await fetch(COMMIT_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data) && data[0]?.sha ? data[0].sha : null;
  } catch {
    return null;
  }
}

// ── Load from cache ──────────────────────────────────────────────────────────

async function loadFromCache(): Promise<{ cards: Card[]; meta: CacheMeta } | null> {
  const startTime = performance.now();
  const [cachedCards, meta] = await Promise.all([loadCards(), loadMeta()]);

  if (!cachedCards || cachedCards.length === 0 || !meta) {
    return null;
  }

  const loadTime = performance.now() - startTime;
  console.log(`Loaded ${cachedCards.length} cards from cache in ${loadTime.toFixed(0)} ms`);
  return { cards: cachedCards, meta };
}

// ── Render functions ──────────────────────────────────────────────────────────

function setStatus(msg: string, kind: "info" | "loading" | "success" | "error" = "info") {
  statusEl.textContent = msg;
  statusEl.className = `status status-${kind}`;
}

function renderStats(opts: {
  count: number;
  sizeBytes: number;
  fetchTimeMs?: number;
  parseTimeMs?: number;
  loadFromCacheMs?: number;
}) {
  const mb = (opts.sizeBytes / 1024 / 1024).toFixed(2);
  const cells: string[] = [
    `<div class="stat"><span class="stat-label">Total kartu</span><span class="stat-value">${opts.count.toLocaleString("id-ID")}</span></div>`,
    `<div class="stat"><span class="stat-label">Ukuran data</span><span class="stat-value">${mb} MB</span></div>`,
  ];

  if (opts.fetchTimeMs !== undefined) {
    cells.push(`<div class="stat"><span class="stat-label">Fetch time</span><span class="stat-value">${opts.fetchTimeMs.toFixed(0)} ms</span></div>`);
  }
  if (opts.parseTimeMs !== undefined) {
    cells.push(`<div class="stat"><span class="stat-label">Parse time</span><span class="stat-value">${opts.parseTimeMs.toFixed(0)} ms</span></div>`);
  }
  if (opts.loadFromCacheMs !== undefined) {
    cells.push(`<div class="stat"><span class="stat-label">Load from cache</span><span class="stat-value">${opts.loadFromCacheMs.toFixed(0)} ms ⚡</span></div>`);
  }

  statsEl.innerHTML = cells.join("");
}

function renderSample(cards: Card[]) {
  const sample = cards.slice(0, 10);
  sampleListEl.innerHTML = `
    <h3>Sample 10 kartu pertama</h3>
    <ul class="sample-list">
      ${sample.map((card) => `
        <li class="sample-item">
          <span class="sample-code">${escapeHtml(card.enCardNo)}</span>
          <span class="sample-name">${escapeHtml(card.name)}</span>
          <span class="sample-meta">${card.unitType ?? "—"} · ${card.nations.join("/") || "—"}</span>
        </li>
      `).join("")}
    </ul>
  `;
}

function renderCacheInfo(meta: CacheMeta | null) {
  if (!meta) {
    cacheInfoEl.innerHTML = `<span class="cache-empty">📭 Cache kosong</span>`;
    return;
  }

  const stale = isCacheStale(meta);
  const staleIcon = stale ? "⏰" : "✨";
  const staleText = stale ? "Stale (>7 hari)" : "Fresh";

  cacheInfoEl.innerHTML = `
    <div class="cache-row">
      <span class="cache-label">${staleIcon} Cache:</span>
      <span class="cache-value">${meta.cardCount.toLocaleString("id-ID")} kartu, ${(meta.sizeBytes / 1024 / 1024).toFixed(1)} MB</span>
    </div>
    <div class="cache-row">
      <span class="cache-label">Last fetch:</span>
      <span class="cache-value">${formatRelativeTime(meta.lastFetchAt)} <span class="cache-status">(${staleText})</span></span>
    </div>
  `;
}

function escapeHtml(s: string): string {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// ── Main load flow ────────────────────────────────────────────────────────────

async function handleLoad() {
  loadBtn.disabled = true;
  refreshBtn.disabled = true;
  clearBtn.disabled = true;
  setStatus("Loading...", "loading");
  statsEl.innerHTML = "";
  sampleListEl.innerHTML = "";

  try {
    // Try cache first
    const startLoadCache = performance.now();
    const cached = await loadFromCache();
    const loadCacheTime = performance.now() - startLoadCache;

    if (cached) {
      // Cache hit! Use it.
      cards = cached.cards;

      const stale = isCacheStale(cached.meta);
      const icon  = stale ? "⏰" : "⚡";
      setStatus(
        `${icon} Loaded ${cards.length.toLocaleString("id-ID")} cards from cache in ${loadCacheTime.toFixed(0)} ms`,
        "success",
      );
      renderStats({
        count: cards.length,
        sizeBytes: cached.meta.sizeBytes,
        loadFromCacheMs: loadCacheTime,
      });
      renderSample(cards);
      renderCacheInfo(cached.meta);

      if (stale) {
        console.log("Cache is stale (>7 days). User can click Force Refresh to update.");
      }
    } else {
      // No cache. Fetch fresh.
      await doFetchAndCache();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`❌ Failed: ${msg}`, "error");
    console.error(err);
  } finally {
    loadBtn.disabled    = false;
    refreshBtn.disabled = false;
    clearBtn.disabled   = false;
  }
}

async function doFetchAndCache() {
  setStatus("Fetching from GitHub...", "loading");

  const result = await fetchFromGitHub();
  cards = result.cards;

  // Get commit SHA for tracking (best-effort)
  const sha = await fetchLatestCommitSha();

  // Save to cache
  setStatus("Saving to cache...", "loading");
  await saveCards(result.cards);
  const meta: CacheMeta = {
    lastFetchAt:   Date.now(),
    lastCommitSha: sha,
    cardCount:     result.cards.length,
    sizeBytes:     result.totalBytes,
  };
  await saveMeta(meta);

  setStatus(
    `✅ Fetched ${result.cards.length.toLocaleString("id-ID")} cards in ${(result.fetchTimeMs + result.parseTimeMs).toFixed(0)} ms (cached for next time)`,
    "success",
  );
  renderStats({
    count: result.cards.length,
    sizeBytes: result.totalBytes,
    fetchTimeMs: result.fetchTimeMs,
    parseTimeMs: result.parseTimeMs,
  });
  renderSample(result.cards);
  renderCacheInfo(meta);
}

// ── Force refresh ─────────────────────────────────────────────────────────────

async function handleForceRefresh() {
  loadBtn.disabled = true;
  refreshBtn.disabled = true;
  clearBtn.disabled = true;
  statsEl.innerHTML = "";
  sampleListEl.innerHTML = "";

  try {
    await doFetchAndCache();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`❌ Refresh failed: ${msg}`, "error");
  } finally {
    loadBtn.disabled    = false;
    refreshBtn.disabled = false;
    clearBtn.disabled   = false;
  }
}

// ── Clear cache ───────────────────────────────────────────────────────────────

async function handleClearCache() {
  if (!confirm("Hapus semua cache? Klik 'Load' setelah hapus untuk fetch ulang dari GitHub.")) {
    return;
  }

  try {
    await Promise.all([clearCards(), clearMeta()]);
    cards = [];
    setStatus("🗑️ Cache cleared. Click 'Load Cards' to fetch fresh.", "info");
    statsEl.innerHTML = "";
    sampleListEl.innerHTML = "";
    renderCacheInfo(null);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`❌ Clear failed: ${msg}`, "error");
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  loadBtn.addEventListener("click", handleLoad);
  refreshBtn.addEventListener("click", handleForceRefresh);
  clearBtn.addEventListener("click", handleClearCache);

  // Show current cache state on startup
  const meta = await loadMeta();
  renderCacheInfo(meta);

  if (meta) {
    setStatus(`Cache tersedia (${meta.cardCount.toLocaleString("id-ID")} kartu). Click 'Load' untuk pakai cache, atau 'Force Refresh' untuk fetch ulang.`, "info");
  } else {
    setStatus("Belum ada cache. Click 'Load Cards' untuk fetch dari GitHub.", "info");
  }
}

init();
