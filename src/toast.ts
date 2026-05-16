export function showToast(msg: string, kind?: "error"): void {
  const toast = document.createElement("div");
  toast.className = kind === "error" ? "toast toast--error" : "toast";
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast--visible"));
  const duration = kind === "error" ? 6000 : 3500;
  setTimeout(() => {
    toast.classList.remove("toast--visible");
    setTimeout(() => toast.remove(), 250);
  }, duration);
}
