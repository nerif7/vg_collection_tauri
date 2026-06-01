import type { Card } from "./types.ts";
import type { CacheMeta } from "./cache.ts";
import {
  fetchFromGitHub, fetchFromGitHubJp,
  fetchLatestCommitSha, fetchLatestCommitShaJp,
  fetchVersionInfo,
  saveCards, saveMeta, saveCardsJp, saveMetaJp,
} from "./cache.ts";
import { setStatus, renderStats, renderCacheInfo, showUpdateSpinner } from "./browse-stats.ts";
import { showToast } from "./toast.ts";
import { loadBrowseTab } from "./browse-tab.ts";

interface CardLoaderState {
  allEnCards:       Card[];
  allJpCards:       Card[];
  allCards:         Card[];
  activeRegion:     "EN" | "JP";
  enMeta:           CacheMeta | null;
  jpMeta:           CacheMeta | null;
  collectionQtyMap: Map<string, number>;
}

export async function doFetchAndCacheEn(state: CardLoaderState): Promise<void> {
  if (state.activeRegion === "EN") setStatus("Fetching EN cards from GitHub…", "loading");
  const result = await fetchFromGitHub();
  state.allEnCards = result.cards;
  if (state.activeRegion === "EN") state.allCards = state.allEnCards;
  const sha = await fetchLatestCommitSha();

  if (state.activeRegion === "EN") setStatus("Saving EN cards to cache…", "loading");
  await saveCards(result.cards);
  state.enMeta = {
    lastFetchAt: Date.now(), lastCommitSha: sha,
    cardCount: result.cards.length, sizeBytes: result.totalBytes,
  };
  await saveMeta(state.enMeta);

  if (state.activeRegion === "EN") {
    loadBrowseTab(state.allEnCards, state.collectionQtyMap);
    setStatus(`✅ Fetched ${result.cards.length.toLocaleString("id-ID")} EN cards (${(result.fetchTimeMs + result.parseTimeMs).toFixed(0)} ms) + cached`, "success");
    renderStats({ count: result.cards.length, sizeBytes: result.totalBytes, fetchTimeMs: result.fetchTimeMs, parseTimeMs: result.parseTimeMs });
    renderCacheInfo(state.enMeta);
  }
}

export async function doFetchAndCacheJp(state: CardLoaderState): Promise<void> {
  if (state.activeRegion === "JP") setStatus("Fetching JP cards from GitHub…", "loading");
  const result = await fetchFromGitHubJp();
  state.allJpCards = result.cards;
  if (state.activeRegion === "JP") state.allCards = state.allJpCards;
  const sha = await fetchLatestCommitShaJp();

  if (state.activeRegion === "JP") setStatus("Saving JP cards to cache…", "loading");
  await saveCardsJp(result.cards);
  state.jpMeta = {
    lastFetchAt: Date.now(), lastCommitSha: sha,
    cardCount: result.cards.length, sizeBytes: result.totalBytes,
  };
  await saveMetaJp(state.jpMeta);

  if (state.activeRegion === "JP") {
    loadBrowseTab(state.allJpCards, state.collectionQtyMap);
    setStatus(`✅ Fetched ${result.cards.length.toLocaleString("id-ID")} JP cards (${(result.fetchTimeMs + result.parseTimeMs).toFixed(0)} ms) + cached`, "success");
    renderStats({ count: result.cards.length, sizeBytes: result.totalBytes, fetchTimeMs: result.fetchTimeMs, parseTimeMs: result.parseTimeMs });
    renderCacheInfo(state.jpMeta);
  }
}

export async function checkForUpdatesEn(meta: CacheMeta, state: CardLoaderState): Promise<void> {
  showUpdateSpinner(true);
  try {
    const version = await fetchVersionInfo();
    let needsUpdate: boolean;
    if (version) {
      needsUpdate = version.cardCount !== meta.cardCount;
    } else {
      const sha = await fetchLatestCommitSha();
      needsUpdate = !!sha && sha !== meta.lastCommitSha;
    }
    if (!needsUpdate) return;
    await doFetchAndCacheEn(state);
    const setsMsg = version?.newSets.length ? ` — set baru: ${version.newSets.join(", ")}` : "";
    showToast(`EN cards diperbarui${setsMsg} (${state.allEnCards.length.toLocaleString("id-ID")} kartu).`);
  } finally {
    showUpdateSpinner(false);
  }
}

export async function checkForUpdatesJp(meta: CacheMeta, state: CardLoaderState): Promise<void> {
  showUpdateSpinner(true);
  try {
    const version = await fetchVersionInfo();
    let needsUpdate: boolean;
    if (version?.cardCountJp !== undefined) {
      needsUpdate = version.cardCountJp !== meta.cardCount;
    } else {
      const sha = await fetchLatestCommitShaJp();
      needsUpdate = !!sha && sha !== meta.lastCommitSha;
    }
    if (!needsUpdate) return;
    await doFetchAndCacheJp(state);
    const setsMsg = version?.newSetsJp?.length ? ` — set baru: ${version.newSetsJp.join(", ")}` : "";
    showToast(`JP cards diperbarui${setsMsg} (${state.allJpCards.length.toLocaleString("id-ID")} kartu).`);
  } finally {
    showUpdateSpinner(false);
  }
}
