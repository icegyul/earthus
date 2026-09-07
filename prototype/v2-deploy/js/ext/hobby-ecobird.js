// EARTHUS v2-three · 취미 · 전국 조류 조사 (에코뱅크) — 어디에 조사 기록이 있는가
// 1.0 의 prototype/js/ui-ecobird.js 를 ext 규약(ext-scene.js · CONTRACT.md)으로 옮긴 것.
//
// ⚠️⚠️ **새의 현재 위치도, 개체수 지도도 아니다.**
//   원자료의 관측 기록을 약 5km 칸으로 묶었다. 한 칸의 기록이 많다는 것은
//   조사 기록이 많이 쌓였다는 뜻이지, 지금 새가 많다는 뜻이 아니다.
//   빈 칸도 "새 없음"이 아니라 "위치가 있는 조사 기록 없음"이다.
//
// ⚠️ 4,521칸을 객체 4,521개로 만들지 않는다. ctx.makePoints 무리 셋(기록 수 제곱근 등급)으로 묶는다.
//   1.0 은 1,800 m 높이에 찍었다 — 여기서는 lift 0.004 (≈ 25 km 반지름 비율) 로 지형 위에 띄운다.

const n0 = (v) => Number(v || 0).toLocaleString('ko-KR');
const COLOR = 0x7fd8c8;
const LIFT = 0.004;
const SOURCE_URL = 'https://www.nie-ecobank.kr/data/api/intrcn.do';
const LICENSE_URLS = [
  { ko: '자연환경조사 조류 점', en: 'Natural Environment Survey birds', url: 'https://www.data.go.kr/data/15101293/openapi.do' },
  { ko: '생태계정밀조사 조류 점', en: 'Ecosystem Detail Survey birds', url: 'https://www.data.go.kr/data/15101323/openapi.do' },
  { ko: '백두대간정밀조사 조류 점', en: 'Baekdudaegan Detail Survey birds', url: 'https://www.data.go.kr/data/15101305/openapi.do' },
];
const COPYRIGHT_URL = 'https://www.nie-ecobank.kr/cmmn/intro/copyrightPolicy.do';

/* 5km 칸이 서로 붙어 있으므로 크게 그리면 남한이 한 덩어리로 덮인다.
   기록이 가장 많은 칸도 작게 제한하고, 대부분은 작은 점으로 남긴다 (1.0: 2.4~9px). */
const CLASSES = [
  { max: 0.3, size: 2.4, opacity: 0.4 },
  { max: 0.6, size: 3.2, opacity: 0.55 },
  { max: 1.01, size: 4.5, opacity: 0.75 },
];
const PICK_KM = 4;   // 5 km 칸의 반 조금 넘게

const cellsOf = (state) => (state.data?.cells || []).filter((c) => c && c.lat != null && c.lon != null);

export default {
  key: 'hobby/ecobird',
  title: '전국 조류 조사',
  badge: 'HISTORY',

  async load(ctx, state, signal) {
    state.data = await ctx.fetchJson(`${ctx.S3}/events/ecobird.json`, { signal, cache: 'no-cache' });
    // 자료가 전부 한반도 안이다 — 열면 한국으로 날아간다 (1.0 은 124.3–131.7E · 32.7–39.2N 사각형으로 이동)
    state.point = { lat: 36, lon: 128, altKm: 1200 };
  },

  build(ctx, state) {
    const cells = cellsOf(state);
    if (!cells.length) return;
    const max = Math.max(...cells.map((c) => c.n || 0)) || 1;
    const groups = CLASSES.map(() => []);
    cells.forEach((c) => {
      const f = Math.sqrt((c.n || 0) / max);
      const k = CLASSES.findIndex((cl) => f < cl.max);
      groups[k < 0 ? CLASSES.length - 1 : k].push({ lat: c.lat, lon: c.lon });
    });
    groups.forEach((items, i) => {
      if (!items.length) return;
      ctx.add(ctx.makePoints(items, { size: CLASSES[i].size, opacity: CLASSES[i].opacity, color: COLOR, lift: LIFT }));
    });
  },

  card(ctx, state) {
    const { esc } = ctx; const ko = ctx.ko;
    const d = state.data || {};
    const cells = d.cells || [];
    const species = d.species || [];
    const updated = String(d.updated || '').replace('T', ' ').slice(0, 16);
    const licenseLinks = (Array.isArray(d.licenseUrls) ? d.licenseUrls : LICENSE_URLS)
      .map((item) => `<a href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item[ko ? 'ko' : 'en'] || item.ko || item.en)} ↗</a>`)
      .join(' · ');

    return `
      <div class="sb-warn">
        <b>${ko ? '조사 기록' : 'Survey records'}</b>
        <p>${ko
          ? '약 5km 격자 · <b>점 크기 = 기록 건수</b>'
          : '~5 km grid · <b>dot size = record count</b>'}</p>
        <p>${ko
          ? '⚠️ 새의 현재 위치도, 개체수 지도도 아닙니다. 기록이 많은 칸은 조사 기록이 많이 쌓인 곳이고, 빈 칸은 "위치가 있는 조사 기록 없음"입니다.'
          : '⚠️ Not current bird positions and not an abundance map. A dense cell has many survey records; an empty cell has no located survey record.'}</p>
      </div>
      <div class="sb-sum">
        <div class="sb-cell"><b>${n0(d.records)}</b><em>${ko ? '받은 기록' : 'records received'}</em></div>
        <div class="sb-cell"><b>${n0(d.mapped)}</b><em>${ko ? '지도 기록' : 'mapped records'}</em></div>
        <div class="sb-cell"><b>${n0(d.speciesCount)}</b><em>${ko ? '기록된 종' : 'species'}</em></div>
        <div class="sb-cell"><b>${n0(cells.length)}</b><em>${ko ? '5km 조사 칸' : '5 km cells'}</em></div>
      </div>
      <p class="sb-note">${ko
        ? `미표시 · 위치 없음 ${n0(d.noLocation)}건 · 좌표 이상 ${n0(d.dropped)}건 · 미수신 ${n0(d.truncated)}건`
        : `${n0(d.noLocation)} records have no source location · ${n0(d.dropped)} invalid coordinates · ${n0(d.truncated)} not received`}</p>
      <p class="sb-h">${ko ? '많이 기록된 종' : 'Most recorded species'}</p>
      <div class="sb-list">${species.slice(0, 30).map(([name, count]) => `
        <div class="sb-row" role="group">
          <span class="sb-nm"><b>${esc(name)}</b><em>${ko ? '조사 기록에 나온 이름' : 'name in survey records'}</em></span>
          <span class="sb-n">${n0(count)}<u>${ko ? '건' : ''}</u><em>${ko ? '기록 횟수' : 'records'}</em></span>
        </div>`).join('')}</div>
      <p class="sub-legal">
        ${esc(d.source || '')} · ${esc(d.license || '')}<br>
        ${ko
          ? `자료 갱신 ${esc(updated)} · 공공누리 제1유형은 출처를 밝히면 상업적 이용과 가공을 허용합니다. `
            + `제3자 권리 포함 · 유료 가공물·원자료 CSV/API는 권리 범위 확인 후 제공`
          : `Updated ${esc(updated)} · KOGL Type 1 permits commercial use and adaptation with attribution. `
            + `This API is also marked <b>as including third-party rights</b>, so earthus withholds paid derivatives and raw CSV/API exports until the rights scope is confirmed in writing.`}<br>
        ${licenseLinks}<br>
        <a href="${esc(d.sourceUrl || SOURCE_URL)}" target="_blank" rel="noopener">${ko ? '에코뱅크 OpenAPI 안내 ↗' : 'EcoBank OpenAPI guide ↗'}</a>
        · <a href="${esc(d.copyrightUrl || COPYRIGHT_URL)}" target="_blank" rel="noopener">${ko ? '에코뱅크 저작권 정책 ↗' : 'EcoBank copyright policy ↗'}</a>
      </p>`;
  },

  /** 지구를 눌렀을 때 — 가장 가까운 5 km 칸. 문장은 1.0 의 _pick 그대로. */
  pick(ctx, state, lat, lon) {
    const { esc } = ctx; const ko = ctx.ko; const d = state.data || {};
    let best = null; let bd = PICK_KM;
    cellsOf(state).forEach((c) => {
      const dk = ctx.distKm({ lat, lon }, { lat: c.lat, lon: c.lon });
      if (dk < bd) { bd = dk; best = c; }
    });
    if (!best) return null;
    return {
      title: ko ? '에코뱅크 조사 칸' : 'EcoBank survey cell',
      badge: 'HISTORY',
      body: `<div class="sb-warn"><b>${ko ? '약 5km 조사 칸' : '~5 km survey cell'}</b>`
        + `<p>${ko
          ? `기록 ${n0(best.n)}건 · 기록된 종 ${n0(best.spc)}종`
          : `${n0(best.n)} records · ${n0(best.spc)} species`}</p>`
        + `<p>${ko ? '조사 기록의 위치이지 지금 새가 있는 곳이 아닙니다' : 'Where survey records were made — not where birds are now'}</p></div>`
        + `<p class="sub-legal">${esc(d.source || '')} · ${esc(d.license || '')}</p>`,
    };
  },
};
