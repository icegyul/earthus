/* EARTHUS V2 — non-blocking Intelligence v5.1 boot adapter.
 * Intelligence is lazy/fail-soft: base Earth remains usable if this adapter fails.
 */
import { installProgressivePlanetIntelligence } from './progressive-planet-intelligence.js';

let controller = null;
let boundViewer = null;
let disposed = false;
let materializedSnapshot = null;

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function renderIntelSnapshot(snapshot) {
  if (!snapshot) return;
  const { context, executionPlan, renderPolicy, readiness } = snapshot;
  const now = document.getElementById('now');
  if (now && !document.querySelector('.chips .on')) {
    now.textContent = `${context.viewScope} · ${context.truthState} · ${executionPlan.quality}`;
  }
  const body = document.getElementById('body');
  const panel = document.getElementById('intel');
  if (!body || !panel || panel.hidden || document.querySelector('.chips .on')) return;
  body.className = 'grid';
  const materializedRows = materializedSnapshot
    ? `<div><span>MATERIALIZED</span><b>${escapeHtml(materializedSnapshot.earthVersion)}</b></div><div><span>EVENTS</span><b>${materializedSnapshot.activeEventCount}</b></div><div><span>OBSERVED</span><b>${escapeHtml(materializedSnapshot.observedAt || 'INSUFFICIENT_DATA')}</b></div>`
    : '<div><span>MATERIALIZED</span><b>INSUFFICIENT_DATA</b></div>';
  body.innerHTML = `<div><span>SCOPE</span><b>${escapeHtml(context.viewScope)}</b></div><div><span>TRUTH</span><b>${escapeHtml(context.truthState)}</b></div><div><span>QUALITY</span><b>${escapeHtml(executionPlan.quality)}</b></div><div><span>FETCH</span><b>${escapeHtml(renderPolicy.fetchPolicy)}</b></div><div><span>READINESS</span><b>${readiness.readyCount}/${readiness.total}</b></div>${materializedRows}`;
}

function bindIfReady() {
  if (disposed) return;
  materializedSnapshot = materializedSnapshot
    || globalThis.__earthusV52Materialized?.snapshot?.()
    || null;
  const root = globalThis.__earthusV2;
  if (!root?.viewer || !root?.realEarth) return;
  if (boundViewer === root.viewer && controller) return;
  try { controller?.dispose?.(); } catch (_) {}
  try {
    controller = installProgressivePlanetIntelligence({ viewer: root.viewer, realEarth: root.realEarth, tasks: root.tasks });
    boundViewer = root.viewer;
    globalThis.__earthusV2Intelligence = controller;
    renderIntelSnapshot(controller.snapshot());
  } catch (error) {
    controller = null;
    boundViewer = null;
    globalThis.__earthusV2Intelligence = null;
    console.warn('[v2 intelligence/bootstrap]', error?.message || error);
  }
}

document.addEventListener('earthus:v2-intelligence-context', event => renderIntelSnapshot(event.detail));
document.addEventListener('earthus:v52-materialized-ready', event => {
  materializedSnapshot = event.detail || null;
  renderIntelSnapshot(controller?.snapshot?.());
});
document.addEventListener('click', event => {
  if (event.target?.closest?.('#tab')) queueMicrotask(() => {
    materializedSnapshot = globalThis.__earthusV52Materialized?.snapshot?.() || materializedSnapshot;
    renderIntelSnapshot(controller?.snapshot?.());
  });
}, true);
const timer = setInterval(bindIfReady, 180);
bindIfReady();

window.addEventListener('pagehide', () => {
  disposed = true;
  clearInterval(timer);
  try { controller?.dispose?.(); } catch (_) {}
  controller = null;
  boundViewer = null;
  globalThis.__earthusV2Intelligence = null;
}, { once: true });
