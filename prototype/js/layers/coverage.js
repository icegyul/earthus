// 관측망 밀도 — "지구의 어디를 아무도 안 보고 있나"
//
// 왜 이 그림인가
//   다른 레이어는 전부 "무엇이 있는가"를 보여준다. 이건 **없음**을 보여준다.
//   부이 2,347곳과 지상 관측소 1,912곳을 한 화면에 겹치면,
//   태평양 한가운데와 아프리카 내륙, 시베리아, 남대양이 통째로 비어 있는 게 드러난다.
//
//   그게 왜 중요한가: 우리가 보여주는 모든 값의 신뢰도가 여기에 달려 있다.
//   관측이 없는 곳의 격자값은 모델이 채운 것이지 잰 것이 아니다.
//   "이 자료가 어디서 약한가"를 스스로 밝히는 레이어다.
//
// ⚠️ 관측소 수를 신뢰도라고 말하지 않는다.
//    관측소가 적어도 위성이 촘촘히 보는 곳이 있다(바다 위 수온). 반대로
//    관측소가 많아도 그 나라만 촘촘한 경우가 있다. 여기서는 **센 것만** 말한다.
//
// ⚠️ 격자 칸의 면적이 위도마다 다르다.
//    같은 5° 칸이라도 적도는 넓고 극지는 좁다. "칸당 개수"를 그대로 색칠하면
//    극지가 실제보다 촘촘해 보인다. 그래서 **면적당 개수**로 나눈다.

import { viewer } from '../viewer.js';
import { API } from '../config.js';
import { i18n } from '../i18n.js';

/* 세는 격자 — 지도 격자(5°)보다 굵게 잡는다.
   ⚠️ 5° 로 세면 대부분 칸이 0~1 이라 얼룩만 보인다. 10° 가 "빈 곳"이 읽히는 크기다. */
const RES = 10;
const NX = 36, NY = 16;          // 경도 360/10, 위도 -80~80
const LAT0 = -80, LON0 = -180;

/* 색과 투명도.
   ⚠️ 처음엔 "촘촘할수록 밝게" 칠했더니 지구가 통째로 하얘졌다.
      실측 분포: 중앙값 4.1, 상위 1% 108, 최대 237 — 대부분 칸이 눈금 위쪽에 몰려
      전부 같은 색이 됐다. 그리고 무엇보다 **이 레이어의 요점은 촘촘함이 아니라 빈 곳**이다.

   그래서 뒤집었다: **빈 곳만 칠하고 촘촘한 곳은 비운다.**
      관측점 0    → 붉게, 진하게 (아무도 안 보는 곳)
      드문 곳     → 옅은 주황
      보통 이상   → 거의 투명 (지구가 그대로 보인다)
   그러면 화면에 남는 것이 곧 "구멍"이다. */
const LEVELS = [
  { max: 0,    rgb: [200, 70, 60],   a: 205 },   // 하나도 없음
  { max: 1,    rgb: [200, 120, 60],  a: 150 },   // 적도 환산 1곳 미만
  { max: 4,    rgb: [190, 160, 80],  a: 95 },    // 드묾
  { max: 12,   rgb: [140, 170, 150], a: 45 },    // 보통
  { max: 1e9,  rgb: [120, 170, 200], a: 16 },    // 촘촘 — 거의 안 보이게
];

function levelAt(v) {
  for (const L of LEVELS) if (v <= L.max) return L;
  return LEVELS[LEVELS.length - 1];
}

export const coverage = {
  layer: null,
  stats: null,

  async show(on) {
    if (!on) {
      if (this.layer) { try { viewer.imageryLayers.remove(this.layer, true); } catch (_) {} }
      this.layer = null;
      return;
    }
    if (this.layer) return;

    const pts = await this._points();
    if (!pts.length) throw new Error('관측소 자료를 못 받았다');

    // 격자에 센다
    const cnt = new Array(NX * NY).fill(0);
    pts.forEach(([lat, lon]) => {
      if (lat < LAT0 || lat > LAT0 + NY * RES) return;
      const iy = Math.floor((lat - LAT0) / RES);
      const ix = Math.floor((((lon - LON0) % 360 + 360) % 360) / RES);
      if (iy >= 0 && iy < NY && ix >= 0 && ix < NX) cnt[iy * NX + ix]++;
    });

    /* 면적당으로 바꾼다. ⚠️ 이걸 빼면 극지가 실제보다 촘촘해 보인다.
       기준 면적은 적도 칸(10°×10°) — 거기서 "1" 이 되게 맞춘다. */
    const dens = cnt.map((n, k) => {
      const lat = LAT0 + Math.floor(k / NX) * RES + RES / 2;
      const w = Math.max(0.08, Math.cos(lat * Math.PI / 180));
      return n / w;
    });

    const empty = cnt.filter(n => n === 0).length;
    this.stats = {
      points: pts.length, cells: NX * NY, empty,
      emptyPct: Math.round(empty / (NX * NY) * 100),
    };

    // 캔버스로 칠해 한 장으로 얹는다 (격자 레이어와 같은 방식)
    const S = 6;                                   // 칸당 화소
    const cv = document.createElement('canvas');
    cv.width = NX * S; cv.height = NY * S;
    const g = cv.getContext('2d');
    const img = g.createImageData(cv.width, cv.height);
    for (let y = 0; y < cv.height; y++) {
      const iy = NY - 1 - Math.floor(y / S);       // 캔버스는 위가 북쪽
      for (let x = 0; x < cv.width; x++) {
        const ix = Math.floor(x / S);
        const L = levelAt(dens[iy * NX + ix]);
        const o = (y * cv.width + x) * 4;
        img.data[o] = L.rgb[0]; img.data[o + 1] = L.rgb[1]; img.data[o + 2] = L.rgb[2];
        img.data[o + 3] = L.a;
      }
    }
    g.putImageData(img, 0, 0);

    this.layer = viewer.imageryLayers.addImageryProvider(
      new Cesium.SingleTileImageryProvider({
        url: cv.toDataURL(),
        rectangle: Cesium.Rectangle.fromDegrees(LON0, LAT0, LON0 + 360, LAT0 + NY * RES),
        tileWidth: cv.width, tileHeight: cv.height,
      }));
    this.layer.alpha = 0.95;
  },

  /** 관측점 좌표를 모은다. ⚠️ 못 받은 자료원은 조용히 빼고, 무엇을 뺐는지 남긴다. */
  async _points() {
    const out = [];
    this.missing = [];
    const grab = async (url, key, label) => {
      try {
        const r = await fetch(url, { cache: 'no-cache' });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        (j[key] || []).forEach(x => {
          if (x.lat != null && x.lon != null) out.push([x.lat, x.lon]);
        });
      } catch (e) {
        // ⚠️ 한 자료원이 빠진 채로 "빈 곳"을 보여주면 없는 공백을 만들어낸다.
        this.missing.push(label);
      }
    };
    await Promise.all([
      grab(`${API.OCEAN}/buoys.json`, 'buoys', i18n.lang === 'ko' ? '해양 부이' : 'ocean buoys'),
      grab(`${API.WIND}/stations.json`, 'stations', i18n.lang === 'ko' ? '지상 관측소' : 'ground stations'),
    ]);
    return out;
  },

  note() {
    const ko = i18n.lang === 'ko';
    const s = this.stats;
    if (!s) return '';
    const miss = this.missing?.length
      ? (ko ? `\n⚠️ ${this.missing.join('·')} 자료를 못 받아 빠졌습니다 — 실제보다 더 비어 보입니다.`
            : `\n⚠️ ${this.missing.join(', ')} could not be loaded, so this looks emptier than it is.`)
      : '';
    return (ko
      ? `관측점 ${s.points.toLocaleString()}곳 (해양 부이 + 지상 관측소)을 10° 격자에 센 것입니다. `
        + `${s.cells}칸 중 **${s.empty}칸(${s.emptyPct}%)에 관측점이 하나도 없습니다.**\n`
        + `⚠️ 면적당 개수로 나눴습니다 — 같은 10° 칸이라도 극지는 좁아서, 안 나누면 극지가 실제보다 촘촘해 보입니다.\n`
        + `색이 진할수록 관측이 없는 곳입니다 — 촘촘한 곳은 일부러 비워 두었습니다. 화면에 남는 붉은 자리가 곧 구멍입니다.\n`
        + `⚠️ 관측소 수는 신뢰도가 아닙니다. 바다 위 수온처럼 위성이 촘촘히 보는 값도 있습니다. 여기서는 센 것만 말합니다.`
      : `${s.points.toLocaleString()} observation points (ocean buoys + ground stations) counted on a 10° grid. `
        + `**${s.empty} of ${s.cells} cells (${s.emptyPct}%) contain no observation point at all.**\n`
        + `⚠️ Counts are divided by cell area: without that, the poles look denser than they are.\n`
        + `The stronger the colour, the fewer observations: dense areas are deliberately left clear, so what remains on screen is the gap.\n`
        + `⚠️ Station count is not confidence — some values, like sea surface temperature, are watched densely by satellite. This layer reports only what it counted.`) + miss;
  },
};
