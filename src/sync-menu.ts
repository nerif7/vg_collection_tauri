import { loadSession, signInWithGoogle, signOut } from "./auth.ts";
import { runSync, setAuthInProgress, setJustLoggedIn, clearSyncMeta } from "./sync.ts";
import { showToast } from "./toast.ts";
import { trapFocus } from "./focus-trap.ts";

export function updateSyncTimestamp(): void {
  const btn = document.getElementById("syncBtn") as HTMLButtonElement | null;
  if (btn) btn.title = `${btn.title.split(" — ")[0]} — synced just now`;
}

export function flashSyncResult(icon: "✓" | "⚠"): void {
  const btn = document.getElementById("syncBtn") as HTMLButtonElement | null;
  if (!btn) return;
  const prev = btn.innerHTML;
  btn.innerHTML = icon;
  setTimeout(() => {
    btn.innerHTML = prev;
    void refreshSyncBtnState();
  }, 2000);
}

export function initSyncButton(): void {
  const placeholder = document.getElementById("syncBtnPlaceholder");
  const btn = document.getElementById("syncBtn") as HTMLButtonElement;
  // Reveal sync button — signals app is ready to user
  placeholder?.remove();
  btn.hidden = false;
  btn.addEventListener("click", () => void openSyncMenu(btn));
  void refreshSyncBtnState();
}

async function refreshSyncBtnState(): Promise<void> {
  const btn = document.getElementById("syncBtn") as HTMLButtonElement;
  const session = await loadSession();
  if (session) {
    const shortName = session.email.split("@")[0];
    btn.innerHTML = `☁ <span class="sync-btn-label">${shortName}</span>`;
    btn.title = session.email;
    btn.classList.add("sync-btn--signed-in");
  } else {
    btn.innerHTML = "☁";
    btn.title = "Sync / Sign in";
    btn.classList.remove("sync-btn--signed-in");
  }
}

// ── Sync menu (dropdown-style dialog) ────────────────────────────────────────

async function openSyncMenu(anchor: HTMLButtonElement): Promise<void> {
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

  const rect = anchor.getBoundingClientRect();
  const menuWidth = 240;
  const rightSpace = window.innerWidth - rect.right;
  const left = rightSpace < menuWidth
    ? Math.max(8, rect.right - menuWidth)
    : undefined;
  const right = left === undefined ? window.innerWidth - rect.right : undefined;
  menu.style.cssText = [
    "position:fixed",
    `top:${rect.bottom + 6}px`,
    left !== undefined ? `left:${left}px` : `right:${right}px`,
    "z-index:901",
    `width:${menuWidth}px`,
  ].join(";");

  if (!session) {
    _appendMenuItem(menu, "☁  Sign in with Google", "btn-primary", async () => {
      backdrop.remove();
      try {
        setAuthInProgress(true);
        showToast("Opening Google sign in…");
        const session = await signInWithGoogle();
        setJustLoggedIn(); // trigger first-login dialog on next sync
        await refreshSyncBtnState();
        showToast(`Signed in as ${session.email}`, "success");
        // Beri UI waktu render sebelum mulai sync (cegah white/black flash)
        setTimeout(async () => {
          try {
            const syncBtn = document.getElementById("syncBtn") as HTMLButtonElement | null;
            if (syncBtn) { syncBtn.textContent = "↻"; syncBtn.disabled = true; }
            const { handleSyncOutcome } = await import("./main.ts");
            handleSyncOutcome(await runSync());
          } finally {
            await refreshSyncBtnState();
            const syncBtn = document.getElementById("syncBtn") as HTMLButtonElement | null;
            if (syncBtn) syncBtn.disabled = false;
          }
        }, 800);
      } catch (err) {
        showToast(`Sign in failed: ${err instanceof Error ? err.message : String(err)}`, "error");
      } finally {
        setAuthInProgress(false);
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
      await clearSyncMeta(); // reset baseline so next sign-in shows data-choice dialog
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
