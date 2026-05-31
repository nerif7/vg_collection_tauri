import type { Card, CollectionEntry } from "./types.ts";

export function buildCollectionRow(
  entry: CollectionEntry,
  card: Card | undefined,
  selected = false,
): HTMLElement {
  const row = document.createElement("div");
  row.className = selected ? "card-row card-row--selected" : "card-row";

  const codeEl = document.createElement("div");
  codeEl.className = "card-row-code";
  codeEl.textContent = entry.cardCode;

  const middle = document.createElement("div");
  middle.className = "card-row-middle";

  const name = document.createElement("div");
  name.className = "card-row-name";
  name.textContent = card?.displayName ?? entry.cardCode;

  const locationEl = document.createElement("div");
  locationEl.className = "card-row-meta";
  locationEl.textContent = entry.location || "—";

  middle.append(name, locationEl);

  const badge = document.createElement("span");
  badge.className = "card-row-qty-badge";
  badge.textContent = `×${entry.quantity}`;

  row.append(codeEl, middle, badge);
  return row;
}
