import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "./types.ts";
import { getUserdataDir } from "./cache.ts";

export async function loadSettings(): Promise<Settings | null> {
  try {
    const dir  = await getUserdataDir();
    const text = await invoke<string | null>("read_text_file", { path: `${dir}/settings.json` });
    if (!text) return null;
    const p = JSON.parse(text) as Partial<Settings>;
    return {
      region_preference:  p.region_preference  ?? "EN",
      last_active_region: p.last_active_region ?? "EN",
      migration_version:  p.migration_version  ?? 1,
    };
  } catch {
    return null;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  const dir = await getUserdataDir();
  await invoke<void>("write_text_file", {
    path:    `${dir}/settings.json`,
    content: JSON.stringify(settings, null, 2),
  });
}
