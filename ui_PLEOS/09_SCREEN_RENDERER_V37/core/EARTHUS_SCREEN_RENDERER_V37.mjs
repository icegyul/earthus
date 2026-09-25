import { EarthusUIAdapterV36, DOCKS, PANEL_BY_DOCK } from '../../08_UI_ADAPTER_V36/core/EARTHUS_UI_ADAPTER_V36.mjs';
import { PRODUCTS, PLATFORMS, assertProductTarget, createTarget } from './PRODUCT_TARGET_V37.mjs';

const LAYOUTS = Object.freeze({
  WEB: 'WEB',
  WIDE: 'WIDE',
  PHONE: 'PHONE',
  PLEOS: 'PLEOS'
});

export const EARTHUS_ONLY_DOCKS = DOCKS;

function esc(value) {
  return String(value ?? '').replace(/[&<>\"']/g, m => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[m]));
}

export class EarthusScreenRendererV37 {
  constructor(opts={}) {
    this.target = createTarget(opts.product ?? PRODUCTS.EARTHUS, opts.platform ?? PLATFORMS.MOBILE);
    this.layout = opts.layout ?? this.defaultLayout();
    this.adapter = opts.adapter ?? new EarthusUIAdapterV36(opts);
    assertProductTarget(this.target.product, this.target.platform);
    if (this.target.platform === PLATFORMS.PLEOS && this.target.product !== PRODUCTS.EARTHUS) {
      throw new Error('PLEOS_PRODUCT_IS_EARTHUS_ONLY');
    }
  }

  defaultLayout() {
    if (this.target.platform === PLATFORMS.PLEOS) return LAYOUTS.PLEOS;
    if (this.target.platform === PLATFORMS.WEB) return LAYOUTS.WEB;
    return LAYOUTS.PHONE;
  }

  openDock(dock) { return this.adapter.openDock(dock); }
  closePanel() { return this.adapter.closePanel(); }
  async selectPoi(poi, env={}) { return this.adapter.selectPoi(poi, env); }
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
      layers: v.layers,
      productVisibility: {
        EARTHUS: true,
        AETHERUS: false // intentionally false for the EARTHUS renderer; especially enforced in Pleos
      }
    };
  }

  renderHTML() {
    const m = this.model();
    const dockButtons = DOCKS.map(d => `<button class="dock-item ${m.dock===d?'active':''}" data-dock="${d}" aria-label="${d}">${d}</button>`).join('');
    const panel = m.panel ? `<aside class="floating-panel" data-panel="${m.panel}">
      <header><strong>${esc(m.panel)}</strong><button data-action="close">×</button></header>
      <div class="panel-grid">${(PANEL_BY_DOCK[m.panel]||[]).map(x=>`<button class="panel-card">${esc(x)}</button>`).join('')}</div>
    </aside>` : '';
    const card = m.selectedPoiId ? `<section class="place-card"><strong>${esc(m.selectedPoiId)}</strong><div class="place-actions"><button data-action="directions">Directions</button><button data-action="detail">Detail</button></div></section>` : '';
    const safety = m.layout === 'PLEOS' ? `<div class="safety-badge">PLEOS · EARTHUS ONLY</div>` : '';
    return `<div class="earthus-screen" data-product="EARTHUS" data-platform="${this.target.platform}" data-layout="${this.layout}">
      <header class="topbar"><div class="brand">EARTHUS</div>${safety}</header>
      <main class="map-stage"><div class="map-placeholder">EARTH MAP</div>${panel}${card}</main>
      <nav class="dock" aria-label="EARTHUS navigation">${dockButtons}</nav>
    </div>`;
  }
}

export class AetherusScreenTargetV37 {
  constructor({ platform='MOBILE', layout='PHONE' }={}) {
    if (platform === PLATFORMS.PLEOS) throw new Error('AETHERUS_IS_NOT_A_PLEOS_PRODUCT');
    this.target = createTarget(PRODUCTS.AETHERUS, platform);
    this.layout = layout;
  }

  model() {
    return {
      target: this.target,
      layout: this.layout,
      brand: 'AETHERUS',
      modules: ['solar-system', 'satellite-tracking', 'launches', 'debris'],
      pleos: false
    };
  }

  renderHTML() {
    return `<div class="aetherus-screen" data-product="AETHERUS" data-platform="${this.target.platform}" data-layout="${this.layout}">
      <header class="topbar"><div class="brand">AETHERUS</div></header>
      <main class="space-stage">SPACE CONTROL CENTER</main>
    </div>`;
  }
}
