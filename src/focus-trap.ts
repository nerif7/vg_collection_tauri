const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * Trap keyboard focus inside `container`.
 * Tab wraps to first element, Shift+Tab wraps to last.
 * Auto-focuses the first focusable element.
 * Returns a cleanup function to remove the trap.
 */
export function trapFocus(container: HTMLElement): () => void {
  const handler = (e: KeyboardEvent) => {
    if (e.key !== "Tab") return;
    const els = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (els.length === 0) return;
    const first = els[0];
    const last  = els[els.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
    }
  };

  document.addEventListener("keydown", handler);
  const els = [...container.querySelectorAll<HTMLElement>(FOCUSABLE)];
  if (els.length > 0) els[0].focus();

  return () => document.removeEventListener("keydown", handler);
}
