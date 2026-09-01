/**
 * Coverage banner and legend, including the mandatory disclaimer that point
 * size is not actual object size.
 */

const SWATCHES = [
  { cls: "#67e8f9", label: "Position OK (API-derived SGP4)" },
  { cls: "#fbbf24", label: "Stale elements (data age over threshold)" },
  { cls: "#f87171", label: "Unavailable / quarantined (no position)" },
];

export function renderCoverage(coverage, dataStatus) {
  const node = document.getElementById("coverage");
  if (!coverage) {
    node.innerHTML = `<span>catalog status unknown</span>`;
    return;
  }
  const tone =
    dataStatus === "OK" ? "ok" : dataStatus === "STALE" ? "stale" : "error";
  const flag =
    coverage.global_density === "INSUFFICIENT_DATA"
      ? `<span class="coverage__flag" title="${escapeHtml(coverage.global_density_reason)}">Global view: INSUFFICIENT_DATA</span>`
      : "";
  const unavailable = coverage.unavailable_entries
    ? ` · <span class="coverage__unavailable" title="${escapeHtml(
        unavailableTooltip(coverage)
      )}"><b>${coverage.unavailable_entries}</b> unavailable</span>`
    : "";
  node.innerHTML = `
    <span class="dot dot--${tone}"></span>
    <span><b>${coverage.positioned_markers}</b> positioned markers · <b>${coverage.catalog_entries}</b> catalog entries · <b>${coverage.objects_total}</b> objects in DB</span>
    ${unavailable}
    ${flag}
  `;
  node.title = coverage.global_density_reason || "";
}

function unavailableTooltip(coverage) {
  const reasons = Object.entries(coverage.unavailable_by_status ?? {})
    .map(([status, count]) => `${count}× ${status}`)
    .join(", ");
  return `Catalog entries without a rendered marker (no geodetic fix): ${reasons || "none"}.`;
}

export function renderLegend() {
  const node = document.getElementById("legend");
  node.innerHTML = `
    ${SWATCHES.map(
      (swatch) => `
      <div class="legend__row">
        <span class="legend__swatch" style="color:${swatch.cls}; background:${swatch.cls}"></span>
        <span>${swatch.label}</span>
      </div>`
    ).join("")}
    <div class="legend__disclaimer">Marker size is a rendering aid — it does not represent actual object size. Positions and orbit lines come only from the Aetherus API.</div>
  `;
}

export function renderLod(lod, distance) {
  const node = document.getElementById("lod-indicator");
  const label = { global: "LOD · GLOBAL", mid: "LOD · REGION", focus: "LOD · FOCUS" }[lod] ?? lod;
  node.textContent = `${label} · ${Number(distance).toFixed(2)} R⊕`;
  node.dataset.lod = lod;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}
