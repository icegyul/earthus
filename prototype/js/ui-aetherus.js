// AETHERUS 궤도 인텔리전스 — EARTHUS(1.0) 쪽 입구
//
// 세 지구가 같은 AETHERUS 를 쓴다. 데이터·전파·정직성 판정은 전부 정본 코어에 있고
// (js/aetherus/core.js), 이 파일은 1.0 의 메뉴·시트에 그것을 끼워 넣는 일만 한다.
//   그리기        js/aetherus/layer-cesium.js
//   Three.js 지구 js/aetherus/layer-three.js  (Intelligence /v2, WONDER /v3)
//
// ⚠️ Cesium 레이어는 무거우므로 켤 때 처음 만든다(지연 임포트). 안 켠 사람은
//    satellite.js 도 카탈로그도 받지 않는다.

import { viewer } from './viewer.js';
import { power } from './power.js';
import { i18n } from './i18n.js';

const $ = (s) => document.querySelector(s);

let layer = null;

async function ensureLayer() {
  if (layer) return layer;
  const { AetherusCesiumLayer } = await import('./aetherus/layer-cesium.js');
  layer = new AetherusCesiumLayer({
    viewer,
    // requestRenderMode 를 켜둔 지구다 — 위치가 바뀌면 다시 그려달라고 알려야 한다
    onAnimate: (until, gap, owner) => power.animate(until, gap, owner),
  });
  // v2 의 __earthusAeth · WONDER 의 __earthusJunk 와 같은 자리 (개발 계측용 싱글턴 포인터)
  globalThis.__earthusOrbit = layer;
  return layer;
}

function panel() {
  let el = $('#aetherusOrbitSheet');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'aetherusOrbitSheet';
  el.className = 'sheet-panel';
  el.innerHTML = '<button class="sp-close" type="button" aria-label="닫기">&#215;</button>'
    + '<h3 id="aetherusOrbitTitle">궤도 인텔리전스</h3>'
    + '<div id="aetherusOrbitBody" class="kr-note" style="font-size:12.5px;line-height:1.75"></div>';
  el.querySelector('.sp-close').onclick = () => el.classList.remove('up');
  document.body.appendChild(el);
  return el;
}

export const aetherusOrbit = {
  get on() { return !!layer?.on; },

  /** 메뉴 칩에 적을 한 줄. 꺼져 있으면 null. */
  note() {
    const st = layer?.state();
    return st?.on ? st.note : null;
  },

  /** 메뉴에서 누를 때. 켜지면 설명 시트를 함께 연다. */
  async toggle() {
    const ko = i18n.lang === 'ko';
    const l = await ensureLayer();
    const st = await l.toggle();
    if (st.on) {
      const el = panel();
      document.querySelectorAll('.sheet-panel.up').forEach((p) => p.classList.remove('up'));
      el.querySelector('#aetherusOrbitTitle').textContent = ko
        ? '궤도 인텔리전스 — 우주쓰레기' : 'Orbital intelligence — space debris';
      el.querySelector('#aetherusOrbitBody').innerHTML = l.card(ko);
      el.classList.add('up');
    } else {
      $('#aetherusOrbitSheet')?.classList.remove('up');
      if (st.error) {
        const { toast } = await import('./ui.js');
        toast(ko
          ? `AETHERUS 과학 API에 연결하지 못했습니다 — 위치를 생성하지 않습니다. ${st.error}`
          : `Could not reach the AETHERUS API — no positions are generated. ${st.error}`);
      }
    }
    return st;
  },
};
