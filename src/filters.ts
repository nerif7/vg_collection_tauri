/**
 * filters.ts — Pure filter logic (no DOM).
 * Testable, separate from UI concerns.
 */

import type { Card, UnitType, TriggerType } from "./types.ts";

export interface FilterState {
  search:   string;
  setCode:  string;   // "all" untuk no filter
  nation:   string;   // "all" untuk no filter
  unitType: string;   // "all" untuk no filter, atau UnitType
  trigger:  string;   // "all", "__none__", atau TriggerType
}

export const INITIAL_FILTER_STATE: FilterState = {
  search:   "",
  setCode:  "all",
  nation:   "all",
  unitType: "all",
  trigger:  "all",
};

/**
 * Apply filter to cards array.
 * Returns new array dengan cards yang lolos semua filter criteria.
 */
export function applyFilters(cards: Card[], filter: FilterState): Card[] {
  const query = filter.search.trim().toLowerCase();

  return cards.filter((card) => {
    // Filter: setCode
    if (filter.setCode !== "all" && card.setCode !== filter.setCode) {
      return false;
    }

    // Filter: unitType
    if (filter.unitType !== "all" && card.unitType !== filter.unitType) {
      return false;
    }

    // Filter: trigger
    if (filter.trigger !== "all") {
      if (filter.trigger === "__none__") {
        // "No trigger" - kartu tanpa trigger
        if (card.trigger !== null) return false;
      } else {
        if (card.trigger !== filter.trigger) return false;
      }
    }

    // Filter: nation (single nation match dari array)
    if (filter.nation !== "all") {
      if (!card.nations.includes(filter.nation)) return false;
    }

    // Filter: search text (multi-field)
    if (query) {
      const haystack = [
        card.name,
        card.enCardNo,
        card.setCode,
        card.unitType ?? "",
        ...(card.races ?? []),
        ...(card.clan ?? []),
        ...(card.nations ?? []),
      ].join(" ").toLowerCase();
      if (!haystack.includes(query)) return false;
    }

    return true;
  });
}

/**
 * Extract unique values dari cards untuk populate dropdown options.
 * Sorted alphabetically.
 */
export function extractUniqueOptions(cards: Card[]): {
  setCodes: string[];
  nations:  string[];
} {
  const setCodeSet = new Set<string>();
  const nationSet  = new Set<string>();

  for (const card of cards) {
    if (card.setCode) setCodeSet.add(card.setCode);
    for (const n of card.nations) nationSet.add(n);
  }

  return {
    setCodes: [...setCodeSet].sort(),
    nations:  [...nationSet].sort(),
  };
}

/** Check apakah ada filter yang aktif (untuk show "Clear filters" button). */
export function hasActiveFilter(filter: FilterState): boolean {
  return (
    filter.search.trim() !== "" ||
    filter.setCode  !== "all" ||
    filter.nation   !== "all" ||
    filter.unitType !== "all" ||
    filter.trigger  !== "all"
  );
}

// Constants for dropdown options
export const UNIT_TYPE_OPTIONS: UnitType[] = [
  "Normal Unit",
  "G Unit",
  "Normal Order",
  "Set Order",
  "Blitz Order",
  "Trigger Order",
  "Token",
  "Ride Deck Crest",
  "Others",
];

export const TRIGGER_OPTIONS: Exclude<TriggerType, null>[] = [
  "Critical",
  "Draw",
  "Heal",
  "Front",
  "Over",
  "Sentinel",
];
