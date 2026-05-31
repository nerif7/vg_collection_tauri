import { showToast } from "./toast.ts";

export interface BackPane {
  isOpen(): boolean;
  close(): void;
}

let _onboardingMode = false;

export function setOnboardingMode(active: boolean): void {
  _onboardingMode = active;
}

export function initBackButton(panes: BackPane[]): void {
  window.history.pushState({ tag: "app" }, "");

  let exitPending = false;
  let exitTimer: ReturnType<typeof setTimeout> | null = null;

  window.addEventListener("popstate", () => {
    if (_onboardingMode) {
      showToast("Please select a region to continue.");
      window.history.pushState({ tag: "app" }, "");
      return;
    }

    for (const pane of panes) {
      if (pane.isOpen()) {
        pane.close();
        window.history.pushState({ tag: "app" }, "");
        return;
      }
    }

    if (exitPending) {
      if (exitTimer) clearTimeout(exitTimer);
      exitPending = false;
      return; // don't re-push → next back press exits the app naturally
    }

    exitPending = true;
    showToast("Tap sekali lagi untuk keluar");
    window.history.pushState({ tag: "app" }, "");
    exitTimer = setTimeout(() => {
      exitPending = false;
      window.history.pushState({ tag: "app" }, "");
    }, 2000);
  });
}
