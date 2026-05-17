/**
 * filter-bar.ts — Build filter bar UI dan wire event handlers.
 */

import type { FilterState } from "./filters.ts";
import { UNIT_TYPE_OPTIONS, TRIGGER_OPTIONS, INITIAL_FILTER_STATE } from "./filters.ts";

export interface FilterBarRefs {
  search:   HTMLInputElement;
  setCode:  HTMLSelectElement;
  nation:   HTMLSelectElement;
  unitType: HTMLSelectElement;
  trigger:  HTMLSelectElement;
  clearBtn: HTMLButtonElement;
}

/**
 * Get all filter bar DOM references.
 * Call setelah DOM ready.
 */
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
 * Populate dropdown options dengan unique values dari cards.
 */
export function populateDropdowns(
  refs: FilterBarRefs,
  options: { setCodes: string[]; nations: string[] },
): void {
  // Set codes
  for (const code of options.setCodes) {
    refs.setCode.append(makeOption(code, code));
  }

  // Nations
  for (const nation of options.nations) {
    refs.nation.append(makeOption(nation, nation));
  }

  // UnitType (static enum)
  for (const ut of UNIT_TYPE_OPTIONS) {
    refs.unitType.append(makeOption(ut, ut));
  }

  // Trigger (static enum + special "No trigger" option)
  refs.trigger.append(makeOption("__none__", "— Tidak ada trigger"));
  for (const t of TRIGGER_OPTIONS) {
    refs.trigger.append(makeOption(t, t));
  }
}

function makeOption(value: string, label: string): HTMLOptionElement {
  const opt = document.createElement("option");
  opt.value = value;
  opt.textContent = label;
  return opt;
}

/**
 * Read current state dari DOM controls.
 */
export function readFilterState(refs: FilterBarRefs): FilterState {
  return {
    search:   refs.search.value,
    setCode:  refs.setCode.value,
    nation:   refs.nation.value,
    unitType: refs.unitType.value,
    trigger:  refs.trigger.value,
  };
}

/**
 * Reset all filters ke initial state.
 */
export function resetFilters(refs: FilterBarRefs): void {
  refs.search.value   = INITIAL_FILTER_STATE.search;
  refs.setCode.value  = INITIAL_FILTER_STATE.setCode;
  refs.nation.value   = INITIAL_FILTER_STATE.nation;
  refs.unitType.value = INITIAL_FILTER_STATE.unitType;
  refs.trigger.value  = INITIAL_FILTER_STATE.trigger;
}

/** Toggle has-active class on the mobile Filter button when any filter is active. */
export function setFilterActiveIndicator(active: boolean): void {
  document.getElementById("filterExpandBtn")?.classList.toggle("has-active", active);
}

/**
 * Wire all filter controls to call onChange callback.
 * Search input gets debounced (200ms).
 */
export function attachFilterListeners(
  refs: FilterBarRefs,
  onChange: () => void,
): void {
  // Search input: debounced
  let searchTimer: ReturnType<typeof setTimeout> | null = null;
  refs.search.addEventListener("input", () => {
    if (searchTimer !== null) clearTimeout(searchTimer);
    searchTimer = setTimeout(onChange, 200);
  });

  // Dropdowns: immediate
  refs.setCode.addEventListener("change",  onChange);
  refs.nation.addEventListener("change",   onChange);
  refs.unitType.addEventListener("change", onChange);
  refs.trigger.addEventListener("change",  onChange);
}
