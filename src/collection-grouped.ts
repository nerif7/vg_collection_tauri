import type { Card, CollectionEntry } from "./types.ts";
import { buildCollectionRow } from "./collection-row.ts";

let _lastSig = "";

export function renderGroupedView(
  container: HTMLElement,
  entries: CollectionEntry[],
  cardMap: Map<string, Card>,
  collapsed: Set<string>,
  onToggle: (location: string) => void,
  onEntryClick: (entry: CollectionEntry) => void,
  selectedId: number | null,
): void {
  const sig = entries.map((e) => `${e.id}:${e.quantity}`).join(",")
    + `|${selectedId}|`
    + [...collapsed].sort().join(",");
  if (sig === _lastSig) return;
  _lastSig = sig;

  container.innerHTML = "";

  if (entries.length === 0) {
    const empty = document.createElement("div");
    empty.className  = "virtual-list-empty";
    empty.textContent = "No cards in collection yet — add from Browse tab";
    container.appendChild(empty);
    return;
  }

  // Group by location
  const groups = new Map<string, CollectionEntry[]>();
  for (const e of entries) {
    const loc = e.location || "—";
    const arr = groups.get(loc);
    if (arr) arr.push(e);
    else groups.set(loc, [e]);
  }

  const sortedLocs = [...groups.keys()].sort((a, b) => a.localeCompare(b));

  for (const loc of sortedLocs) {
    const locEntries = sortInGroup(groups.get(loc)!, cardMap);
    const totalQty   = locEntries.reduce((s, e) => s + e.quantity, 0);
    const isCollapsed = collapsed.has(loc);

    // Group header
    const header = document.createElement("div");
    header.className = "group-header";
    header.setAttribute("role", "button");
    header.addEventListener("click", () => onToggle(loc));

    const arrow = document.createElement("span");
    arrow.className  = "group-arrow";
    arrow.textContent = isCollapsed ? "▸" : "▾";

    const titleEl = document.createElement("span");
    titleEl.className  = "group-title";
    titleEl.textContent = loc;

    const metaEl = document.createElement("span");
    metaEl.className  = "group-meta";
    metaEl.textContent = `${locEntries.length} entries · ×${totalQty}`;

    header.append(arrow, titleEl, metaEl);
    container.appendChild(header);

    if (!isCollapsed) {
      const rowsEl = document.createElement("div");
      rowsEl.className = "group-rows";
      for (const e of locEntries) {
        const row = buildCollectionRow(e, cardMap.get(e.cardCode), e.id === selectedId);
        row.style.cursor = "pointer";
        row.addEventListener("click", () => onEntryClick(e));
        rowsEl.appendChild(row);
      }
      container.appendChild(rowsEl);
    }
  }
}

function sortInGroup(entries: CollectionEntry[], cardMap: Map<string, Card>): CollectionEntry[] {
  return [...entries].sort((a, b) => {
    const ga = cardMap.get(a.cardCode)?.grade ?? 99;
    const gb = cardMap.get(b.cardCode)?.grade ?? 99;
    if (ga !== gb) return ga - gb;
    const na = cardMap.get(a.cardCode)?.name ?? a.cardCode;
    const nb = cardMap.get(b.cardCode)?.name ?? b.cardCode;
    return na.localeCompare(nb);
  });
}
