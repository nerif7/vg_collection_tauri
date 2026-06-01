import type { Card, Settings } from "./types.ts";
import type { CacheMeta } from "./cache.ts";
import { loadFromCache, loadFromCacheJp } from "./cache.ts";
import {
  setStartupProgress, setStatus, clearStats,
  renderStats, renderCacheInfo,
} from "./browse-stats.ts";
import { showToast } from "./toast.ts";
import { initCollectionTab, loadCollectionTab } from "./collection-tab.ts";
import { initWishlistTab, loadWishlistTab } from "./wishlist-tab.ts";
import { loadBrowseTab, updateBrowseAvailability } from "./browse-tab.ts";
import { deduplicateCollection } from "./collection-db.ts";
import { loadSettings, saveSettings } from "./settings.ts";
import { showOnboarding } from "./onboarding.ts";
import { setOnboardingMode } from "./back-button.ts";
import { runSync, scheduleDebounce } from "./sync.ts";
import { initSyncButton } from "./sync-menu.ts";
import { updateRegionButton } from "./region.ts";
import { doFetchAndCacheEn, doFetchAndCacheJp, checkForUpdatesEn, checkForUpdatesJp } from "./card-loader.ts";

// Yield to browser paint loop between heavy operations — critical on Android
const yieldToUI = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

export interface AppState {
  allEnCards:       Card[];
  allJpCards:       Card[];
  allCards:         Card[];
  activeRegion:     "EN" | "JP";
  regionPreference: "EN" | "JP" | "BOTH";
  enMeta:           CacheMeta | null;
  jpMeta:           CacheMeta | null;
  collectionQtyMap: Map<string, number>;
}

export interface StartupCallbacks {
  setControlsDisabled:    (d: boolean) => void;
  refreshCollectionOverlay: () => Promise<void>;
  onSyncResult:           (result: Awaited<ReturnType<typeof runSync>>) => Promise<void>;
  onForceRefresh:         () => void;
}

export async function runStartup(state: AppState, cb: StartupCallbacks): Promise<void> {
  const settings = await loadSettings();

  if (!settings) {
    setOnboardingMode(true);
    document.getElementById("fouc-guard")?.remove();
    const chosen = await showOnboarding();
    setOnboardingMode(false);

    const newSettings: Settings = {
      region_preference:  chosen,
      last_active_region: chosen === "BOTH" ? "EN" : (chosen as "EN" | "JP"),
      migration_version:  1,
    };
    await saveSettings(newSettings);
    state.regionPreference = chosen;
    state.activeRegion     = newSettings.last_active_region;
  } else {
    state.regionPreference = settings.region_preference;
    state.activeRegion     = settings.last_active_region;
  }

  updateRegionButton(state.regionPreference, state.activeRegion);

  setStartupProgress(5);
  cb.setControlsDisabled(true);
  setStatus("Loading…", "loading");
  clearStats();

  try {
    setStartupProgress(15);

    const pendingUpdateTasks: (() => Promise<void>)[] = [];

    // ── Load EN ───────────────────────────────────────────────────────────
    if (state.regionPreference === "EN" || state.regionPreference === "BOTH") {
      const t0     = performance.now();
      const cached = await loadFromCache();
      const loadMs = performance.now() - t0;

      if (cached) {
        state.allEnCards = cached.cards;
        state.enMeta     = cached.meta;
        if (state.activeRegion === "EN") {
          state.allCards = state.allEnCards;
          setStartupProgress(50);
          loadBrowseTab(state.allEnCards, state.collectionQtyMap);
          setStartupProgress(70);
          setStatus(`⚡ Loaded ${state.allEnCards.length.toLocaleString("id-ID")} EN cards from cache in ${loadMs.toFixed(0)} ms`, "success");
          renderStats({ count: state.allEnCards.length, sizeBytes: state.enMeta.sizeBytes, loadFromCacheMs: loadMs });
          renderCacheInfo(state.enMeta);
        }
        if (state.enMeta) pendingUpdateTasks.push(() => checkForUpdatesEn(state.enMeta!, state).catch(() => {}));
      } else {
        await doFetchAndCacheEn(state);
        setStartupProgress(70);
      }
      await yieldToUI();
    }

    // ── Load JP ───────────────────────────────────────────────────────────
    if (state.regionPreference === "JP" || state.regionPreference === "BOTH") {
      const t0     = performance.now();
      const cached = await loadFromCacheJp();
      const loadMs = performance.now() - t0;

      if (cached) {
        state.allJpCards = cached.cards;
        state.jpMeta     = cached.meta;
        if (state.activeRegion === "JP") {
          state.allCards = state.allJpCards;
          setStartupProgress(50);
          loadBrowseTab(state.allJpCards, state.collectionQtyMap);
          setStartupProgress(70);
          setStatus(`⚡ Loaded ${state.allJpCards.length.toLocaleString("id-ID")} JP cards from cache in ${loadMs.toFixed(0)} ms`, "success");
          renderStats({ count: state.allJpCards.length, sizeBytes: state.jpMeta.sizeBytes, loadFromCacheMs: loadMs });
          renderCacheInfo(state.jpMeta);
        }
        if (state.jpMeta) pendingUpdateTasks.push(() => checkForUpdatesJp(state.jpMeta!, state).catch(() => {}));
      } else {
        await doFetchAndCacheJp(state);
        setStartupProgress(70);
      }
      await yieldToUI();
    }

    // Safety: ensure allCards pointer is set (BOTH mode edge cases)
    if (state.allCards.length === 0) {
      state.allCards = state.activeRegion === "JP" ? state.allJpCards : state.allEnCards;
      if (state.allCards.length > 0) loadBrowseTab(state.allCards, state.collectionQtyMap);
    }

    initCollectionTab(state.allCards, state.regionPreference, () => {
      cb.refreshCollectionOverlay().catch(() => {});
      scheduleDebounce();
    });
    initWishlistTab(state.allCards, () => { scheduleDebounce(); });
    setStartupProgress(85);
    await yieldToUI();

    const mergedGroups = await deduplicateCollection();
    if (mergedGroups > 0) showToast(`Cleaned up ${mergedGroups} duplicate collection ${mergedGroups === 1 ? "entry" : "entries"}.`);

    // Sequential load — less peak load than Promise.all, better on Android
    await loadCollectionTab(state.activeRegion, undefined, state.regionPreference);
    await yieldToUI();
    await loadWishlistTab(state.activeRegion);
    await yieldToUI();
    await cb.refreshCollectionOverlay();
    setStartupProgress(100);
    await yieldToUI();

    // On Android: run update checks first so login doesn't race with 10MB card download.
    // On desktop: login available immediately, update runs in background.
    const isAndroid = /Android/.test(navigator.userAgent);
    if (isAndroid && pendingUpdateTasks.length > 0) {
      const timeout = new Promise<void>((r) => setTimeout(r, 30_000));
      await Promise.race([Promise.all(pendingUpdateTasks.map((t) => t())), timeout]);
    } else {
      void Promise.all(pendingUpdateTasks.map((t) => t()));
    }

    initSyncButton();
    setTimeout(() => void runSync().then(cb.onSyncResult), 500);

  } catch (err) {
    setStartupProgress(100);
    setStatus(`❌ Failed: ${err instanceof Error ? err.message : String(err)}`, "error", cb.onForceRefresh);
    console.error(err);
  } finally {
    cb.setControlsDisabled(false);
    updateBrowseAvailability();
    document.getElementById("fouc-guard")?.remove();
  }
}
