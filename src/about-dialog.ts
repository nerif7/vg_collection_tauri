import { openUrl } from "@tauri-apps/plugin-opener";

const REPO_URL = "https://github.com/nerif7/vg_collection_tauri";
const DB_URL   = "https://github.com/nerif7/vanguard-library-db";

function openLink(url: string): void {
  if ("__TAURI_INTERNALS__" in window) {
    openUrl(url).catch(() => {});
  } else {
    window.open(url, "_blank", "noopener");
  }
}

export function showAboutDialog(): void {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";

  const box = document.createElement("div");
  box.className = "confirm-dialog about-dialog";

  const title = document.createElement("div");
  title.className = "about-title";
  title.textContent = "Cardfight!! Vanguard Collection Manager";

  const version = document.createElement("div");
  version.className = "about-version";
  version.textContent = "v0.4.0";

  const author = document.createElement("div");
  author.className = "about-author";
  author.textContent = "By Nerif";

  const links = document.createElement("div");
  links.className = "about-links";

  const makeLink = (label: string, url: string) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "about-link";
    btn.textContent = label;
    btn.addEventListener("click", () => openLink(url));
    return btn;
  };

  links.append(
    makeLink("GitHub Repository", REPO_URL),
    makeLink("Card Database (vanguard-library-db)", DB_URL),
  );

  const actions = document.createElement("div");
  actions.className = "confirm-actions";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "btn-neutral";
  closeBtn.textContent = "Close";
  closeBtn.addEventListener("click", () => overlay.remove());
  actions.appendChild(closeBtn);

  box.append(title, version, author, links, actions);
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("is-open"));
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); }, { once: true });
}
