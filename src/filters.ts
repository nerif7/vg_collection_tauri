/**
 * filters.ts — Pure filter logic (no DOM).
 * Testable, separate from UI concerns.
 */

import type { Card } from "./types.ts";

export interface FilterState {
  search:   string;
  setCode:  string;   // "all" = no filter
  nation:   string;   // "all" = no filter
  unitType: string;   // "all" = no filter
  trigger:  string;   // "all", "__none__", or trigger value
}

export const INITIAL_FILTER_STATE: FilterState = {
  search:   "",
  setCode:  "all",
  nation:   "all",
  unitType: "all",
  trigger:  "all",
};

export function applyFilters(cards: Card[], filter: FilterState): Card[] {
  const query = filter.search.trim().toLowerCase();

  return cards.filter((card) => {
    if (filter.setCode !== "all" && card.setCode !== filter.setCode) return false;
    if (filter.unitType !== "all" && card.unitType !== filter.unitType) return false;

    if (filter.trigger !== "all") {
      if (filter.trigger === "__none__") {
        if (card.trigger !== null) return false;
      } else {
        if (card.trigger !== filter.trigger) return false;
      }
    }

    if (filter.nation !== "all") {
      if (!card.nations.includes(filter.nation)) return false;
    }

    if (query) {
      const haystack = [
        card.displayName,
        card.cardNo,
        card.setCode,
        card.unitType ?? "",
        ...(card.races   ?? []),
        ...(card.clan    ?? []),
        ...(card.nations ?? []),
      ].join(" ").toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });
}

/**
 * Extract unique dropdown values from cards.
 * unitTypes and triggers are dynamic — correct for both EN and JP cards.
 */
export function extractUniqueOptions(cards: Card[]): {
  setCodes:  string[];
  nations:   string[];
  unitTypes: string[];
  triggers:  string[];
} {
  const setCodeSet  = new Set<string>();
  const nationSet   = new Set<string>();
  const unitTypeSet = new Set<string>();
  const triggerSet  = new Set<string>();

  for (const card of cards) {
    if (card.setCode)  setCodeSet.add(card.setCode);
    if (card.unitType) unitTypeSet.add(card.unitType);
    if (card.trigger)  triggerSet.add(card.trigger);
    for (const n of card.nations) nationSet.add(n);
  }

  return {
    setCodes:  [...setCodeSet].sort(),
    nations:   [...nationSet].sort(),
    unitTypes: [...unitTypeSet].sort(),
    triggers:  [...triggerSet].sort(),
  };
}

export function hasActiveFilter(filter: FilterState): boolean {
  return (
    filter.search.trim() !== "" ||
    filter.setCode  !== "all" ||
    filter.nation   !== "all" ||
    filter.unitType !== "all" ||
    filter.trigger  !== "all"
  );
}

export type BrowseSortKey = "name" | "code" | "grade-asc" | "grade-desc" | "owned-desc";

export function sortCards(
  cards: Card[],
  key: BrowseSortKey,
  qtyMap?: Map<string, number>,
): Card[] {
  const arr = [...cards];
  switch (key) {
    case "name":
      arr.sort((a, b) => a.displayName.localeCompare(b.displayName));
      break;
    case "code":
      arr.sort((a, b) => a.cardNo.localeCompare(b.cardNo));
      break;
    case "grade-asc":
      arr.sort((a, b) =>
        (a.grade ?? 99) - (b.grade ?? 99) || a.displayName.localeCompare(b.displayName),
      );
      break;
    case "grade-desc":
      arr.sort((a, b) =>
        (b.grade ?? -1) - (a.grade ?? -1) || a.displayName.localeCompare(b.displayName),
      );
      break;
    case "owned-desc":
      arr.sort((a, b) => {
        const qa = qtyMap?.get(a.cardNo) ?? 0;
        const qb = qtyMap?.get(b.cardNo) ?? 0;
        return qb - qa || a.displayName.localeCompare(b.displayName);
      });
      break;
  }
  return arr;
}
