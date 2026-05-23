import type { Card } from "./types.ts";
import type { CacheMeta } from "./cache.ts";
import { formatRelativeTime } from "./cache.ts";
import { getAllCollectionEntries, getAllWishlistEntries } from "./collection-db.ts";
import { createStatsCollapsible } from "./stats-collapsible.ts";

let statsBody: HTMLElement | null = null;

export function initOverviewTab(): void {
  const el = document.getElementById("overviewStats");
  if (!el) return;
  statsBody = createStatsCollapsible(el);
}

export async function loadOverviewTab(
  enCards:      Card[],
  jpCards:      Card[],
  enMeta:       CacheMeta | null,
  jpMeta:       CacheMeta | null,
  activeRegion: "EN" | "JP",
  onSwitch:     (region: "EN" | "JP") => void,
): Promise<void> {
  if (!statsBody) return;

  const [collection, wishlist] = await Promise.all([
    getAllCollectionEntries(),
    getAllWishlistEntries(),
  ]);

  const enCol  = collection.filter((e) => (e.region ?? "EN") === "EN");
  const jpCol  = collection.filter((e) => (e.region ?? "EN") === "JP");
  const enWish = wishlist.filter((w) => (w.region ?? "EN") === "EN");
  const jpWish = wishlist.filter((w) => (w.region ?? "EN") === "JP");

  statsBody.innerHTML = [
    stat("EN Database", enCards.length ? `${enCards.length.toLocaleString()} cards` : "—"),
    stat("EN Updated",  enMeta  ? formatRelativeTime(enMeta.lastFetchAt) : "Not loaded"),
    stat("EN Owned",    new Set(enCol.map((e) => e.cardCode)).size.toLocaleString()),
    stat("EN Wishlist", enWish.length.toLocaleString()),
    stat("JP Database", jpCards.length ? `${jpCards.length.toLocaleString()} cards` : "—"),
    stat("JP Updated",  jpMeta  ? formatRelativeTime(jpMeta.lastFetchAt) : "Not loaded"),
    stat("JP Owned",    new Set(jpCol.map((e) => e.cardCode)).size.toLocaleString()),
    stat("JP Wishlist", jpWish.length.toLocaleString()),
  ].join("");

  const switchRow = document.getElementById("overviewSwitchRow");
  if (!switchRow) return;
  switchRow.innerHTML = "";
  for (const region of ["EN", "JP"] as const) {
    const btn = document.createElement("button");
    btn.type      = "button";
    btn.className = `btn-secondary${activeRegion === region ? " is-active" : ""}`;
    btn.textContent = `View ${region}`;
    btn.addEventListener("click", () => onSwitch(region));
    switchRow.appendChild(btn);
  }
}

function stat(label: string, value: string): string {
  return `<div class="stat"><span class="stat-label">${label}</span><span class="stat-value">${value}</span></div>`;
}
