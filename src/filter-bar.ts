/**
 * filter-bar.ts — Build filter bar UI dan wire event handlers.
 */

import type { FilterState } from "./filters.ts";
import { INITIAL_FILTER_STATE } from "./filters.ts";

export interface FilterBarRefs {
  search:   HTMLInputElement;
  setCode:  HTMLSelectElement;
  nation:   HTMLSelectElement;
  unitType: HTMLSelectElement;
  trigger:  HTMLSelectElement;
  clearBtn: HTMLButtonElement;
}

export function getFilterBarRefs(): FilterBarRefs {
  return {
    search:   document.querySelector<HTMLInputElement>("#searchInput")!,
    setCode:  document.querySelector<HTMLSelectElement>("#setFilter")!,
    nation:   document.querySelector<HTMLSelectElement>("#nationFilter")!,
    unitType: document.querySelector<HTMLSelectElement>("#unitTypeFilter")!,
    trigger:  document.querySelector<HTMLSelectElement>("#triggerFilter")!,
    clearBtn: document.querySelector<HTMLButtonElement>("#clearFiltersBtn")!,
  };
}

/**
 * Reset a select to its first option only (the "all" placeholder).
 * Called before re-populating to avoid accumulating options on region switch.
 */
function resetSelect(el: HTMLSelectElement): void {
  while (el.options.length > 1) el.remove(1);
}

/**
 * Populate dropdown options with unique values extracted from cards.
 * Clears existing options first — safe to call on every region switch.
 */
export function populateDropdowns(
  refs: FilterBarRefs,
  options: { setCodes: string[]; nations: string[]; unitTypes: string[]; triggers: string[] },
): void {
  resetSelect(refs.setCode);
  resetSelect(refs.nation);
  resetSelect(refs.unitType);
  resetSelect(refs.trigger);

  for (const code of options.setCodes) {
    refs.setCode.append(makeOption(code, code));
  }

  for (const nation of options.nations) {
    refs.nation.append(makeOption(nation, nation));
  }

  for (const ut of options.unitTypes) {
    refs.unitType.append(makeOption(ut, ut));
  }

  // Special "No trigger" option first, then dynamic trigger values
  refs.trigger.append(makeOption("__none__", "— Tidak ada trigger"));
  for (const t of options.triggers) {
    refs.trigger.append(makeOption(t, t));
  }
}

function makeOption(value: string, label: string): HTMLOptionElement {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label;
  return opt;
}

export function readFilterState(refs: FilterBarRefs): FilterState {
  return {
    search:   refs.search.value,
    setCode:  refs.setCode.value,
    nation:   refs.nation.value,
    unitType: refs.unitType.value,
    trigger:  refs.trigger.value,
  };
}

export function resetFilters(refs: FilterBarRefs): void {
  refs.search.value   = INITIAL_FILTER_STATE.search;
  refs.setCode.value  = INITIAL_FILTER_STATE.setCode;
  refs.nation.value   = INITIAL_FILTER_STATE.nation;
  refs.unitType.value = INITIAL_FILTER_STATE.unitType;
  refs.trigger.value  = INITIAL_FILTER_STATE.trigger;
}

export function setFilterActiveIndicator(active: boolean): void {
  document.getElementById("filterExpandBtn")?.classList.toggle("has-active", active);
}

export function attachFilterListeners(
  refs: FilterBarRefs,
  onChange: () => void,
): void {
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  refs.search.addEventListener("input", () => {
    if (searchTimer !== null) clearTimeout(searchTimer);
    searchTimer = setTimeout(onChange, 200);
  });

  refs.setCode.addEventListener("change",  onChange);
  refs.nation.addEventListener("change",   onChange);
  refs.unitType.addEventListener("change", onChange);
  refs.trigger.addEventListener("change",  onChange);
}
