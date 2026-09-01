/**
 * Aetherus explore bootstrap.
 *
 * Data flow is one-way: Aetherus API → state → scene. The browser never
 * propagates an orbit, never estimates a position, and never fills a missing
 * value. Explicit loading / error / stale / empty states replace any gap.
 */

import { api } from "./api.js";
import { geodeticToScene, formatUtc } from "./coords.js";
import { runRemoveSimulation } from "./benefit.js";
import { createGlobe } from "./globe.js";
import { renderCoverage, renderLegend, renderLod } from "./legend.js";
import { closePanel, openPanel, renderDetail } from "./panel.js";
import { store, select, set } from "./state.js";
import { hideOverlay, showError, showEmptyCatalog, showLoading, toast } from "./states.js";

const ORBIT_WINDOW_MINUTES = 45;
const ORBIT_STEP_SECONDS = 60;
const REFRESH_MS = 60000;

const listNode = document.getElementById("object-list");
const listCount = document.getElementById("list-count");
const searchInput = document.getElementById("search-input");
const timeControl = document.getElementById("time-control");
const timeSlider = document.getElementById("time-slider");
const timeReadout = document.getElementById("time-readout");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const globe = createGlobe(document.getElementById("scene"), {
  reducedMotion,
  onLodChange: (lod) => {
    renderLod(lod, globe.cameraDistance());
    const previous = store.lod;
    set({ lod });
    if ((lod === "mid" && previous !== "mid") || (lod === "global" && previous !== "global")) {
      loadSnapshot({ silent: true });
    }
  },
  onPick: (entry) => {
    if (entry) selectObject(entry);
  },
  onHover: (entry, event) => showTooltip(entry, event),
});

/* ---------------- tooltip ---------------- */

let tooltipNode = null;
function showTooltip(entry, event) {
  if (!tooltipNode) {
    tooltipNode = document.createElement("div");
    tooltipNode.className = "scene-tooltip";
    tooltipNode.style.cssText =
      "position:fixed;pointer-events:none;z-index:30;padding:8px 12px;border-radius:10px;" +
      "background:rgba(8,13,24,.94);border:1px solid rgba(148,180,220,.25);font-size:11.5px;" +
      "color:#e8eef7;max-width:240px;box-shadow:0 12px 32px rgba(0,0,0,.5);line-height:1.5";
    document.body.appendChild(tooltipNode);
  }
  if (!entry) {
    tooltipNode.style.display = "none";
    return;
  }
  tooltipNode.style.display = "block";
  tooltipNode.innerHTML =
    `<b>${escapeHtml(entry.canonical_name ?? entry.catalog_id)}</b><br>` +
    `<span style="color:#93a3b8">CATNR ${escapeHtml(entry.catalog_id)} · ${escapeHtml(entry.object_type ?? "type n/a")}</span><br>` +
    `<span style="color:#93a3b8">origin: ${escapeHtml(entry.origin_code ?? "unspecified")} · age ${formatAgeLabel(entry.provenance?.data_age_s)}</span>`;
  const x = Math.min(event.clientX + 14, window.innerWidth - 260);
  const y = Math.min(event.clientY + 14, window.innerHeight - 90);
  tooltipNode.style.left = `${x}px`;
  tooltipNode.style.top = `${y}px`;
}

function formatAgeLabel(seconds) {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  if (s < 90) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

function escapeHtml(value) {
  return String(value ?? "—").replace(/[&<>"']/g, (ch) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]
  ));
}

/* ---------------- catalog loading ---------------- */

function viewportBbox() {
  const lod = globe.lodForDistance(globe.cameraDistance());
  if (lod === "global") return null;
  return bboxFromCamera();
}

function bboxFromCamera() {
  const spread = Math.max(8, Math.min(80, (globe.cameraDistance() - 1.05) * 34));
  const dir = globe.cameraDirection();
  const lat = (Math.asin(Math.max(-1, Math.min(1, dir.y))) * 180) / Math.PI;
  const lon = (Math.atan2(dir.x, -dir.z) * 180) / Math.PI;
  const minLat = Math.max(-90, lat - spread);
  const maxLat = Math.min(90, lat + spread);
  const minLon = Math.max(-180, lon - spread);
  const maxLon = Math.min(180, lon + spread);
  return `${minLat.toFixed(2)},${minLon.toFixed(2)},${maxLat.toFixed(2)},${maxLon.toFixed(2)}`;
}

async function loadCatalogStatus() {
  try {
    const status = await api.catalogStatus();
    set({ coverage: status.data.coverage });
    renderCoverage(status.data.coverage, status.data_status);
    return status;
  } catch {
    return null;
  }
}

async function loadSnapshot({ silent = false } = {}) {
  if (!silent) showLoading("Preparing the orbital view", "Propagating stored orbit solutions on the Aetherus server…");
  try {
    const bbox = viewportBbox();
    const snapshot = await api.catalogSnapshot(bbox ? { bbox } : {});
    const catalog = snapshot.data.catalog;
    set({ catalog, lastSnapshotAt: snapshot.generated_at, overlay: { kind: "none" } });
    globe.updateObjects(catalog);
    renderCoverage(snapshot.data.coverage, snapshot.data_status);
    renderList();
    if (!silent || store.overlay.kind !== "none") hideOverlay();
    if (!catalog.length) {
      showEmptyCatalog(
        "No canonical objects with stored orbit solutions have been ingested yet. " +
          "Aetherus never renders a synthetic catalog.",
        "data_status=UNAVAILABLE · POST /api/v1/ingestions/celestrak/omm/{catalog_id} to ingest a real object"
      );
      set({ overlay: { kind: "empty" } });
    }
    if (snapshot.warnings?.length && snapshot.data_status !== "OK") {
      toast(snapshot.warnings[0]);
    }
    return snapshot;
  } catch (error) {
    set({ overlay: { kind: "error" } });
    showError({
      title: "Catalog unavailable",
      text: error.message || "The Aetherus API could not be reached.",
      code: `${error.apiStatus ?? "NETWORK_ERROR"} · ${error.httpStatus ?? 0} · request_id=${error.requestId ?? "n/a"}`,
      retry: () => loadSnapshot(),
    });
    return null;
  }
}

/* ---------------- object list ---------------- */

function matchesFilter(entry, query) {
  if (!query) return true;
  const q = query.trim().toLowerCase();
  return (
    entry.catalog_id.toLowerCase().includes(q) ||
    (entry.canonical_name ?? "").toLowerCase().includes(q) ||
    (entry.cospar_id ?? "").toLowerCase().includes(q)
  );
}

function renderList() {
  const query = searchInput.value;
  const filtered = store.catalog.filter((entry) => matchesFilter(entry, query));
  set({ filtered });
  listCount.textContent = `${filtered.length}/${store.catalog.length}`;
  listNode.innerHTML = "";
  if (!filtered.length) {
    const empty = document.createElement("li");
    empty.className = "list-panel__note";
    empty.style.borderTop = "none";
    empty.textContent = query
      ? "No ingested object matches this search."
      : "No objects with stored orbit solutions.";
    listNode.appendChild(empty);
    return;
  }
  for (const entry of filtered) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.className = "object-row";
    button.setAttribute("role", "option");
    button.dataset.objectId = entry.object_id;
    button.setAttribute("aria-selected", entry.object_id === store.selectedId ? "true" : "false");
    const stale = entry.position_status === "STALE";
    const color =
      entry.position_status === "STALE" ? "#fbbf24"
      : entry.position_status === "OK" ? "#67e8f9"
      : "#f87171";
    button.innerHTML = `
      <span class="object-row__swatch" style="color:${color};background:${color}"></span>
      <span class="object-row__name">${escapeHtml(entry.canonical_name ?? entry.catalog_id)}</span>
      <span class="object-row__age ${stale ? "object-row__age--stale" : ""}">${formatAgeLabel(entry.provenance?.data_age_s)}</span>
      <span class="object-row__meta">CATNR ${escapeHtml(entry.catalog_id)} · ${escapeHtml(entry.position_status)}</span>
    `;
    button.addEventListener("click", () => selectObject(entry));
    item.appendChild(button);
    listNode.appendChild(item);
  }
  if (store.selectedId) {
    const selected = listNode.querySelector(`[data-object-id="${store.selectedId}"]`);
    if (selected) selected.setAttribute("aria-selected", "true");
  }
}

searchInput.addEventListener("input", renderList);
searchInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    const first = listNode.querySelector(".object-row");
    if (first) first.focus();
  }
});

listNode.addEventListener("keydown", (event) => {
  const rows = [...listNode.querySelectorAll(".object-row")];
  const index = rows.indexOf(document.activeElement);
  if (event.key === "ArrowDown" && index >= 0 && index < rows.length - 1) {
    event.preventDefault();
    rows[index + 1].focus();
  } else if (event.key === "ArrowUp" && index > 0) {
    event.preventDefault();
    rows[index - 1].focus();
  } else if (event.key === "ArrowUp" && index === 0) {
    event.preventDefault();
    searchInput.focus();
  }
});

/* ---------------- selection & ephemeris ---------------- */

async function selectObject(entry) {
  select(entry);
  renderList();
  openPanel();
  renderDetail({ entry, ephemeris: null, timeIndex: 0, conjunctions: { __loading: true } });
  timeControl.hidden = true;
  globe.clearOrbitLine();
  globe.setSelection(entry);
  globe.focusCamera(entry);
  loadConjunctions(entry);
  try {
    const center = new Date();
    const start = new Date(center.getTime() - ORBIT_WINDOW_MINUTES * 60000);
    const stop = new Date(center.getTime() + ORBIT_WINDOW_MINUTES * 60000);
    const ephemeris = await api.objectEphemeris(entry.catalog_id, {
      start: start.toISOString(),
      stop: stop.toISOString(),
      stepS: ORBIT_STEP_SECONDS,
    });
    if (store.selectedId !== entry.object_id) return;
    set({ ephemeris, ephemerisObjectRef: entry.catalog_id, timeIndex: 0 });
    const points = globe.showOrbitLine(ephemeris.data.samples, { color: entry.position_status === "STALE" ? "#fbbf24" : "#67e8f9" });
    if (points) {
      timeControl.hidden = false;
      timeSlider.max = String(ephemeris.data.sample_count - 1);
      timeSlider.value = "0";
      updateTimeCursor(0);
    }
    renderDetail({ entry, ephemeris, timeIndex: 0, conjunctions: store.conjunctions });
  } catch (error) {
    toast(
      `Orbit line unavailable: ${error.apiStatus ?? "NETWORK_ERROR"} — the object marker still shows the catalog snapshot position.`,
      { tone: "error" }
    );
    renderDetail({ entry, ephemeris: null, timeIndex: 0, conjunctions: store.conjunctions });
  }
}

/* ---------------- P4 conjunction risk (API-derived only) ---------------- */

async function loadConjunctions(entry) {
  try {
    const payload = await api.conjunctions({ object: entry.catalog_id });
    if (store.selectedId !== entry.object_id) return;
    set({ conjunctions: payload });
    renderDetail({
      entry: store.selectedEntry,
      ephemeris: store.ephemeris,
      timeIndex: store.timeIndex ?? 0,
      conjunctions: payload,
    });
  } catch (error) {
    if (store.selectedId !== entry.object_id) return;
    set({ conjunctions: { __error: error.apiStatus ?? "NETWORK_ERROR" } });
    renderDetail({
      entry: store.selectedEntry,
      ephemeris: store.ephemeris,
      timeIndex: store.timeIndex ?? 0,
      conjunctions: { __error: error.apiStatus ?? "NETWORK_ERROR" },
    });
  }
}

/* ---------------- P5 REMOVE simulation (IDEALIZED_REMOVAL only) --------- */

function rerenderWithBenefit() {
  renderDetail({
    entry: store.selectedEntry,
    ephemeris: store.ephemeris,
    timeIndex: store.timeIndex ?? 0,
    conjunctions: store.conjunctions,
  });
}

function setBenefit(patch) {
  set({ benefit: { ...store.benefit, ...patch } });
  rerenderWithBenefit();
}

document.addEventListener("click", async (event) => {
  const action = event.target?.id;
  if (action === "simulate-removal-btn") {
    if (!store.selectedEntry) return;
    setBenefit({ __state: "confirm" });
    return;
  }
  if (action === "benefit-cancel" || action === "benefit-reset") {
    setBenefit({ __state: "idle", baseline: undefined, scenario: undefined, run: undefined, benefits: undefined, error: undefined });
    return;
  }
  if (action !== "benefit-confirm-run") return;
  const entry = store.selectedEntry;
  if (!entry) return;
  setBenefit({ __state: "running" });
  try {
    const result = await runRemoveSimulation(api, entry);
    if (store.selectedId !== entry.object_id) return;
    set({ benefit: result });
  } catch (error) {
    if (store.selectedId !== entry.object_id) return;
    set({
      benefit: {
        __state: "unavailable",
        error: {
          apiStatus: error.apiStatus ?? "NETWORK_ERROR",
          httpStatus: error.httpStatus ?? 0,
          message: error.message,
          details: error.details,
        },
      },
    });
  }
  rerenderWithBenefit();
});

function updateTimeCursor(index) {  const ephemeris = store.ephemeris;
  if (!ephemeris) return;
  const bounded = Math.max(0, Math.min(index, ephemeris.data.sample_count - 1));
  const sample = ephemeris.data.samples[bounded];
  if (!sample) return;
  set({ timeIndex: bounded });
  const scenePoint = geodeticToScene(sample.geodetic.lat_deg, sample.geodetic.lon_deg, sample.geodetic.alt_km);
  globe.setCursorMarker(scenePoint);
  timeReadout.textContent = formatUtc(sample.sample_time);
  if (store.selectedEntry) {
    renderDetail({
      entry: store.selectedEntry,
      ephemeris,
      timeIndex: bounded,
      conjunctions: store.conjunctions,
    });
  }
}

timeSlider.addEventListener("input", () => updateTimeCursor(Number(timeSlider.value)));

document.getElementById("detail-close").addEventListener("click", () => {
  closePanel();
  select(null);
  renderList();
  globe.clearOrbitLine();
  globe.setSelection(null);
  globe.setCursorMarker(null);
  timeControl.hidden = true;
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !panelHidden()) {
    document.getElementById("detail-close").click();
    document.getElementById("scene").focus();
  }
  if (event.key === "/" && document.activeElement !== searchInput) {
    event.preventDefault();
    searchInput.focus();
  }
});

function panelHidden() {
  return document.getElementById("detail-panel").hidden;
}

/* ---------------- debug / evidence hook ---------------- */

window.__AETHERUS_P3__ = {
  apiLog: () => api.apiLog(),
  rendered: () => Object.fromEntries(globe.getRenderedMap()),
  orbitLine: () => globe.getOrbitLinePoints ? globe.getOrbitLinePoints() : null,
  coords: { geodeticToScene },
  resetView: () => globe.resetView(),
  store,
  globeDebug: () => globe.debugInfo(),
  scene: () => globe.__scene,
  version: "P3",
};

/* ---------------- boot ---------------- */

renderLegend();
renderLod("global", globe.cameraDistance());
window.setInterval(() => renderLod(store.lod, globe.cameraDistance()), 1000);

(async function boot() {
  await loadCatalogStatus();
  await loadSnapshot();
  window.setInterval(() => {
    loadCatalogStatus();
    loadSnapshot({ silent: true });
  }, REFRESH_MS);
})();
