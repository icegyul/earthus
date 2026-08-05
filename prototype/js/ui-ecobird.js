// 에코뱅크 조류 — 어디에 조사 기록이 있는가
//
// ⚠️⚠️ **새의 현재 위치도, 개체수 지도도 아니다.**
//   원자료의 관측 기록을 약 5km 칸으로 묶었다. 한 칸의 기록이 많다는 것은
//   조사 기록이 많이 쌓였다는 뜻이지, 지금 새가 많다는 뜻이 아니다.
//   빈 칸도 "새 없음"이 아니라 "위치가 있는 조사 기록 없음"이다.
//
// ⚠️ 4,521칸을 Entity 4,521개로 만들지 않는다. PointPrimitiveCollection 하나로
//   묶어 선택한 동안만 렌더한다. 무한 애니메이션은 없다.

import { i18n } from './i18n.js';
import { API } from './config.js';
import { viewer } from './viewer.js';
import { power } from './power.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n0 = v => Number(v || 0).toLocaleString('ko-KR');
const SOURCE_URL = 'https://www.nie-ecobank.kr/data/api/intrcn.do';

let data = null;

async function load() {
  if (data) return data;
  const r = await fetch(`${API.EVENTS}/ecobird.json`, { cache: 'no-cache' });
  if (!r.ok) throw new Error('ecobird ' + r.status);
  data = await r.json();
  return data;
}

export const ecobirdPanel = {
  _points: null,

  async open() {
    document.querySelectorAll('.sheet-panel.up').forEach(p => p.classList.remove('up'));
    $('#ecobirdSheet')?.classList.add('up');
    const body = $('#ecobirdBody');
    const ko = i18n.lang === 'ko';
    if (body) body.innerHTML = `<p class="kr-note">${ko ? '불러오는 중…' : 'Loading…'}</p>`;
    try {
      await load();
      this.render();
      this.draw();
    } catch (e) {
      if (body) body.innerHTML = `<p class="kr-note">${ko
        ? '자료를 불러오지 못했습니다' : 'Could not load'} · ${esc(e.message)}</p>`;
    }
  },

  close() { $('#ecobirdSheet')?.classList.remove('up'); this.clear(); },

  render() {
    const body = $('#ecobirdBody');
    if (!body || !data) return;
    const ko = i18n.lang === 'ko';
    const cells = data.cells || [];
    const species = data.species || [];
    const updated = String(data.updated || '').replace('T', ' ').slice(0, 16);

    body.innerHTML = `
      <div class="sb-warn">
        <b>${ko ? '⚠️ 지금 새가 있는 곳이 아닙니다' : '⚠️ Not live bird positions'}</b>
        <p>${ko
          ? '기관의 조사 기록을 약 5km 칸으로 묶었습니다. <b>점 크기는 기록 건수</b>이며 '
            + '새의 개체수가 아닙니다.<br><b>빈 칸은 “새가 없다”가 아니라 '
            + '“위치가 있는 조사 기록이 없다”는 뜻입니다.</b>'
          : 'Survey records are grouped into ~5 km cells. Dot size is the number of records, '
            + 'not bird abundance. Empty cells mean no located survey record, not no birds.'}</p>
      </div>
      <div class="sb-sum">
        <div class="sb-cell"><b>${n0(data.records)}</b><em>${ko ? '받은 기록' : 'records received'}</em></div>
        <div class="sb-cell"><b>${n0(data.mapped)}</b><em>${ko ? '지도 기록' : 'mapped records'}</em></div>
        <div class="sb-cell"><b>${n0(data.speciesCount)}</b><em>${ko ? '기록된 종' : 'species'}</em></div>
        <div class="sb-cell"><b>${n0(cells.length)}</b><em>${ko ? '5km 조사 칸' : '5 km cells'}</em></div>
      </div>
      <p class="sb-note">${ko
        ? `⚠️ 위치가 없어 지도에 못 올린 기록 ${n0(data.noLocation)}건 · 좌표 이상 ${n0(data.dropped)}건 · 못 받은 기록 ${n0(data.truncated)}건`
        : `${n0(data.noLocation)} records have no source location · ${n0(data.dropped)} invalid coordinates · ${n0(data.truncated)} not received`}</p>
      <p class="sb-h">${ko ? '많이 기록된 종' : 'Most recorded species'}</p>
      <div class="sb-list">${species.slice(0, 30).map(([name, count]) => `
        <div class="sb-row" role="group">
          <span class="sb-nm"><b>${esc(name)}</b><em>${ko ? '조사 기록에 나온 이름' : 'name in survey records'}</em></span>
          <span class="sb-n">${n0(count)}<u>${ko ? '건' : ''}</u><em>${ko ? '기록 횟수' : 'records'}</em></span>
        </div>`).join('')}</div>
      <p class="sub-legal">
        ${esc(data.source || '')} · ${esc(data.license || '')}<br>
        ${ko
          ? `자료 갱신 ${esc(updated)} · 무료 화면에서 출처와 함께 표시합니다. 상업적 재사용·내보내기는 공식 세부 이용조건 확인 전 보류합니다.`
          : `Updated ${esc(updated)} · shown with attribution on the free map. Commercial reuse and export remain on hold pending the detailed terms.`}<br>
        <a href="${esc(data.sourceUrl || SOURCE_URL)}" target="_blank" rel="noopener">${ko ? '에코뱅크 OpenAPI 안내 ↗' : 'EcoBank OpenAPI guide ↗'}</a>
      </p>`;
  },

  draw() {
    this.clear();
    if (!data || !window.Cesium || !viewer) return;
    const C = window.Cesium;
    const ko = i18n.lang === 'ko';
    const cells = (data.cells || []).filter(c => c.lat != null && c.lon != null);
    if (!cells.length) return;
    const max = Math.max(...cells.map(c => c.n || 0)) || 1;
    const points = new C.PointPrimitiveCollection();
    cells.forEach(cell => {
      const scale = Math.sqrt((cell.n || 0) / max);
      points.add({
        id: { _pick: ko
          ? `에코뱅크 약 5km 조사 칸 · 기록 ${n0(cell.n)}건 · 기록된 종 ${n0(cell.spc)}종 · 현재 위치 아님`
          : `EcoBank ~5 km survey cell · ${n0(cell.n)} records · ${n0(cell.spc)} species · not live` },
        position: C.Cartesian3.fromDegrees(cell.lon, cell.lat, 1800),
        /* 5km 칸이 서로 붙어 있으므로 크게 그리면 남한이 한 덩어리로 덮인다.
           기록이 가장 많은 칸도 9px 아래로 제한하고, 대부분은 작은 점으로 남긴다. */
        pixelSize: 2.4 + scale * 6.5,
        color: C.Color.fromCssColorString('#7fd8c8').withAlpha(0.24 + scale * 0.34),
        outlineColor: C.Color.fromCssColorString('#d7fff5').withAlpha(0.48),
        outlineWidth: scale > 0.58 ? 1 : 0,
        scaleByDistance: new C.NearFarScalar(250_000, 1.15, 5_000_000, 0.62),
        distanceDisplayCondition: new C.DistanceDisplayCondition(0, 7_000_000),
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
      });
    });
    this._points = viewer.scene.primitives.add(points);
    viewer.camera.flyTo({
      destination: C.Rectangle.fromDegrees(124.3, 32.7, 131.7, 39.2),
      duration: 1.0,
    });
    power.animate(900);
  },

  clear() {
    if (!this._points || !viewer) return;
    try { viewer.scene.primitives.remove(this._points); } catch (_) { }
    this._points = null;
    power.animate(300);
  },
};
