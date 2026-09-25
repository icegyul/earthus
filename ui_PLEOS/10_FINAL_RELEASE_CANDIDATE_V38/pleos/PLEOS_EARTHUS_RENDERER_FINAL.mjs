/** V38 FINAL Pleos renderer. EARTHUS only. */
import { EarthusUIAdapterV36, DOCKS, PANEL_BY_DOCK } from '../../08_UI_ADAPTER_V36/core/EARTHUS_UI_ADAPTER_V36.mjs';
import { createPleosTarget, assertPleosTarget } from './PRODUCT_TARGET_PLEOS_FINAL.mjs';

export class PleosEarthusRendererFinal {
  constructor(opts = {}) {
    assertPleosTarget();
    this.target = createPleosTarget();
    this.layout = 'PLEOS';
    this.adapter = opts.adapter ?? new EarthusUIAdapterV36(opts);
  }
  openDock(dock) { return this.adapter.openDock(dock); }
  closePanel() { return this.adapter.closePanel(); }
  selectPoi(poi, env = {}) { return this.adapter.selectPoi(poi, env); }
  setDrivingStateProvider(fn) { return this.adapter.setDrivingStateProvider(fn); }
  action(feature) { return this.adapter.action(feature); }
  model() {
    const v = this.adapter.view();
    return {
      target: this.target,
      layout: this.layout,
      brand: 'EARTHUS',
      dock: v.dock,
      panel: v.panel,
      menu: v.menu,
      selectedPoiId: v.selectedPoiId,
      mapBbox: v.mapBbox,
      layers: v.layers
    };
  }
  renderHTML() {
    const m = this.model();
    const buttons = DOCKS.map(d => `<button class="dock-item ${m.dock===d?'active':''}" data-dock="${d}">${d}</button>`).join('');
    const panel = m.panel ? `<aside class="floating-panel" data-panel="${m.panel}"><header><strong>${m.panel}</strong><button data-action="close">×</button></header><div class="panel-grid">${(PANEL_BY_DOCK[m.panel]||[]).map(x=>`<button class="panel-card">${x}</button>`).join('')}</div></aside>` : '';
    const card = m.selectedPoiId ? `<section class="place-card"><strong>${m.selectedPoiId}</strong></section>` : '';
    return `<div class="earthus-screen" data-product="EARTHUS" data-platform="PLEOS"><header><div class="brand">EARTHUS</div><div class="safety-badge">PLEOS · EARTHUS ONLY</div></header><main class="map-stage"><div class="map-placeholder">EARTH MAP</div>${panel}${card}</main><nav class="dock">${buttons}</nav></div>`;
  }
}
