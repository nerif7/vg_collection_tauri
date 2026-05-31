import { loadSession, signInWithGoogle, signOut } from "./auth.ts";
import { runSync } from "./sync.ts";
import { showToast } from "./toast.ts";
import { trapFocus } from "./focus-trap.ts";

export function initSyncButton(): void {
  const btn = document.getElementById("syncBtn") as HTMLButtonElement;
  btn.addEventListener("click", () => void openSyncMenu(btn));
  void refreshSyncBtnState();
}

export async function refreshSyncBtnState(): Promise<void> {
  const btn = document.getElementById("syncBtn") as HTMLButtonElement;
  const session = await loadSession();
  if (session) {
    btn.title = `Synced — ${session.email}`;
    btn.classList.add("sync-btn--signed-in");
  } else {
    btn.title = "Sync / Sign in";
    btn.classList.remove("sync-btn--signed-in");
  }
}

// ── Sync menu (dropdown-style dialog) ────────────────────────────────────────

async function openSyncMenu(anchor: HTMLButtonElement): Promise<void> {
  // Tutup menu yang sudah ada jika ada
  document.getElementById("sync-menu-backdrop")?.remove();

  const session = await loadSession();

  const backdrop = document.createElement("div");
  backdrop.id = "sync-menu-backdrop";
  backdrop.style.cssText = "position:fixed;inset:0;z-index:900";
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) backdrop.remove();
  });

  const menu = document.createElement("div");
  menu.className = "sync-menu";
  menu.setAttribute("role", "dialog");
  menu.setAttribute("aria-modal", "true");
  menu.setAttribute("aria-label", "Sync menu");

  // Posisi di bawah tombol sync
  const rect = anchor.getBoundingClientRect();
  menu.style.cssText = `position:fixed;top:${rect.bottom + 6}px;right:${window.innerWidth - rect.right}px;z-index:901`;

  if (!session) {
    _appendMenuItem(menu, "☁  Sign in with Google", "btn-primary", async () => {
      backdrop.remove();
      try {
        showToast("Opening Google sign in…");
        await signInWithGoogle();
        await refreshSyncBtnState();
        showToast("Signed in — syncing…");
        const { handleSyncOutcome } = await import("./main.ts");
        handleSyncOutcome(await runSync());
      } catch (err) {
        showToast(`Sign in failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      }
    });
  } else {
    const emailEl = document.createElement("div");
    emailEl.className = "sync-menu-email";
    emailEl.textContent = session.email;
    menu.appendChild(emailEl);

    _appendMenuItem(menu, "↻  Sync now", "btn-secondary", async () => {
      backdrop.remove();
      showToast("Syncing…");
      const { handleSyncOutcome } = await import("./main.ts");
      handleSyncOutcome(await runSync());
    });

    _appendMenuItem(menu, "Sign out", "btn-neutral sync-menu-signout", async () => {
      backdrop.remove();
      await signOut();
      await refreshSyncBtnState();
      showToast("Signed out");
    });
  }

  backdrop.appendChild(menu);
  document.body.appendChild(backdrop);
  trapFocus(menu);

  document.addEventListener("keydown", function onKey(e: KeyboardEvent) {
    if (e.key === "Escape") {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
    }
  });
}

function _appendMenuItem(
  parent: HTMLElement,
  label: string,
  cls: string,
  onClick: () => void
): void {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `sync-menu-item ${cls}`;
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  parent.appendChild(btn);
}
