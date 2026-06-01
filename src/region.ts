import type { Card, Settings } from "./types.ts";
import { saveSettings } from "./settings.ts";
import { showOnboarding } from "./onboarding.ts";
import { showContextMenu } from "./context-menu.ts";
import { reloadBrowseTab } from "./browse-tab.ts";
import { loadCollectionTab } from "./collection-tab.ts";
import { loadWishlistTab } from "./wishlist-tab.ts";

interface RegionState {
  allEnCards:       Card[];
  allJpCards:       Card[];
  allCards:         Card[];
  activeRegion:     "EN" | "JP";
  regionPreference: "EN" | "JP" | "BOTH";
  collectionQtyMap: Map<string, number>;
}

export function updateRegionButton(
  regionPreference: "EN" | "JP" | "BOTH",
  activeRegion: "EN" | "JP"
): void {
  const btn       = document.getElementById("regionBtn")       as HTMLButtonElement | null;
  const switchBtn = document.getElementById("regionSwitchBtn") as HTMLButtonElement | null;
  if (!btn) return;

  if (regionPreference === "BOTH") {
    btn.textContent = "Both";
    if (switchBtn) {
      switchBtn.textContent = `${activeRegion} ▾`;
      switchBtn.hidden = false;
    }
  } else {
    btn.textContent = regionPreference;
    if (switchBtn) switchBtn.hidden = true;
  }
}

export async function switchRegion(
  region: "EN" | "JP",
  state: RegionState,
  refreshCollectionOverlay: () => Promise<void>
): Promise<void> {
  if (state.activeRegion === region) return;
  state.activeRegion = region;
  state.allCards     = region === "JP" ? state.allJpCards : state.allEnCards;

  await saveSettings({ region_preference: state.regionPreference, last_active_region: region, migration_version: 1 });
  reloadBrowseTab(state.allCards, state.collectionQtyMap);
  await Promise.all([
    loadCollectionTab(region, state.allCards, state.regionPreference),
    loadWishlistTab(region, state.allCards),
    refreshCollectionOverlay(),
  ]);
  updateRegionButton(state.regionPreference, region);
}

export async function openChangeRegionDialog(
  regionPreference: "EN" | "JP" | "BOTH",
  activeRegion: "EN" | "JP"
): Promise<void> {
  const chosen = await showOnboarding(regionPreference);
  if (chosen === regionPreference) return;

  const newSettings: Settings = {
    region_preference:  chosen,
    last_active_region: chosen === "BOTH" ? activeRegion : (chosen as "EN" | "JP"),
    migration_version:  1,
  };
  await saveSettings(newSettings);
  window.location.reload();
}

export function handleSwitchRegionClick(
  e: MouseEvent,
  getActiveRegion: () => "EN" | "JP",
  onSwitch: (region: "EN" | "JP") => void
): void {
  const btn         = e.currentTarget as HTMLElement;
  const rect        = btn.getBoundingClientRect();
  const activeRegion = getActiveRegion();
  showContextMenu(rect.left, rect.bottom + 4, [
    {
      label: activeRegion === "EN" ? "✓ View EN" : "View EN",
      action: () => onSwitch("EN"),
    },
    {
      label: activeRegion === "JP" ? "✓ View JP" : "View JP",
      action: () => onSwitch("JP"),
    },
  ]);
}
