/**
 * card-row.ts — Build DOM element for a card row in the virtual list.
 */

import type { Card } from "./types.ts";

export function buildCardRow(
  card: Card,
  _index: number,
  selected = false,
  collectionQty?: number,
): HTMLElement {
  const row = document.createElement("div");
  row.className = selected ? "card-row card-row--selected" : "card-row";

  const codeEl = document.createElement("div");
  codeEl.className = "card-row-code";
  codeEl.textContent = card.enCardNo;

  const middle = document.createElement("div");
  middle.className = "card-row-middle";

  const name = document.createElement("div");
  name.className = "card-row-name";
  name.textContent = card.name;

  const meta = document.createElement("div");
  meta.className = "card-row-meta";
  const parts: string[] = [];
  if (card.unitType)           parts.push(card.unitType);
  if (card.grade !== null)     parts.push(`G${card.grade}`);
  if (card.trigger)            parts.push(card.trigger);
  if (card.nations.length > 0) parts.push(card.nations.join("/"));
  meta.textContent = parts.join(" · ");

  middle.append(name, meta);

  // Right side: rarity + optional collection badge
  const right = document.createElement("div");
  right.className = "card-row-right";

  if (collectionQty !== undefined && collectionQty > 0) {
    const badge = document.createElement("span");
    badge.className = "card-row-owned-badge";
    badge.textContent = `×${collectionQty}`;
    right.appendChild(badge);
  }

  const rarity = document.createElement("span");
  rarity.className = "card-row-rarity";
  rarity.textContent = card.rarity ?? "—";
  right.appendChild(rarity);

  row.append(codeEl, middle, right);
  return row;
}
