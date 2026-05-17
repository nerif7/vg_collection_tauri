export function addSwipeToDismiss(
  pane: HTMLElement,
  _handle: HTMLElement,
  onDismiss: () => void,
): void {
  let startY = 0;
  let mode: "none" | "dismiss" | "scroll" = "none";

  pane.addEventListener("touchstart", (e) => {
    startY = e.touches[0].clientY;
    mode = "none";
    pane.style.transition = "none";
  }, { passive: true });

  pane.addEventListener("touchmove", (e) => {
    const delta = e.touches[0].clientY - startY;

    if (mode === "none") {
      if (Math.abs(delta) < 5) return;
      mode = delta > 0 && pane.scrollTop <= 0 ? "dismiss" : "scroll";
    }

    if (mode === "dismiss") {
      e.preventDefault();
      pane.style.transform = `translateY(${Math.max(0, delta)}px)`;
    }
  }, { passive: false });

  const finish = (endY: number) => {
    const wasDismiss = mode === "dismiss";
    pane.style.transition = "";
    pane.style.transform = "";
    mode = "none";
    if (wasDismiss && endY - startY > 80) onDismiss();
  };

  pane.addEventListener("touchend",    (e) => finish(e.changedTouches[0].clientY));
  pane.addEventListener("touchcancel", () => {
    pane.style.transition = "";
    pane.style.transform = "";
    mode = "none";
  });
}
