import { addSwipeToDismiss } from "./swipe-dismiss.ts";

let _el:  HTMLDivElement   | null = null;
let _img: HTMLImageElement | null = null;

function _ensureEl(): HTMLDivElement {
  if (_el) return _el;

  _el = document.createElement("div");
  _el.className = "lightbox";
  _el.addEventListener("click", (e) => {
    if (e.target === _el) hideLightbox();
  });

  _img = document.createElement("img");
  _img.className = "lightbox-img";
  _el.appendChild(_img);
  document.body.appendChild(_el);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hideLightbox();
  });

  addSwipeToDismiss(_el, _el, hideLightbox);
  return _el;
}

export function showLightbox(src: string, alt: string): void {
  const el = _ensureEl();
  _img!.src = src;
  _img!.alt = alt;
  requestAnimationFrame(() => { el.classList.add("is-open"); });
}

export function hideLightbox(): void {
  _el?.classList.remove("is-open");
}

export function isLightboxOpen(): boolean {
  return _el?.classList.contains("is-open") ?? false;
}
