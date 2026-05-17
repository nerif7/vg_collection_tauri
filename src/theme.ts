export function initThemeToggle(): void {
  const btn = document.getElementById("themeToggleBtn") as HTMLButtonElement | null;
  if (!btn) return;

  const saved = localStorage.getItem("theme") as "dark" | "light" | null;
  if (saved) document.documentElement.setAttribute("data-theme", saved);

  const update = () => {
    const isDark =
      document.documentElement.getAttribute("data-theme") === "dark" ||
      (!document.documentElement.hasAttribute("data-theme") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches);
    btn.textContent = isDark ? "☀︎" : "☾";
    btn.title = isDark ? "Switch to light mode" : "Switch to dark mode";
  };
  update();

  btn.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const isDark =
      current === "dark" ||
      (!current && window.matchMedia("(prefers-color-scheme: dark)").matches);
    const next = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem("theme", next);
    update();
  });
}
