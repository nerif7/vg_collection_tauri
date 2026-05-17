export function createStatsCollapsible(statsEl: HTMLElement): HTMLElement {
  statsEl.className = "";

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "stats-collapsible-toggle is-open";
  toggle.innerHTML = `Stats <span class="arrow">›</span>`;

  const body = document.createElement("div");
  body.className = "stats-collapsible-body collection-stats";

  statsEl.appendChild(toggle);
  statsEl.appendChild(body);

  toggle.addEventListener("click", () => {
    const nowOpen = toggle.classList.toggle("is-open");
    body.classList.toggle("is-hidden", !nowOpen);
  });

  return body;
}
