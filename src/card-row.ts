/**
 * card-row.ts — Build DOM element for a card row in the virtual list.
 */

import type { Card } from "./types.ts";

export function buildCardRow(card: Card): HTMLElement {
  const row = document.createElement("div");
  row.className = "card-row";

  // Column 1: cardCode (monospace, blue)
  const codeEl = document.createElement("div");
  codeEl.className = "card-row-code";
  codeEl.textContent = card.enCardNo;

  // Column 2: name + meta (flexible)
  const middle = document.createElement("div");
  middle.className = "card-row-middle";

  const name = document.createElement("div");
  name.className = "card-row-name";
  name.textContent = card.name;

  const meta = document.createElement("div");
  meta.className = "card-row-meta";
  const parts: string[] = [];
  if (card.unitType)             parts.push(card.unitType);
  if (card.grade !== null)       parts.push(`G${card.grade}`);
  if (card.trigger)              parts.push(card.trigger);
  if (card.nations.length > 0)   parts.push(card.nations.join("/"));
  meta.textContent = parts.join(" · ");

  middle.append(name, meta);

  // Column 3: rarity badge
  const rarity = document.createElement("span");
  rarity.className = "card-row-rarity";
  rarity.textContent = card.rarity ?? "—";

  row.append(codeEl, middle, rarity);
  return row;
}
