// 태풍 예보 타임라인 — 손으로 밀거나(스크러버) ▶ 로 재생
//
// 받은 지시
//   "타임라인 잡고 움직이면 그 시간대 위치 볼 수 있게" +
//   "그 앞에 플레이 버튼도 있어서 누르면 시간대별로 움직임을 볼 수 있게"
//
// 시간을 밀면 바뀌는 것 (전부 그 시각의 자료로 교체 — 섞지 않는다)
//   · 태풍       — 기관별 원반이 각자 예보 위치로 (cyclones.setFxTime)
//   · 등압선     — 모델 예보 기압장 (isobars.setOverride)
//   · 바람 입자  — 모델 예보 바람장 (windField.override)
//   · 위성 구름  — 옅어진다. 위성은 실황이라 미래가 없다 (imagery.setFxDim)
//
// ⚠️ +120시간(5일)까지만이다. 태풍의 공식 예보가 거기서 끝난다 —
//    그 너머를 열면 태풍을 지어내게 된다.
// ⚠️ 재생은 끝에 닿으면 멈춘다. 무한 반복은 발열이고, 두 바퀴째부터는
//    새 정보가 없다.

import { API } from './config.js';
import { fetchT } from './net.js';
import { i18n } from './i18n.js';
import { power } from './power.js';

const STEP_H = 6;
const MAX_H = 120;
const N = MAX_H / STEP_H;          // 20 (+ "지금" = 21칸)
const PLAY_MS = 900;               // 재생 속도 — 한 칸에 약 1초

export const fxTimeline = {
  _el: null,
  _doc: null,
  _docAt: 0,
  _i: 0,
  _timer: null,
  _storm: null,

  /* ── 자료 ── */
  async _load() {
    if (this._doc && Date.now() - this._docAt < 30 * 60_000) return this._doc;
    try {
      const r = await fetchT(`${API.WIND}/fx-ea.json`, { cache: 'no-cache' });
      this._doc = r.ok ? await r.json() : null;
      this._docAt = Date.now();
    } catch (_) { this._doc = null; }
    return this._doc;
  },

  /* ── 화면 ── */
  _build() {
    if (this._el) return this._el;
    const ko = i18n.lang === 'ko';
    const bar = document.createElement('div');
    bar.id = 'fxBar';
    bar.innerHTML =
      `<button id="fxPlay" aria-label="${ko ? '재생' : 'Play'}">▶</button>`
      + `<input id="fxRange" type="range" min="0" max="${N}" step="1" value="0">`
      + `<div id="fxLabel"></div>`;
    document.body.appendChild(bar);

    const chip = document.createElement('div');
    chip.id = 'fxChip';
    document.body.appendChild(chip);

    bar.querySelector('#fxPlay').onclick = () => this._playing ? this.pause() : this.play();
    bar.querySelector('#fxRange').oninput = (e) => {
      this.pause();                          // 손으로 잡으면 재생은 멈춘다
      this.set(+e.target.value);
    };
    this._el = bar;
    this._chip = chip;
    return bar;
  },

  _label(i) {
    const ko = i18n.lang === 'ko';
    if (i === 0) return ko ? '지금 (실황)' : 'Now (observed)';
    const d = new Date(Date.now() + i * STEP_H * 3_600_000);
    const day = `${d.getMonth() + 1}/${d.getDate()}`;
    const h = d.getHours();
    const hh = ko ? `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}시`
                  : `${String(h).padStart(2, '0')}:00`;
    return `+${i * STEP_H}${ko ? '시간' : 'h'} · ${day} ${hh}`;
  },

  /* ── 시각 적용 ── */
  async set(i) {
    this._i = Math.max(0, Math.min(N, i));
    if (!this._el) return;
    this._el.querySelector('#fxRange').value = this._i;
    this._el.querySelector('#fxLabel').textContent = this._label(this._i);

    const ko = i18n.lang === 'ko';
    const [{ isobars }, { windField }, { cyclones }, { imagery }] = await Promise.all([
      import('./isobars.js'), import('./windfield.js'),
      import('./layers/cyclone.js'), import('./layers/imagery.js'),
    ]);

    if (this._i === 0) {
      // 실황 복귀 — 전부 원래대로
      isobars.setOverride(null);
      windField.override = null;
      cyclones.setFxTime(null);
      imagery.setFxDim(false);
      this._chip.classList.remove('on');
      power.animate(500);
      return;
    }

    const d = await this._load();
    const st = d?.steps?.[this._i];
    if (st) {
      isobars.setOverride(st, d);
      windField.override = { lat0: d.lat0, lon0: d.lon0, res: d.res,
                             nx: d.nx, ny: d.ny, u: st.u, v: st.v };
    } else {
      // ⚠️ 격자가 없으면 실황 등압선·바람을 그대로 두지 않는다 — 시각이 다르다
      isobars.setOverride(null);
      windField.override = null;
    }
    cyclones.setFxTime(this._i * STEP_H);
    imagery.setFxDim(true);
    this._chip.textContent = ko
      ? `예보 보기 ${this._label(this._i)} — 모델(GFS·ECMWF)과 기관 통보문 값 · 실황 아님`
      : `Forecast view ${this._label(this._i)} — model + agency values, not observation`;
    this._chip.classList.add('on');
    power.animate(500);
  },

  /* ── 재생 ── */
  get _playing() { return !!this._timer; },
  play() {
    if (this._timer) return;
    if (this._i >= N) this.set(0);           // 끝에서 누르면 처음부터
    this._el.querySelector('#fxPlay').textContent = '⏸';
    this._timer = setInterval(() => {
      if (this._i >= N) { this.pause(); return; }   // ⚠️ 끝에서 멈춘다. 반복 없음
      this.set(this._i + 1);
    }, PLAY_MS);
  },
  pause() {
    clearInterval(this._timer);
    this._timer = null;
    this._el?.querySelector('#fxPlay') && (this._el.querySelector('#fxPlay').textContent = '▶');
  },

  /* ── 표시/숨김 (cyclone.js 가 부른다) ── */
  async show(storm) {
    this._storm = storm;
    this._build().classList.add('on');
    this.set(this._i && this._storm === storm ? this._i : 0);
    this._load();                            // 격자를 미리 받아 둔다
  },
  hide() {
    this.pause();
    if (!this._el) return;
    this._el.classList.remove('on');
    this._chip.classList.remove('on');
    if (this._i !== 0) this.set(0);          // 실황으로 되돌리고 닫는다
    this._storm = null;
  },
};
