import type { Card } from "./types.ts";

export function buildCardTile(
  card: Card | null | undefined,
  selected = false,
  opts?: { badgeQty?: number; extraInfo?: string },
): HTMLElement {
  const tile = document.createElement("div");
  tile.className = selected ? "card-tile card-tile--selected" : "card-tile";

  // ── Image wrap ─────────────────────────────────────────────────────────────
  const imgWrap = document.createElement("div");
  imgWrap.className = "card-tile-img-wrap";

  if (card?.imageUrlEn) {
    const img = document.createElement("img");
    img.src       = card.imageUrlEn;
    img.alt       = card.name;
    img.loading   = "lazy";
    img.className = "card-tile-img";
    imgWrap.appendChild(img);
  } else {
    const ph = document.createElement("div");
    ph.className  = "card-tile-img-placeholder";
    ph.textContent = "No image";
    imgWrap.appendChild(ph);
  }

  if (opts?.badgeQty !== undefined && opts.badgeQty > 0) {
    const badge = document.createElement("span");
    badge.className  = "card-tile-owned-badge";
    badge.textContent = `×${opts.badgeQty}`;
    imgWrap.appendChild(badge);
  }

  // ── Info section ───────────────────────────────────────────────────────────
  const info = document.createElement("div");
  info.className = "card-tile-info";

  const nameEl = document.createElement("div");
  nameEl.className  = "card-tile-name";
  nameEl.textContent = card?.name ?? "Unknown";

  const codeEl = document.createElement("div");
  codeEl.className  = "card-tile-code";
  codeEl.textContent = card?.enCardNo ?? "—";

  const metaEl = document.createElement("div");
  metaEl.className = "card-tile-meta";
  const parts: string[] = [];
  if (card?.rarity) parts.push(card.rarity);
  if (card?.nations && card.nations.length > 0) parts.push(card.nations.join("/"));
  metaEl.textContent = parts.join(" · ") || "—";

  info.append(nameEl, codeEl, metaEl);

  if (opts?.extraInfo) {
    const extraEl = document.createElement("div");
    extraEl.className  = "card-tile-extra";
    extraEl.textContent = opts.extraInfo;
    info.appendChild(extraEl);
  }

  tile.append(imgWrap, info);
  return tile;
}
