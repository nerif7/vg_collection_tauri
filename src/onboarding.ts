import type { Settings } from "./types.ts";
import { trapFocus } from "./focus-trap.ts";

export function showOnboarding(
  current?: Settings["region_preference"],
): Promise<Settings["region_preference"]> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay is-open";

    const box = document.createElement("div");
    box.className = "confirm-dialog import-dialog";
    box.setAttribute("role",            "dialog");
    box.setAttribute("aria-modal",      "true");
    box.setAttribute("aria-labelledby", "onb-title");

    const title = document.createElement("div");
    title.id        = "onb-title";
    title.className = "import-dialog-title";
    title.textContent = current ? "Change Region" : "Welcome — Choose Region";
    box.appendChild(title);

    const desc = document.createElement("p");
    desc.className   = "import-dialog-found";
    desc.textContent = "Select which card database to use:";
    box.appendChild(desc);

    const modes = document.createElement("div");
    modes.className = "import-dialog-modes";
    modes.setAttribute("role",       "group");
    modes.setAttribute("aria-label", "Region preference");

    const makeOpt = (strong: string, span: string) => {
      const el = document.createElement("div");
      el.className = "import-mode-option";
      el.setAttribute("role",         "button");
      el.setAttribute("tabindex",     "0");
      el.setAttribute("aria-pressed", "false");
      el.innerHTML = `<strong>${strong}</strong><span>${span}</span>`;
      return el;
    };

    const enOpt   = makeOpt("English (EN)", "Official English card database.");
    const jpOpt   = makeOpt("Japanese (JP)", "Official Japanese card database.");
    const bothOpt = makeOpt("Both EN + JP",  "Load both databases. Switch region at any time in the Overview tab.");

    modes.append(enOpt, jpOpt, bothOpt);
    box.appendChild(modes);

    const btnRow = document.createElement("div");
    btnRow.className = "confirm-actions";
    const confirmBtn = document.createElement("button");
    confirmBtn.type      = "button";
    confirmBtn.className = "btn-secondary";
    confirmBtn.textContent = "Confirm";
    confirmBtn.disabled  = true;
    btnRow.appendChild(confirmBtn);
    box.appendChild(btnRow);

    overlay.appendChild(box);
    document.body.appendChild(overlay);

    let chosen: Settings["region_preference"] | null = null;
    let releaseTrap = () => {};

    const select = (val: Settings["region_preference"]) => {
      chosen = val;
      for (const [opt, v] of [[enOpt, "EN"], [jpOpt, "JP"], [bothOpt, "BOTH"]] as const) {
        opt.classList.toggle("import-mode-option--selected", v === val);
        opt.setAttribute("aria-pressed", String(v === val));
      }
      confirmBtn.disabled = false;
    };

    const activate = (el: HTMLElement, val: Settings["region_preference"]) => {
      el.addEventListener("click", () => select(val));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); select(val); }
      });
    };
    activate(enOpt,   "EN");
    activate(jpOpt,   "JP");
    activate(bothOpt, "BOTH");

    confirmBtn.addEventListener("click", () => {
      if (!chosen) return;
      overlay.remove();
      releaseTrap();
      resolve(chosen);
    });

    requestAnimationFrame(() => {
      releaseTrap = trapFocus(box);
      if (current) select(current);
    });
  });
}
