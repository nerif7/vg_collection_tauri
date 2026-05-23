import type { Card, WishlistEntry } from "./types.ts";

export function buildWishlistRow(
  entry: WishlistEntry,
  card: Card | undefined,
  selected: boolean,
): HTMLElement {
  const row = document.createElement("div");
  row.className = selected ? "card-row card-row--selected" : "card-row";

  const codeEl = document.createElement("div");
  codeEl.className = "card-row-code";
  codeEl.textContent = entry.cardCode;

  const middle = document.createElement("div");
  middle.className = "card-row-middle";

  const nameEl = document.createElement("div");
  nameEl.className = "card-row-name";
  nameEl.textContent = card?.displayName ?? entry.cardCode;

  const metaEl = document.createElement("div");
  metaEl.className = "card-row-meta";
  if (card) {
    const parts: string[] = [];
    if (card.unitType) parts.push(card.unitType);
    if (card.grade !== null) parts.push(`G${card.grade}`);
    if (card.nations.length > 0) parts.push(card.nations.join("/"));
    metaEl.textContent = parts.join(" · ");
  }

  middle.append(nameEl, metaEl);

  const rarityEl = document.createElement("span");
  rarityEl.className = "card-row-rarity";
  rarityEl.textContent = card?.rarity ?? "—";

  row.append(codeEl, middle, rarityEl);
  return row;
}
