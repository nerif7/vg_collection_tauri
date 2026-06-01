import type { ConflictEntry } from "./types.ts";
import { trapFocus } from "./focus-trap.ts";

export type FirstLoginChoice = "merge" | "use_cloud" | "export_first" | "keep_local" | "cancel";

export interface DiffEntry {
  cardCode:    string;
  displayName: string;
  localQty:    number;
  cloudQty:    number;
}

export interface DiffSummary {
  onlyLocal: DiffEntry[];
  onlyCloud: DiffEntry[];
  diffQty:   DiffEntry[];
}

const DETAIL_LIMIT = 5; // show card names if category has ≤ this many entries

function _renderDiffSection(diff: DiffSummary): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText = "margin:12px 0;padding:10px 12px;background:var(--surface-alt,var(--surface));border:1px solid var(--border);border-radius:8px;font-size:0.85em";

  const total = diff.onlyLocal.length + diff.onlyCloud.length + diff.diffQty.length;

  if (total === 0) {
    const eq = document.createElement("div");
    eq.style.cssText = "color:var(--text-muted);text-align:center;padding:4px 0";
    eq.textContent = "✓ Isi koleksi identik — hanya metadata yang mungkin berbeda";
    wrap.appendChild(eq);
    return wrap;
  }

  const addCategory = (
    label: string,
    entries: DiffEntry[],
    fmtRow: (e: DiffEntry) => string
  ) => {
    if (entries.length === 0) return;
    const row = document.createElement("div");
    row.style.cssText = "margin-bottom:6px";

    const hdr = document.createElement("div");
    hdr.style.cssText = "font-weight:600;margin-bottom:3px";
    hdr.textContent = `${label}: ${entries.length.toLocaleString("id-ID")} kartu`;
    row.appendChild(hdr);

    if (entries.length <= DETAIL_LIMIT) {
      for (const e of entries) {
        const item = document.createElement("div");
        item.style.cssText = "padding-left:12px;color:var(--text-muted)";
        item.textContent = `• ${fmtRow(e)}`;
        row.appendChild(item);
      }
    } else {
      const more = document.createElement("div");
      more.style.cssText = "padding-left:12px;color:var(--text-muted)";
      more.textContent = `(terlalu banyak untuk ditampilkan)`;
      row.appendChild(more);
    }

    wrap.appendChild(row);
  };

  addCategory("📱 Hanya di device ini",  diff.onlyLocal, (e) => `${e.displayName} ×${e.localQty}`);
  addCategory("☁ Hanya di cloud",        diff.onlyCloud, (e) => `${e.displayName} ×${e.cloudQty}`);
  addCategory("🔄 Qty berbeda",           diff.diffQty,   (e) => `${e.displayName}: device ×${e.localQty}, cloud ×${e.cloudQty}`);

  return wrap;
}

export function showFirstLoginSyncDialog(
  localCount:  number,
  remoteCount: number,
  diff:        DiffSummary,
  onChoice:    (choice: FirstLoginChoice) => void
): void {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-overlay is-open";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-labelledby", "first-login-title");
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) { backdrop.remove(); onChoice("cancel"); } });

  const box = document.createElement("div");
  box.className = "confirm-dialog";
  box.style.maxWidth = "460px";

  const title = document.createElement("h2");
  title.id = "first-login-title";
  title.className = "confirm-title";
  title.textContent = "Data ditemukan di dua tempat";
  box.appendChild(title);

  const desc = document.createElement("p");
  desc.className = "confirm-msg";
  desc.innerHTML = `Device ini punya <strong>${localCount}</strong> kartu lokal. Cloud punya <strong>${remoteCount}</strong> kartu.`;
  box.appendChild(desc);

  box.appendChild(_renderDiffSection(diff));

  const subDesc = document.createElement("p");
  subDesc.className = "confirm-msg";
  subDesc.style.cssText = "margin-top:10px";
  subDesc.textContent = "Pilih cara menggabungkannya:";
  box.appendChild(subDesc);

  const close = () => backdrop.remove();

  const makeOption = (label: string, sublabel: string, choice: FirstLoginChoice) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-neutral";
    btn.style.cssText = "width:100%;text-align:left;margin-bottom:8px;padding:10px 14px";
    btn.innerHTML = `<div style="font-weight:600">${label}</div><div style="font-size:0.82em;opacity:0.7;margin-top:2px">${sublabel}</div>`;
    btn.addEventListener("click", () => { close(); onChoice(choice); });
    return btn;
  };

  box.appendChild(makeOption(
    "Gabungkan",
    "Tambahkan kartu dari cloud yang belum ada di lokal. Data lokal tetap.",
    "merge"
  ));
  box.appendChild(makeOption(
    "Pakai data cloud",
    "Ambil semua data dari cloud ke device ini. Data lokal akan diganti.",
    "use_cloud"
  ));
  box.appendChild(makeOption(
    "Ekspor lokal dulu, lalu pakai cloud",
    "Backup data lokal ke file, kemudian ambil data cloud.",
    "export_first"
  ));
  box.appendChild(makeOption(
    "⚠ Timpa cloud dengan data lokal",
    "Kirim data device ini ke cloud. Data cloud (dari device lain) akan hilang.",
    "keep_local"
  ));

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn-neutral";
  cancelBtn.style.cssText = "width:100%;margin-top:8px;opacity:0.7";
  cancelBtn.textContent = "Tunda — putuskan nanti";
  cancelBtn.addEventListener("click", () => { close(); onChoice("cancel"); });
  box.appendChild(cancelBtn);

  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
  trapFocus(backdrop);

  document.addEventListener("keydown", function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); onChoice("cancel"); }
  });
}

// ── Conflict resolution dialog (Phase 10d) ────────────────────────────────────

export function showConflictDialog(
  conflicts:  ConflictEntry[],
  cardMap:    Map<string, { displayName: string }>,
  onResolve:  (resolved: Map<string, "local" | "remote">) => void,
  onCancel:   () => void
): void {
  const choices = new Map<string, "local" | "remote">(
    conflicts.map((c) => [`${c.cardCode}|${c.region}`, "local"])
  );

  const backdrop = document.createElement("div");
  backdrop.className = "modal-overlay is-open";
  backdrop.setAttribute("role", "dialog");
  backdrop.setAttribute("aria-modal", "true");
  backdrop.setAttribute("aria-labelledby", "conflict-title");
  backdrop.addEventListener("click", (e) => { if (e.target === backdrop) { backdrop.remove(); onCancel(); } });

  const box = document.createElement("div");
  box.className = "confirm-dialog";
  box.style.maxWidth = "520px";
  box.style.maxHeight = "80vh";
  box.style.overflowY = "auto";

  const title = document.createElement("h2");
  title.id = "conflict-title";
  title.className = "confirm-title";
  title.textContent = `${conflicts.length} kartu memiliki data berbeda`;
  box.appendChild(title);

  const desc = document.createElement("p");
  desc.className = "confirm-msg";
  desc.textContent = "Pilih versi mana yang ingin disimpan untuk setiap kartu:";
  box.appendChild(desc);

  const close = () => backdrop.remove();

  for (const conflict of conflicts) {
    const key  = `${conflict.cardCode}|${conflict.region}`;
    const name = cardMap.get(conflict.cardCode)?.displayName ?? conflict.cardCode;

    const card = document.createElement("div");
    card.style.cssText = "border:1px solid var(--border);border-radius:8px;padding:12px;margin:8px 0";

    const cardTitle = document.createElement("div");
    cardTitle.style.cssText = "font-weight:600;margin-bottom:8px";
    cardTitle.textContent = `${name} (${conflict.cardCode})`;
    card.appendChild(cardTitle);

    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:8px";

    const localBtn  = document.createElement("button");
    const remoteBtn = document.createElement("button");
    localBtn.type   = "button";
    remoteBtn.type  = "button";
    localBtn.style.flex  = "1";
    remoteBtn.style.flex = "1";
    localBtn.textContent  = `Device ini: ×${conflict.local?.quantity ?? 0}`;
    remoteBtn.textContent = `Cloud: ×${conflict.remote?.quantity ?? 0}`;

    const updateStyles = () => {
      const choice = choices.get(key);
      localBtn.className  = choice === "local"  ? "btn-primary" : "btn-neutral";
      remoteBtn.className = choice === "remote" ? "btn-primary" : "btn-neutral";
    };
    updateStyles();

    localBtn.addEventListener("click",  () => { choices.set(key, "local");  updateStyles(); });
    remoteBtn.addEventListener("click", () => { choices.set(key, "remote"); updateStyles(); });

    row.append(localBtn, remoteBtn);
    card.appendChild(row);
    box.appendChild(card);
  }

  const bulkRow = document.createElement("div");
  bulkRow.style.cssText = "display:flex;gap:8px;margin-top:12px";

  const allLocalBtn  = document.createElement("button");
  const allRemoteBtn = document.createElement("button");
  allLocalBtn.type   = "button";
  allRemoteBtn.type  = "button";
  allLocalBtn.className  = "btn-neutral";
  allRemoteBtn.className = "btn-neutral";
  allLocalBtn.textContent  = "Semua: Pakai Device";
  allRemoteBtn.textContent = "Semua: Pakai Cloud";
  allLocalBtn.style.flex  = "1";
  allRemoteBtn.style.flex = "1";

  allLocalBtn.addEventListener("click",  () => {
    for (const k of choices.keys()) choices.set(k, "local");
    close();
    showConflictDialog(conflicts, cardMap, onResolve, onCancel);
  });
  allRemoteBtn.addEventListener("click", () => {
    for (const k of choices.keys()) choices.set(k, "remote");
    close();
    showConflictDialog(conflicts, cardMap, onResolve, onCancel);
  });

  bulkRow.append(allLocalBtn, allRemoteBtn);
  box.appendChild(bulkRow);

  const btnRow = document.createElement("div");
  btnRow.className = "confirm-buttons";

  const cancelBtn = document.createElement("button");
  cancelBtn.textContent = "Batalkan";
  cancelBtn.className   = "btn-neutral";
  cancelBtn.type        = "button";
  cancelBtn.addEventListener("click", () => { close(); onCancel(); });

  const confirmBtn = document.createElement("button");
  confirmBtn.textContent = "Simpan Pilihan";
  confirmBtn.className   = "btn-primary";
  confirmBtn.type        = "button";
  confirmBtn.addEventListener("click", () => { close(); onResolve(choices); });

  btnRow.append(cancelBtn, confirmBtn);
  box.appendChild(btnRow);
  backdrop.appendChild(box);
  document.body.appendChild(backdrop);
  trapFocus(backdrop);

  document.addEventListener("keydown", function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") { close(); document.removeEventListener("keydown", onKey); onCancel(); }
  });
}
