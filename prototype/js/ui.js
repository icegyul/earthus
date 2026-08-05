// UI — Ambient 크롬 / Explore 칩 / 정보 시트 / 설정 / HUD (§5-9)
import { store } from './store.js';
import { alarms, LEAD_CHOICES } from './alarms.js';
import { layerBar } from './layerbar.js';
import { renderQuality } from './render-quality.js';
import { i18n } from './i18n.js';
import { LAYER_DEFS, TIER, T, GLOBAL_EVENT, PAID_CAP } from './config.js';
/* ⚠️ CONFIG 는 config.local.js 에 있다 (git 제외 대상). billing.js·auth.js 와 같은 출처. */
import { CONFIG } from './config.local.js';
import { registry, pointLayers } from './layers/registry.js';
import { fetchWeather, wxText } from './layers/weather.js';
import { lookupPlace, lookupWaves, lookupWaveModel, compass, seaState } from './place.js';
import { imagery } from './layers/imagery.js';
import { quakes } from './layers/hazard.js';
import { launches } from './layers/space.js';
import { tsunami } from './layers/tsunami.js';
import { wildfires } from './layers/wildfire.js';
import { flyTo, locateUser, fitGlobeHeight, scene } from './viewer.js';
// 한국 기상특보 — 별도 띠를 없애고 아래 banner 큐에 합쳤다 (한 줄로 표시)
import { warn, levelEn } from './warn.js';
import { warnUI } from './ui-warn.js';
import { fetchT } from './net.js';
import { safetyActions } from './safety-actions.js';

const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = (tag, cls, txt) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt != null) n.textContent = txt;
  return n;
};

/* ══════════════════════════════════════════════════════════════
   Ambient 크롬 — 시계 / 도시 / 현재 날씨
   ══════════════════════════════════════════════════════════════ */
export const chrome = {
  /* ⚠️ 기본 위치 이름이 '인천'으로 박혀 있어 영어 화면에도 한글로 남았다.
     (AX 1차 검수) 지명이라 뜻은 같지만, 언어를 고른 사람에게는 불일치다. */
  place: { name: '', lat: 37.4563, lon: 126.7052 },
  get defaultName() { return i18n.lang === 'ko' ? '인천' : 'Incheon'; },
  wx: null,

  /* ⚠️ 위치 권한이 없으면 인천을 쓴다. 그 사실을 **첫 화면에서** 밝힌다. (감사 P1-5)
     예전에는 아무 말 없이 인천 날씨를 보여줬고, 그 설명은 날씨 상세 아래쪽에만
     있었다 — 사용자는 자기 동네 날씨로 읽는다. */
  isDefault: false,

  async init() {
    const loc = await locateUser();
    if (loc) {
      this.place = { name: '', lat: loc.lat, lon: loc.lon };
      this.isDefault = false;
      this.reverseName(loc.lat, loc.lon);
    } else {
      this.isDefault = true;
    }
    this.tick();
    setInterval(() => this.tick(), 20_000);
    await this.loadWeather();
    setInterval(() => this.loadWeather(), 10 * 60_000);
    i18n.onChange(() => { this.tick(); this.render(); });
  },

  async reverseName(lat, lon) {
    /* ⚠️⚠️ 예전에는 **도시 7개를 하드코딩**해 두고 가장 가까운 것을 골랐다.
       허용 범위가 제곱도 4 = 약 200km 라, 인천·수원·춘천·대전에 있어도
       전부 "서울"로 나왔다. 실제로 그 신고를 받았다 —
       "지금 위치가 서울이 아닌데 서울로 나오고 있고".

       우리는 이미 제대로 된 역지오코딩을 갖고 있었다(place.js, 탭한 지점에 쓰던 것).
       그걸 쓰지 않고 목록을 들고 있었던 게 문제였다. */
    try {
      const { lookupPlace } = await import('./place.js');
      /* BigDataCloud 무료 조건은 동의받은 기기의 현재 위치만 허용한다.
         지도에서 탭한 임의 좌표는 lookupPlace 기본값인 오프라인 지명표를 쓴다. */
      const p = await lookupPlace(lat, lon, { deviceCurrent: true });
      if (p && !p.isOcean) {
        // 시·군·구가 있으면 그것, 없으면 시도, 그것도 없으면 나라
        this.place.name = p.city || p.region || p.country;
        this.render();
        return;
      }
      if (p?.isOcean) {
        this.place.name = i18n.lang === 'ko' ? '바다 위' : 'At sea';
        this.render();
        return;
      }
    } catch (_) { /* 아래 좌표 표기로 내려간다 */ }
    // ⚠️ 못 알아내면 **좌표를 그대로** 적는다. 엉뚱한 도시 이름을 지어내지 않는다.
    this.place.name = `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
    this.render();
  },

  tick() {
    const d = new Date();
    let h = d.getHours();
    const ko = i18n.lang === 'ko';
    const ap = ko ? (h < 12 ? '오전' : '오후') : (h < 12 ? 'AM' : 'PM');
    const h12 = h % 12 || 12;
    $('#ampm').textContent = ap;
    $('#hhmm').textContent = `${h12}:${String(d.getMinutes()).padStart(2, '0')}`;
    $('#ambDate').textContent = ko
      ? `${d.getMonth() + 1}월 ${d.getDate()}일 ${'일월화수목금토'[d.getDay()]}요일`
      : d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', weekday: 'long' });
  },

  async loadWeather() {
    try {
      this.wx = await fetchWeather(this.place.lat, this.place.lon);
      this.render();
    } catch (e) { console.warn('[chrome wx]', e.message); }
  },

  render() {
    const ko = i18n.lang === 'ko';
    const el0 = $('#ambCity');
    el0.textContent = this.place.name || (this.isDefault ? this.defaultName : '—');
    /* 기본 위치일 때만 꼬리표를 붙인다 — 내 위치일 때는 붙일 이유가 없다 */
    if (this.isDefault) {
      const tag = document.createElement('span');
      tag.className = 'amb-default';
      tag.textContent = ko ? '기본 위치' : 'default location';
      el0.appendChild(tag);
    }
    if (!this.wx) return;
    const c = this.wx.current, d = this.wx.daily;
    $('#ambCond').textContent = wxText(c.weather_code);
    $('#ambTemp').textContent = i18n.temp(c.temperature_2m);
    const hi = i18n.t.lang === 'en' ? 'H' : '최고';
    $('#ambHi').textContent = `${i18n.lang === 'ko' ? '최고' : 'H'} ${i18n.temp(d.temperature_2m_max[0])}`;
    $('#ambLo').textContent = `${i18n.lang === 'ko' ? '최저' : 'L'} ${i18n.temp(d.temperature_2m_min[0])}`;
  },
};

/* ══════════════════════════════════════════════════════════════
   Explore — 레이어 칩
   ══════════════════════════════════════════════════════════════ */
export const chips = {
  init() {
    this.render();
    store.on('tier', () => this.render());
    store.on('layer', () => this.sync());
    i18n.onChange(() => this.render());
  },

  render() {
    const wrap = $('#chips');
    wrap.innerHTML = '';
    const groups = {};
    LAYER_DEFS.forEach(d => { (groups[d.group] ||= []).push(d); });

    Object.entries(groups).forEach(([g, defs]) => {
      defs.forEach(d => {
        const b = el('button', 'chip');
        b.dataset.id = d.id;
        b.textContent = i18n.t.L[d.id] || d.id;

        if (d.blocked) {
          b.classList.add('blocked');
          b.title = d.blocked === 'proxy' ? i18n.t.blockedProxy
            : d.blocked === 'auth' ? i18n.t.blockedAuth : i18n.t.blockedPaid;
          b.onclick = () => toast(b.title);
        } else if (d.tier === TIER.PAID && !store.isPaid()) {
          b.classList.add('locked');
          b.title = i18n.t.locked;
          b.onclick = () => toast(i18n.t.unlock);
        } else {
          if (d.tier === TIER.PAID) b.classList.add('paid');
          b.classList.toggle('on', store.isOn(d.id));
          b.onclick = () => store.toggle(d.id);
        }
        wrap.appendChild(b);
      });
    });
  },

  sync() {
    document.querySelectorAll('#chips .chip').forEach(b => {
      const d = LAYER_DEFS.find(x => x.id === b.dataset.id);
      if (d && !d.blocked && (d.tier === TIER.FREE || store.isPaid())) {
        b.classList.toggle('on', store.isOn(d.id));
      }
    });
  },
};

/* ══════════════════════════════════════════════════════════════
   정보 시트
   ══════════════════════════════════════════════════════════════ */
export const sheet = {
  init() {
    $('#sheetClose').onclick = () => this.close();
    /* ⚠️ "내리기"와 "닫기"는 다르다.
       닫기  → 선택 해제. 위성 궤적·태풍 진로도 같이 사라진다.
       내리기 → 창만 내리고 선택은 유지. 궤적을 보려고 창을 치우는 경우가 이것이다.
       처음엔 닫기만 있어서, 궤적을 보려고 × 를 누르면 궤적까지 사라졌다. */
    $('#sheetMin').onclick = () => this.minimize();
    store.on('select', m => m ? this.open(m) : this.close());
  },

  minimize() {
    const box = $('#sheet');
    box.classList.add('down');
    // 다시 올릴 방법을 남긴다 — 안 그러면 정보를 못 되찾는다
    showRestore(() => { box.classList.remove('down'); });
  },

  async open(m) {
    const box = $('#sheet');
    $('#sheetKind').textContent = i18n.t.L[m.kind] || i18n.t.L[m._layerId] || m.kind;
    $('#sheetKind').className = 'kind' + (m.kind === 'quake' ? ' evt' : '');
    $('#sheetTitle').textContent = m.name;

    const rows = $('#sheetRows');
    rows.innerHTML = '';

    /* ⚠️ 시트는 위성·지진·발사·지점날씨를 모두 재사용한다.
       강수확률 막대를 지우지 않으면 위성 정보를 보는데 이전 지점의
       시간별 강수확률이 그대로 남는다 (실제로 그랬다).
       채우는 쪽은 지점 날씨 분기 하나뿐이므로, 열 때마다 먼저 치운다. */
    clearRainBars();
    clearDynamic();

    // 이벤트 뉴스 → 신뢰도와 원문 링크 (§5-3: 본문 재현 금지, 링크만)
    if (m.kind === 'newsevent' && m._ev) {
      const { events } = await import('./layers/events.js');
      clearForecast();
      const ko2 = i18n.lang === 'ko';
      const d = events.detail(m._ev);
      /* 시트 제목을 분류(「강압 조치」)에서 실제 기사 제목으로 바꾼다.
         ⚠️ 분류만 크게 띄우면 "무슨 일이 났는지"를 알 수 없다는 지적을 받았다. */
      $('#sheetTitle').textContent = m._ev.title || d.title;
      // 제목을 읽는 사람 언어로 바꾼다 (원문은 바로 아래 작게 남긴다)
      if (m._ev.title) localizeTitle(m._ev.title, $('#sheetTitle'));
      $('#sheetKind').textContent = m._ev.status === 'confirmed'
        ? (ko2 ? '검증된 이벤트' : 'Verified event') : (ko2 ? '미확정 이벤트' : 'Unconfirmed');
      $('#sheetKind').className = 'kind' + (m._ev.status === 'confirmed' ? ' evt' : '');
      Object.entries(d.rows).forEach(([k, v]) => addRow(rows, k, v));

      /* AI 브리핑이 있으면 시트 안에서도 볼 수 있게 한다.
         ⚠️ 이벤트 메뉴에서만 보이게 두면, 지구를 눌러서 온 사람은
            브리핑이 있는 줄도 모른다. 같은 사건이면 어디서 들어와도 같은 걸 봐야 한다. */
      try {
        const { briefs } = await import('./brief.js');
        if (!briefs.loaded) await briefs.load();
        const b = m._brief || briefs.forEvent(m._ev.id);
        if (b) {
          const { briefCard } = await import('./ui-brief.js');
          const wrap = document.createElement('div');
          wrap.className = 'ctx-block bf-in-sheet';
          wrap.appendChild(briefCard(b, { compact: true }));
          rows.parentElement.insertBefore(wrap, rows.nextSibling);
        }
      } catch (e) {
        console.warn('[brief]', e.message);   // 없으면 그냥 없이 보여준다
      }

      renderEventSources(m._ev, rows);
      box.classList.remove('down'); box.classList.add('up');
      return;
    }

    /* 쓰나미 → 등급·구역·원문.
       ⚠️ 다른 시트와 달리 여기엔 우리 해석을 한 줄도 넣지 않는다.
          기관 발표를 그대로 옮기고 원문으로 보낸다. */
    if (m.kind === 'tsunami' && m._ts) {
      const { tsunami } = await import('./layers/tsunami.js');
      clearForecast();
      const d = tsunami.detail(m._ts);
      $('#sheetTitle').textContent = d.title;
      $('#sheetKind').textContent = i18n.lang === 'ko' ? '긴급' : 'Emergency';
      $('#sheetKind').className = 'kind evt';
      Object.entries(d.rows).forEach(([k, v]) => {
        if (k.startsWith('_') || v == null) return;
        if (typeof v === 'string' && v.startsWith('http')) {
          addRow(rows, k, `<a href="${v}" target="_blank" rel="noopener">NWS ↗</a>`, true);
        } else addRow(rows, k, v);
      });
      if (d.rows._note) rows.parentElement.appendChild(noteEl(d.rows._note));
      rows.parentElement.appendChild(safetyActions({ lat: m.lat, lon: m.lon }));
      box.classList.remove('down'); box.classList.add('up');
      return;
    }

    // 발사대 → 그 자리에서 뜨는 발사들
    if (m.kind === 'launchpad' && m._pad) {
      const { launchPads } = await import('./layers/launchpad.js');
      clearForecast();
      const d = launchPads.detail(m._pad);
      $('#sheetTitle').textContent = d.title;
      $('#sheetKind').textContent = i18n.lang === 'ko' ? '발사대' : 'Launch pad';
      $('#sheetKind').className = 'kind';
      Object.entries(d.rows).forEach(([k, v]) => {
        if (k.startsWith('_') || v == null) return;
        addRow(rows, k, v);
      });
      if (d.rows._note) rows.parentElement.appendChild(noteEl(d.rows._note));
      box.classList.remove('down'); box.classList.add('up');
      return;
    }

    // 일식 식심 지점 → 상세 + NASA 지도
    if (m.kind === 'eclipse' && m._ecl) {
      const { ECLIPSE_TYPE, nasaLink } = await import('./sky.js');
      clearForecast();
      const e = m._ecl, ko3 = i18n.lang === 'ko';
      const T = ECLIPSE_TYPE[e.type];
      const at = new Date(e.date);
      $('#sheetTitle').textContent = ko3 ? T.ko : `${T.en} solar eclipse`;
      $('#sheetKind').textContent = ko3 ? '천문' : 'Astronomy';
      $('#sheetKind').className = 'kind';
      addRow(rows, ko3 ? '식심 시각' : 'Greatest eclipse',
        at.toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
      /* ⚠️ 좌표만 적어두면 "거기로 가라"로 읽힌다. 바다면 바다라고 먼저 말한다. */
      addRow(rows, ko3 ? '식심 위치 (관측지 아님)' : 'Greatest point (not a viewing site)',
        fmtCoord(e.lat, e.lon));
      if (e.central) addRow(rows, ko3 ? '⭐ 개기식을 볼 수 있는 곳' : '⭐ Where totality passes',
        e.central);
      addRow(rows, ko3 ? '식분' : 'Magnitude', e.mag.toFixed(3));
      if (e.dur) addRow(rows, ko3 ? '최대 지속' : 'Max duration', e.dur);
      if (e.width) addRow(rows, ko3 ? '중심대 폭' : 'Path width', `${e.width} km`);
      addRow(rows, ko3 ? '부분식 지역' : 'Partial from', e.see);
      addRow(rows, ko3 ? '상세 지도' : 'Detail map',
        `<a href="${nasaLink({ ...e, kind: 'solar' })}" target="_blank" rel="noopener">NASA ↗</a>`, true);
      rows.parentElement.appendChild(noteEl(ko3
        ? '지도의 점은 **관측 장소가 아닙니다.** 달그림자 중심이 지구에 가장 가깝게 스치는 순간의 좌표(식심)이며, 대개 바다 한가운데입니다. 실제로 개기식을 보려면 위의 「개기식을 볼 수 있는 곳」으로 가야 합니다. 개기대(띠)는 그리지 않습니다 — 좌표 자료가 없어 원으로 대신하면 실제와 다르게 읽힙니다. 내 위치에서의 시각은 NASA 지도에서 확인하세요. 자료: NASA GSFC 5천년 일식 목록.'
        : 'The marker is the single greatest-eclipse point. The path of totality is not drawn — approximating it with a circle would misrepresent it. Check the NASA map for your location. Source: NASA GSFC Five Millennium Canon.'));
      rows.parentElement.appendChild(el('p', 'sheet-note', ko3
        ? '⚠️ 부분식 단계에서는 반드시 인증된 일식 안경(ISO 12312-2)을 쓰세요. 선글라스로는 안 됩니다.'
        : '⚠️ Use certified eclipse glasses (ISO 12312-2) during partial phases. Sunglasses are not enough.'));
      box.classList.remove('down'); box.classList.add('up');
      return;
    }

    // 태풍 → 진로 + 상세
    if (m.kind === 'cyclone' && m._tc) {
      const { cyclones } = await import('./layers/cyclone.js');
      clearForecast();
      const d = cyclones.detail(m._tc);
      $('#sheetTitle').textContent = d.title;
      $('#sheetKind').textContent = i18n.lang === 'ko' ? '태풍' : 'Tropical cyclone';
      $('#sheetKind').className = 'kind evt';
      Object.entries(d.rows).forEach(([k, v]) => {
        if (k.startsWith('_') || v == null) return;
        if (typeof v === 'string' && v.startsWith('http')) {
          addRow(rows, k, `<a href="${v}" target="_blank" rel="noopener">GDACS ↗</a>`, true);
        } else addRow(rows, k, v);
      });
      if (d.rows._note) rows.parentElement.appendChild(noteEl(d.rows._note));

      /* ── 경로 로딩 표시 ──
         받은 지적: "일단 느리게 뜨니 로딩바 만들어주고".
         GDACS 응답을 최대 12초 기다린다 — 그동안 아무 표시가 없으면
         고장으로 읽힌다. 다 그려지면 걷는다. */
      const tcLd = noteEl(i18n.lang === 'ko'
        ? '⏳ 진로·예보선 불러오는 중…' : '⏳ Loading track & forecasts…');
      tcLd.classList.add('tc-ld');
      rows.parentElement.appendChild(tcLd);

      /* 정보창 보강 — 도움 화면·원리 설명·소식·공식 링크 */
      try {
        const { renderCycloneExtras } = await import('./ui-cyclone.js');
        renderCycloneExtras(rows.parentElement, m._tc);
      } catch (_) { /* 보강이 실패해도 기본 상세는 떠야 한다 */ }
      rows.parentElement.appendChild(safetyActions({ lat: m.lat, lon: m.lon }));

      box.classList.add('up');
      // 진로는 선택했을 때만 불러 그린다 (전부 미리 받으면 요청이 낭비된다)
      cyclones.showTrack(m._tc).finally(() => tcLd.remove());
      return;
    }

    // 위성 → satcat 상세 (용도·운용·제작·궤도)
    if (m.kind === 'satellite' && m._satIdx != null) {
      const { orbits } = await import('./layers/space.js');
      const d = orbits.detail(m._satIdx, i18n.lang);
      // 궤도 추적선은 유료 기능 — 위성 위치 자체는 무료로 보인다
      if (store.can(PAID_CAP.SAT_DEEP)) orbits.showTrack(m._satIdx);
      clearForecast();
      if (d) {
        $('#sheetTitle').textContent = d.title;
        renderSatImage(orbits.sats[m._satIdx], rows);
        $('#sheetKind').textContent = i18n.lang === 'ko' ? '위성' : 'Satellite';
        Object.entries(d.rows).forEach(([k, v]) => {
          if (k.startsWith('_') || v == null) return;
          addRow(rows, k, v);
        });
        if (d.rows._note) {
          const p = noteEl(d.rows._note);
          rows.parentElement.appendChild(p);
        }
        /* 내 위치 통과 예보는 유료 기능이다.
           ⚠️ 사용자 좌표마다 SGP4 를 수백 번 돌려야 나오는 값이라
              "데이터를 가둔 것"이 아니라 실제로 계산이 드는 것이다. */
        if (store.can(PAID_CAP.PASSES)) renderPasses(orbits.sats[m._satIdx], rows);
        else renderPaidHint(rows, PAID_CAP.PASSES);
      }
      box.classList.remove('down');
      box.classList.add('up');
      return;
    }

    // 관측소/좌표 → Open-Meteo 실시간 조회
    if (m.data && m.data._lazy) {
      rows.innerHTML = `<dt>—</dt><dd>${i18n.t.loading}</dd>`;
      box.classList.remove('down');
      box.classList.add('up');
      const ko = i18n.lang === 'ko';
      try {
        // 날씨·장소·파도를 한꺼번에. 파도는 바다일 때만 값이 온다.
        const [w, pl, sea] = await Promise.all([
          fetchWeather(m.lat, m.lon),
          lookupPlace(m.lat, m.lon),
          lookupWaves(m.lat, m.lon),
        ]);
        const c = w.current, F = i18n.t.F;
        rows.innerHTML = '';

        // ── 어디인가 ──
        if (pl?.country) {
          $('#sheetTitle').textContent = pl.detail || pl.country;
          addRow(rows, ko ? '국가' : 'Country', pl.country);
          if (pl.region && pl.region !== pl.city) addRow(rows, ko ? '지역' : 'Region', pl.region);
        } else {
          $('#sheetTitle').textContent = ko ? '바다' : 'Open sea';
        }
        addRow(rows, ko ? '좌표' : 'Coordinates', fmtCoord(m.lat, m.lon));

        // ── 날씨 ──
        $('#sheetKind').textContent = wxText(c.weather_code);
        addRow(rows, F.temp, i18n.temp(c.temperature_2m, 1));
        addRow(rows, F.feelsLike, i18n.temp(c.apparent_temperature, 1));
        addRow(rows, F.humidity, `${c.relative_humidity_2m}%`);
        addRow(rows, F.wind, `${c.wind_speed_10m} km/h ${compass(c.wind_direction_10m)}`);
        addRow(rows, F.pressure, `${Math.round(c.surface_pressure)} hPa`);

        // 강수는 "확률"로 말한다. 단정하면 안 틀릴 수가 없다.
        const pp = w.hourly?.precipitation_probability?.[0];
        if (pp != null) addRow(rows, ko ? '강수확률' : 'Chance of rain', `${pp}%`);
        addRow(rows, F.precip, `${c.precipitation} mm`);

        // ── 바다면 파도 ──
        if (sea) {
          addRow(rows, ko ? '파고' : 'Wave height',
            `${sea.wave_height} m · ${seaState(sea.wave_height)}`);
          addRow(rows, ko ? '파향' : 'Wave direction',
            `${compass(sea.wave_direction)} (${sea.wave_direction}°)`);
          addRow(rows, ko ? '파주기' : 'Wave period', `${sea.wave_period} s`);
          if (sea.swell_wave_height != null)
            addRow(rows, ko ? '너울' : 'Swell',
              `${sea.swell_wave_height} m ${compass(sea.swell_wave_direction)}`);
        }

        /* 열돔·환류 안을 눌러 들어온 경우 — 그 현상을 배경 설명으로 붙인다.
           "이 도시가 지금 열돔 안에 있다"가 한 화면에서 읽혀야 한다. */
        if (m._ctx) renderContext(m._ctx, rows);
        /* 더울 때만 이 지점의 열돔 여부를 직접 판정한다.
           ⚠️ 설명글과 지도가 다른 계산을 보면 안 된다 —
              "열돔이라는데 지도엔 없다"는 지적을 받은 지점이다.
              판정이 참이면 phenomena 가 지도에도 같이 그린다. */
        if (!m._ctx && c.temperature_2m >= 26) renderHeatCheck(m, rows);

        renderForecast(w);
        renderRainBars(w);
      } catch (e) {
        rows.innerHTML = `<dt>—</dt><dd>${e.message}</dd>`;
      }
      return;
    }

    clearForecast();
    /* ⚠️ 열돔·환류처럼 "현상"만 보여주던 항목에 위치를 붙인다.
       무슨 현상인지는 알겠는데 어디인지 모르면 쓸모가 반이다.
       (열돔 정보만 나오고 도시가 안 나온다는 지적을 받았다) */
    if (m._place && m.lat != null) renderPlaceLine(m, rows);
    // 공식 기관 링크 (§5-4: 자연재난은 기관 화이트리스트 수동 큐레이션)
    if (m.kind === 'volcano' || m.kind === 'quake') renderOfficial(m, rows);
    // 분화 중인 화산이면 담당 기관 라이브를 시트 안에서 바로 (§5-4 화이트리스트)
    if (m.kind === 'volcano' && m.data?._currentEruption === true) {
      renderAgencyLive(m.name, rows);
    }
    // 산불 — 위성 열점의 한계를 반드시 함께 알린다
    /* 부이 → 실제 카메라 사진 + 무엇을 하는 곳인지
       ⚠️ NDBC 의 buoycam.php 는 최신 사진 한 장을 직접 준다 (image/jpeg, 안정적인 주소).
          실측: 41001 호에서 6방향 파노라마(2880×300)를 받았고, 사진 아래에
          관측소 번호와 촬영 시각이 새겨져 있다.
       ⚠️ 카메라가 없는 부이도 있다. 그럴 때 대체 사진을 넣지 않고 **감춘다** —
          다른 부이 사진을 보여주면 그 부이를 찍은 것처럼 읽힌다.
       ⚠️ 사진은 <img> 로 브라우저가 직접 받는다. 이미지 표시에는 CORS 가 필요 없어
          프록시를 거치지 않는다 (Function URL 이 막힌 것과 무관하게 동작한다). */
    if (m.kind === 'buoy' && m._buoyId) {
      renderBuoyModel(m, rows);
      renderBuoyCam(m, rows);
    }

    /* 지상 관측소 — 부이의 육지판. 5일치 그래프와 주변 사진을 붙인다.
       ⚠️ 비동기라 시트가 먼저 뜨고 내용이 나중에 채워진다. 그게 맞다 —
          사진·과거자료를 기다리느라 실황이 늦게 뜨면 안 된다. */
    if (m.kind === 'landobs' && m._station) {
      import('./ui-station.js').then(({ stationSheet }) => {
        stationSheet.render(rows.parentNode || rows, m._station);
      }).catch(e => console.warn('[station]', e.message));
    }
    /* 기상청 ASOS 지도 라벨 → 내 관측소.
       ⚠️ 상세에서 본 지점과 station.html 기본값이 달랐던 단절을 URL id로 잇는다.
          저장은 station.html에서 사용자가 다시 눌러야 한다 — 자동 저장하지 않는다. */
    if (m.kind === 'landobs' && m._stationId) {
      const a = el('a', 'sheet-cta', i18n.lang === 'ko'
        ? '이 지점을 내 관측소로 열기 ↗' : 'Open as My station ↗');
      a.href = `/station.html?station=${encodeURIComponent(m._stationId)}`;
      a.target = '_blank'; a.rel = 'noopener';
      rows.parentElement.appendChild(a);
    }

    if (m.kind === 'wildfire') {
      renderFireView(m, rows);
      import('./layers/wildfire.js').then(({ wildfires }) => {
        const p = el('p', 'sheet-note', wildfires.note());
        p.style.whiteSpace = 'pre-line';
        rows.parentElement.appendChild(p);
      });
    }
    // 일본 지진이면 기관 대조 결과 (USGS vs 일본 기상청)
    if (m.kind === 'quake' && m.data?._jma) renderAgencyCheck(m.data._jma, rows);
    // 지진이면 단층 메커니즘을 덧붙인다 (큰 지진에만 자료가 있다)
    if (m.kind === 'quake' && m.data?._detail) renderFault(m.data._detail, rows);
    Object.entries(m.data || {}).forEach(([k, v]) => {
      if (k.startsWith('_')) return;
      if (typeof v === 'string' && v.startsWith('http')) {
        const a = `<a href="${v}" target="_blank" rel="noopener">${i18n.t.F.watch} ↗</a>`;
        addRow(rows, k, a, true);
      } else addRow(rows, k, v);
    });

    if (['quake', 'volcano', 'wildfire'].includes(m.kind)) {
      rows.parentElement.appendChild(safetyActions({ lat: m.lat, lon: m.lon }));
    }

    // 예약/예매 연결 지점 (§4-8) — 제휴 계정 필요
    if (m.data?._booking) {
      const btn = el('button', 'sheet-cta', i18n.lang === 'ko' ? '예매 알아보기' : 'Find tickets');
      btn.onclick = () => toast(i18n.lang === 'ko'
        ? '제휴 링크 연결 예정 (Klook / GetYourGuide)'
        : 'Affiliate link pending (Klook / GetYourGuide)');
      rows.parentElement.appendChild(btn);
    }
    box.classList.add('up');
  },

  close() {
    hideRestore();
    $('#sheet').classList.remove('down');
    /* ⚠️ 태풍 진로선은 창을 닫아도 **지우지 않는다.**
       받은 지적: "인포창 끄니깐 미국꺼 라인이 사라지네?" — 창을 닫는 건
       글을 치우려는 것이지 지도를 치우려는 게 아니다. 선은
       ① 태풍 밖을 탭하거나 ② 다른 것을 선택하거나 ③ 태풍 레이어를 끄면
       접힌다 (①은 이미 "다른 거 보려니깐" 지적으로 만든 동작이다). */
    import('./layers/space.js').then(({ orbits }) => orbits.clearTrack()).catch(() => {}); $('#sheet').classList.remove('up'); clearForecast(); },
};

/* 긴 값은 몇 자부터 한 칸으로 펴는가.
   ⚠️ 받은 신고(스크린샷): 좌우 2칸이라 오른쪽 칸이 좁아 **글자가 찌그러졌다.**
      태풍 예보 서술처럼 문장이 긴 값은 라벨 아래로 내려 폭을 다 쓰는 게 맞다. */
const WIDE_AT = 46;

/* **굵게** 를 실제 굵은 글씨로.
   ⚠️⚠️ **먼저 이스케이프하고 나서** 표시를 푼다. 값에는 기관이 준 문자열
      (지명·기사 제목 등)이 섞여 있어서, 그대로 innerHTML 에 넣으면 주입이 된다.
   ⚠️ 예전에는 textContent 로만 넣어서 화면에 "**+117시간**" 이 글자 그대로 보였다. */
function mdBold(t) {
  return String(t)
    .replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}

/** 안내문 — ** 를 굵게 살린다 (mdBold 가 이스케이프한다) */
function noteEl(text) {
  const p = el('p', 'sheet-note');
  p.innerHTML = mdBold(text);
  return p;
}

function addRow(dl, k, v, html = false) {
  const dt = el('dt', null, k);
  const dd = el('dd');
  if (html) {
    dd.innerHTML = v;
  } else {
    const t = String(v ?? '');
    // ⚠️ 굵게 표시가 있거나 길면 innerHTML 경로로 간다 (mdBold 가 이스케이프한다)
    if (/\*\*/.test(t)) dd.innerHTML = mdBold(t);
    else dd.textContent = t;
    if (t.length >= WIDE_AT || /\*\*/.test(t)) {
      dt.classList.add('wide');
      dd.classList.add('wide');
    }
  }
  dl.append(dt, dd);
}
function renderForecast(w) {
  const box = $('#forecast');
  box.innerHTML = '';
  const d = w.daily;
  for (let i = 0; i < Math.min(7, d.time.length); i++) {
    const day = el('div', 'fc-day');
    const dt = new Date(d.time[i]);
    day.append(
      el('span', 'fc-name', i === 0
        ? (i18n.lang === 'ko' ? '오늘' : 'Today')
        : dt.toLocaleDateString(i18n.lang, { weekday: 'short' })),
      el('span', 'fc-hi', i18n.temp(d.temperature_2m_max[i])),
      el('span', 'fc-lo', i18n.temp(d.temperature_2m_min[i])),
    );
    box.appendChild(day);
  }
  box.style.display = 'flex';
}
/* 이벤트 원문 링크 (§5-3)
   ⚠️ 원문 본문을 가져오지 않는다 — 저작권이다. 제목도 우리가 만들지 않는다.
      링크만 나열하고 판단은 사용자에게 맡긴다.
   ⚠️ 미확정이면 그렇다고 크게 적는다. 아직 교차검증이 안 된 자동 수집 결과다. */
/**
 * 제목을 읽는 사람 언어로 바꿔 제자리에 넣는다.
 *
 * ⚠️ 하단에 번역 블록을 따로 달지 않는다. 제목이 제목 자리에 있어야
 *    "무슨 일이 났는지"가 첫 줄에서 읽힌다 (지적받은 부분이다).
 *
 * ⚠️ 그렇다고 원문을 지우지도 않는다. 기계 번역은 고유명사에서 특히 틀린다 —
 *    "Tisha B'Av" 를 "티샤 브아브 관찰" 로 옮긴 걸 실제로 확인했다(원래 뜻은 유대 금식일).
 *    번역을 제목으로 올리고, 원문을 그 아래 작게 붙여 확인할 수 있게 한다.
 *
 * 이미 읽는 사람 언어면 아무것도 하지 않는다. 번역 요청도 보내지 않는다.
 */
async function localizeTitle(title, titleEl) {
  const { detectLang, translator } = await import('./translate.js');
  if (detectLang(title) === i18n.lang) return;
  const out = await translator.to(title, i18n.lang);
  // 실패하면 원문을 그대로 둔다 — 빈 제목이나 "번역 실패"를 제목에 넣지 않는다
  if (!out || !titleEl.isConnected) return;
  titleEl.textContent = out.text;
  const orig = el('div', 'title-orig');
  orig.innerHTML = `<span class="to-tag">${i18n.lang === 'ko' ? '원문' : 'original'}</span>`
    + esc(title);
  titleEl.insertAdjacentElement('afterend', orig);
}

function renderEventSources(e, rows) {
  const ko = i18n.lang === 'ko';
  const box = el('div', 'evsrc');
  /* ⚠️ 도메인 기준으로 중복을 없앤다.
     같은 매체 링크가 3개 나란히 있으면 "3곳이 확인했다"로 읽힌다 —
     실제로 americanthinker.com 이 3번 나온 화면을 확인했다.
     교차검증을 보여주는 자리에서 그건 거짓 신호다.
     (이벤트 패널은 먼저 고쳤는데 이 시트를 빠뜨렸다) */
  const byHost = new Map();
  [e.url, ...(e.alt || [])].filter(Boolean).forEach(u => {
    let h = u; try { h = new URL(u).hostname.replace(/^www\./, ''); } catch (_) {}
    if (!byHost.has(h)) byHost.set(h, u);
  });
  const urls = [...byHost.values()].slice(0, 5);

  let html = '';
  if (e.status !== 'confirmed') {
    html += `<div class="ev-warn">${ko
      ? '아직 교차검증이 충분하지 않은 자동 수집 결과입니다. 사실 여부가 확인되지 않았습니다.'
      : 'Automatically collected and not yet cross-verified. Treat as unconfirmed.'}</div>`;
  }
  html += `<div class="of-t">${ko
        ? `원문 보도 · 서로 다른 매체 ${byHost.size}곳`
        : `Source reports · ${byHost.size} distinct outlet(s)`}</div>`
       + urls.map(u => {
           let host = u; try { host = new URL(u).hostname.replace(/^www\./, ''); } catch (_) {}
           return `<a class="of-row" href="${u}" target="_blank" rel="noopener">
             <span class="of-l">${host}</span><span class="of-x">↗</span></a>`;
         }).join('')
       + (byHost.size === 1 && e.sources >= 10
           ? `<div class="ev-syndicate">${ko
               ? `⚠️ 보도 문서는 ${e.sources.toLocaleString()}건이지만 수집된 링크는 한 매체뿐입니다. 같은 기사가 여러 곳에 재게재된 경우로 보입니다 — 문서 수가 많다는 것이 독립적 교차검증을 뜻하지는 않습니다.`
               : `⚠️ ${e.sources.toLocaleString()} documents but only one distinct outlet — likely one story syndicated. A high count is not independent verification.`}</div>`
           : '')
       + `<div class="of-note">${ko
           ? 'GDELT 가 자동 수집한 보도입니다. 저작권상 본문은 싣지 않고 원문으로 연결합니다.'
           : 'Collected automatically by GDELT. Full text is not reproduced — links only.'}</div>`;
  box.innerHTML = html;
  rows.parentElement.appendChild(box);
}

/* 라이브 영상 — 시트 안에서 바로 재생 */
async function renderLive(url, label, rows) {
  const { makeLiveBlock } = await import('./livevideo.js');
  const b = makeLiveBlock(url, label);
  if (b) rows.parentElement.insertBefore(b, rows);
}

/* 분화 중인 화산 → 담당 기관의 라이브.
   ⚠️ 기관 채널 주소는 "지금 방송 중"을 보장하지 못한다.
      임베드해서 빈 화면이 뜨면 앱을 못 믿게 되므로, 특정 영상 URL 이 있을 때만 임베드하고
      채널 주소는 링크로 둔다 (livevideo.js 가 알아서 판단한다). */
async function renderAgencyLive(name, rows) {
  const { agencyLive } = await import('./official.js');
  const live = agencyLive(name);
  if (!live) return;
  const { makeLiveBlock } = await import('./livevideo.js');
  const b = makeLiveBlock(live.url, live.label);
  if (b) rows.parentElement.insertBefore(b, rows);
}

/* 공식 기관 링크 — 인수인계 §5-3, §5-4 를 따른다.
   ⚠️ 뉴스 본문을 가져오지 않는다 (저작권). 특정 매체를 골라 임베드하지도 않는다
      ("공식 중계"처럼 오인될 위험). 담당 정부·연구기관만 링크한다. */
async function renderOfficial(m, rows) {
  const ko = i18n.lang === 'ko';
  const { volcanoLinks, quakeLinks } = await import('./official.js');
  const links = m.kind === 'volcano'
    ? volcanoLinks(m.name)
    : quakeLinks(m.data?._url, m.lat, m.lon);
  if (!links.length) return;

  const box = el('div', 'official');
  box.innerHTML = `<div class="of-t">${ko ? '공식 정보' : 'Official sources'}</div>`
    + links.map(l => `<a class="of-row" href="${l.url}" target="_blank" rel="noopener">
        <span class="of-l">${l.label}</span>
        <span class="of-n">${l.note}</span>
        <span class="of-x">↗</span>
      </a>`).join('')
    + `<div class="of-note">${ko
        ? '담당 기관 공식 페이지로 연결됩니다. 라이브 방송이 있으면 해당 채널에서 바로 볼 수 있습니다.'
        : 'Links go to the responsible agencies. Live streams, if any, appear on their channels.'}</div>`;
  rows.parentElement.appendChild(box);
}

/* 기관 대조 — 같은 지진을 두 기관이 어떻게 보고했는지 나란히 보여준다.
   ⚠️ 차이를 감추지 않는다. 하나로 뭉개면 "우리가 정한 값"이 되어버린다.
      두 기관 값을 그대로 보여주고, 왜 다른지도 말한다. */
/* 산불 위성 영상 — NASA Worldview 스냅샷
   ⚠️ 지도에 점만 찍으면 "얼마나 큰 불인가"가 안 보인다. 위성 영상에는
      연기 기둥이 그대로 찍혀서 어디로 번지고 있는지가 눈에 들어온다.
   ⚠️ 이미지라 CORS 가 필요 없다 — 프록시를 거치지 않는다.
   ⚠️ 당일 영상은 아직 안 올라왔을 수 있다 (실측: 당일 14KB 빈 영상 /
      전날 81KB 실제 영상). 그래서 **FIRMS 가 알려준 관측 날짜**를 쓴다.
      우리가 날짜를 지어내지 않고, 위성이 실제로 본 날을 그대로 쓴다. */
const WV = 'https://wvs.earthdata.nasa.gov/api/v1/snapshot';

function fireSnapshotUrl(lat, lon, date, deg = 1.6, px = 900) {
  const bbox = [
    Math.max(-90, lat - deg), lon - deg,
    Math.min(90, lat + deg), lon + deg,
  ].map(v => v.toFixed(3)).join(',');
  const q = new URLSearchParams({
    REQUEST: 'GetSnapshot',
    /* 트루컬러 + 열이상(붉은 점). 두 겹을 함께 그려야 "연기와 불"이 같이 보인다. */
    LAYERS: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor,VIIRS_NOAA20_Thermal_Anomalies_375m_All',
    CRS: 'EPSG:4326', TIME: date, BBOX: bbox,
    FORMAT: 'image/jpeg', WIDTH: String(px), HEIGHT: String(px),
  });
  return `${WV}?${q}`;
}

/* 이 영역에 실제 영상이 있는 날짜를 고른다 (요청 날짜부터 뒤로 최대 3일).
   ⚠️ 900px 스냅샷에서 자료가 없으면 15KB 안팎, 있으면 80KB 이상이었다(실측).
      경계를 넉넉히 30KB 로 둔다. */
const FIRE_IMG_MIN_BYTES = 30_000;

async function pickFireDate(lat, lon, from) {
  const d0 = new Date(`${from}T00:00:00Z`);
  if (Number.isNaN(d0.getTime())) return { day: from, bytes: null };
  for (let back = 0; back < 3; back++) {
    const d = new Date(d0.getTime() - back * 86400e3);
    const day = d.toISOString().slice(0, 10);
    try {
      /* 날짜 후보 하나가 무응답이어도 산불 시트 전체를 붙들지 않는다. */
      const res = await fetchT(fireSnapshotUrl(lat, lon, day),
        { method: 'HEAD', timeout: 8_000 });
      const n = Number(res.headers.get('Content-Length') || 0);
      if (res.ok && n >= FIRE_IMG_MIN_BYTES) return { day, bytes: n };
    } catch (_) { /* 네트워크 실패는 다음 날짜로 */ }
  }
  return { day: null, bytes: 0 };
}

/** 산불 → 위성 영상 + 주변 뉴스 */
function renderFireView(m, rows) {
  const ko = i18n.lang === 'ko';
  const box = el('div', 'ctx-block fire-view');

  /* ── 위성 영상 ── */
  const date = m.data?._date || m._date;
  if (date && m.lat != null) {
    const img = document.createElement('img');
    img.className = 'fv-img';
    img.alt = ko ? '이 산불 주변 위성 영상' : 'Satellite view of this fire';
    const cap = el('div', 'bc-cap', ko ? '위성 영상을 찾는 중…' : 'Finding satellite imagery…');
    const a = document.createElement('a');
    a.className = 'bc-link';
    a.target = '_blank'; a.rel = 'noopener';
    box.append(img, cap, a);

    /* ⚠️ 당일 영상은 아직 합성이 안 끝났을 수 있다.
       실측(오리건, 같은 영역): 당일 14,927B / 전날 84,458B / 이틀 전 101,515B.
       `Data-Present` 헤더는 세 날짜 모두 true 라 판별에 못 쓴다 — 실제 신호는 크기다.
       NASA 가 CORS 를 열어 두고 Content-Length 를 노출하므로(실측),
       브라우저가 직접 확인해서 **자료가 실제로 있는 날짜**를 고른다.
       날짜를 우리가 추측해서 정하지 않는다. */
    pickFireDate(m.lat, m.lon, date).then(({ day, bytes }) => {
      if (!img.isConnected) return;
      if (!day) {                        // 어느 날짜에도 자료가 없다 — 사진을 지운다
        img.remove(); cap.remove(); a.remove();
        return;
      }
      img.src = fireSnapshotUrl(m.lat, m.lon, day);
      cap.textContent = (ko
        ? `${day} 위성 영상 (NASA VIIRS, 약 360km 폭). 흰 줄기가 연기, 붉은 점이 위성이 잡은 열입니다. `
          + (day !== date ? `요청한 ${date} 영상은 아직 합성되지 않아 가장 최근 것을 보여줍니다. ` : '')
          + '⚠️ 위성이 지나간 순간의 모습이며, 구름에 가리면 불이 안 보입니다.'
        : `Satellite view for ${day} (NASA VIIRS, ~360 km across). White streaks are smoke, red marks detected heat. `
          + (day !== date ? `Imagery for ${date} isn’t composited yet, so this is the most recent available. ` : '')
          + '⚠️ This is the moment of overpass; cloud cover hides fire.');
      a.href = `https://worldview.earthdata.nasa.gov/?v=${(m.lon - 3).toFixed(2)},${(m.lat - 3).toFixed(2)},${(m.lon + 3).toFixed(2)},${(m.lat + 3).toFixed(2)}&t=${day}`;
      a.textContent = ko ? 'NASA Worldview 에서 크게 보기 (날짜 이동 가능) ↗'
                         : 'Open in NASA Worldview (scrub by date) ↗';
    }).catch(() => { img.remove(); cap.remove(); a.remove(); });
  }

  rows.parentElement.appendChild(box);

  /* ── 이 지역 뉴스 ──
     ⚠️ 우리가 이미 교차검증한 이벤트 중 가까운 것만 고른다.
        새로 검색하지 않는다 — 검증 안 된 것을 "관련 뉴스"로 붙이면
        이 화면의 신뢰가 무너진다. */
  import('./layers/events.js').then(({ events }) => {
    const near = (events.list || [])
      .map(e => ({ e, d: haversineKm(m.lat, m.lon, e.lat, e.lon) }))
      .filter(x => x.d <= 300)
      .sort((a, b) => a.d - b.d)
      .slice(0, 4);
    if (!near.length || !box.isConnected) return;

    const nb = el('div', 'fv-news');
    nb.appendChild(el('div', 'fv-news-h', ko
      ? `이 지역 보도 ${near.length}건 (300km 이내)` : `${near.length} reports within 300 km`));
    near.forEach(({ e, d }) => {
      const row = el('div', 'fv-news-row');
      const t = e.title || (ko ? e.kindKo : e.kindEn) || '';
      const link = document.createElement('a');
      link.href = e.url; link.target = '_blank'; link.rel = 'noopener';
      link.textContent = t;
      row.appendChild(link);
      row.appendChild(el('span', 'fv-news-m',
        ` · ${Math.round(d)}km · ${esc(e.place || '')}`));
      nb.appendChild(row);
    });
    box.appendChild(nb);
  }).catch(() => {});
}

function haversineKm(la1, lo1, la2, lo2) {
  const p = Math.PI / 180;
  return 6371 * Math.acos(Math.max(-1, Math.min(1,
    Math.sin(la1 * p) * Math.sin(la2 * p)
    + Math.cos(la1 * p) * Math.cos(la2 * p) * Math.cos((lo2 - lo1) * p))));
}

/** 같은 좌표의 부이 실측과 파랑 모델값을 대조한다.
 *  ⚠️ 기관 순위나 정확도 점수는 만들지 않는다. 한 시각의 한 점만으로 모델 전체를
 *  평가할 수 없고, 관측시각 차이가 2시간을 넘으면 수치 차이도 계산하지 않는다. */
function renderBuoyModel(m, rows) {
  const ko = i18n.lang === 'ko';
  const box = el('section', 'buoy-compare');
  box.innerHTML = `<div class="buc-head">${ko ? '부이 실측 · 파랑 모델 대조' : 'Buoy observation · wave model'}</div>`
    + `<div class="buc-loading">${ko ? '같은 좌표의 모델값을 확인 중…' : 'Loading the model value at this coordinate…'}</div>`;
  rows.parentElement.appendChild(box);

  const obsRaw = m._obs?.waveHeight;
  const obs = obsRaw == null ? NaN : Number(obsRaw);
  const obsAt = parseUtc(m._obsAt);
  const source = String(m._meta2?.src || 'NOAA NDBC/OSMC');
  lookupWaveModel(m.lat, m.lon).then(model => {
    if (!box.isConnected) return;
    if (!Number.isFinite(obs) || !model) {
      box.innerHTML = `<div class="buc-head">${ko ? '부이 실측 · 파랑 모델 대조' : 'Buoy observation · wave model'}</div>`
        + `<p class="buc-none">${ko ? '비교할 유의파고 실측 또는 모델값이 없습니다.' : 'No comparable significant-wave-height observation or model value.'}</p>`;
      return;
    }

    const modelAt = parseUtc(model.time);
    const gapMin = obsAt && modelAt ? Math.round(Math.abs(modelAt - obsAt) / 60000) : null;
    const comparable = gapMin != null && gapMin <= 120;
    const diff = model.waveHeight - obs;
    const signed = `${diff >= 0 ? '+' : ''}${diff.toFixed(1)} m`;
    const gap = gapMin == null ? (ko ? '시각 확인 불가' : 'time unavailable')
      : gapMin < 60 ? `${gapMin}${ko ? '분' : ' min'}`
      : `${(gapMin / 60).toFixed(1)}${ko ? '시간' : ' h'}`;
    const obsTime = fmtUtcKst(obsAt, ko);
    const modelTime = fmtUtcKst(modelAt, ko);
    const grid = Number.isFinite(model.gridLat) && Number.isFinite(model.gridLon)
      ? `${Number(model.gridLat).toFixed(2)}, ${Number(model.gridLon).toFixed(2)}` : '—';

    box.innerHTML = `
      <div class="buc-head">${ko ? '부이 실측 · 파랑 모델 대조' : 'Buoy observation · wave model'}</div>
      <div class="buc-metric">${ko ? '유의파고' : 'Significant wave height'}</div>
      <div class="buc-values">
        <div><span>${ko ? '부이 실측' : 'Buoy observed'}</span><strong>${obs.toFixed(1)} m</strong></div>
        <div><span>${ko ? '모델 격자값' : 'Model grid value'}</span><strong>${Number(model.waveHeight).toFixed(1)} m</strong></div>
        <div class="${comparable ? '' : 'is-muted'}"><span>${ko ? '모델 − 실측' : 'Model − observed'}</span><strong>${comparable ? signed : '—'}</strong></div>
      </div>
      <dl class="buc-meta">
        <div><dt>${ko ? '관측' : 'Observed'}</dt><dd>${esc(source)} · ${esc(obsTime)}</dd></div>
        <div><dt>${ko ? '모델' : 'Model'}</dt><dd>${esc(model.model)} via Open-Meteo Marine · ${esc(modelTime)}</dd></div>
        <div><dt>${ko ? '시각 차이' : 'Time gap'}</dt><dd>${esc(gap)}</dd></div>
        <div><dt>${ko ? '요청 좌표' : 'Requested'}</dt><dd>${m.lat.toFixed(3)}, ${m.lon.toFixed(3)}</dd></div>
        <div><dt>${ko ? '사용 격자' : 'Model grid'}</dt><dd>${grid}</dd></div>
      </dl>
      <p class="buc-note">${comparable
        ? (ko ? '양수는 모델값이 실측보다 높다는 뜻입니다. 한 시각의 대조이며 기관 순위나 장기 정확도 평가는 아닙니다.'
              : 'Positive means the model is higher than observed. This is one timestamp, not an agency ranking or long-term skill score.')
        : (ko ? '관측과 모델의 시각 차이가 2시간을 넘거나 시각이 없어, 두 값을 나란히만 보여주고 차이는 계산하지 않았습니다.'
              : 'The timestamps are over two hours apart or unavailable, so values are shown side by side without a difference.')}</p>`;
  }).catch(() => {
    if (box.isConnected) box.querySelector('.buc-loading').textContent = ko
      ? '모델값을 불러오지 못했습니다. 부이 실측은 위 값이 그대로 유효합니다.'
      : 'Could not load the model value. The buoy observation above remains valid.';
  });
}

function parseUtc(v) {
  if (!v) return null;
  const s = String(v);
  const d = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function fmtUtcKst(d, ko) {
  if (!d) return ko ? '시각 없음' : 'time unavailable';
  const utc = d.toISOString().slice(5, 16).replace('T', ' ') + ' UTC';
  if (!ko) return utc;
  const kst = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
  return `${utc} · ${kst} KST`;
}

/** 부이 카메라 사진 + 이 부이가 하는 일 */
function renderBuoyCam(m, rows) {
  const ko = i18n.lang === 'ko';
  const box = el('div', 'ctx-block buoy-cam');

  let anyPhoto = false;

  /* ① 이 부이에 달린 카메라의 실시간 사진 (NDBC 관측소만) */
  if (m._ndbc) {
    const img = document.createElement('img');
    img.className = 'bc-img';
    img.alt = ko ? `${m._buoyId}호 부이 카메라 사진` : `Buoy ${m._buoyId} camera view`;
    img.loading = 'lazy';
    img.src = `https://www.ndbc.noaa.gov/buoycam.php?station=${encodeURIComponent(m._buoyId)}`;
    const cap = el('div', 'bc-cap', ko
      ? '이 부이에 달린 카메라가 방금 찍은 바다입니다. 사진 아래에 관측소 번호와 촬영 시각(UTC)이 새겨져 있습니다. (NOAA NDBC)'
      : 'The sea as this buoy’s own camera just saw it — station ID and capture time (UTC) are printed along the bottom. (NOAA NDBC)');
    /* ⚠️ 카메라가 없는 부이도 있다. 그럴 때 사진과 설명을 함께 없앤다 —
       설명만 남으면 "사진이 있어야 하는데 안 뜬다"로 읽힌다. */
    img.onerror = () => { img.remove(); cap.remove(); };
    box.append(img, cap);
    anyPhoto = true;
  }

  /* ② 이 종류의 부이가 어떻게 생겼는지 (NDBC 종류별 사진)
     ⚠️ 이 부이 자체를 찍은 사진이 아니라 **같은 종류**의 사진이다. 그렇게 적는다. */
  const ph = m._meta2?.photo;
  if (ph) {
    const h = document.createElement('img');
    h.className = 'bc-hull';
    h.loading = 'lazy';
    h.alt = m._meta2?.type || (ko ? '부이 종류' : 'Buoy type');
    h.src = `https://www.ndbc.noaa.gov${ph}`;
    const hc = el('div', 'bc-cap', ko
      ? `같은 종류(${esc(m._meta2.type || '')})의 부이 사진입니다 — 이 부이를 직접 찍은 것은 아닙니다.`
      : `A photo of the same buoy type (${esc(m._meta2.type || '')}) — not this individual buoy.`);
    h.onerror = () => { h.remove(); hc.remove(); };
    box.append(h, hc);
    anyPhoto = true;
  }

  /* ③ 최근 5일 변화 — NDBC 가 직접 그려주는 차트
     ⚠️ 왜 이미지인가: NDBC 원자료(realtime2, 45일치 610KB)는 CORS 가 없어
        브라우저가 직접 못 받고, 우리 프록시는 이 계정에서 403 이다.
        그런데 **차트는 이미지**라 CORS 가 필요 없다 — 그대로 붙인다.
     ⚠️ 지금 값을 보내는 항목만 그린다. 안 재는 항목의 차트를 걸면 빈 그래프가 뜨고
        (실측: 없는 관측소도 200 + 빈 PNG 를 준다) 그건 고장으로 보인다. */
  if (m._ndbc) {
    /* ⚠️ 서버가 항목마다 HEAD 로 실제 확인한 목록(meta.charts)을 쓴다.
       "지금 값이 있으니 차트도 있겠지"로 넘겨짚으면 빈 그래프가 뜬다 —
       실측: NDBC 는 없는 자료에도 200 + 빈 PNG 를 준다.
       목록이 없는 옛 자료를 위해서만 현재값으로 대신 판단한다. */
    const NAMES = {
      wtmp: ko ? '수온' : 'Water temp',
      atmp: ko ? '기온' : 'Air temp',
      wvht: ko ? '파고' : 'Wave height',
      wspd: ko ? '풍속' : 'Wind',
      pres: ko ? '기압' : 'Pressure',
    };
    const avail = m._meta2?.charts;
    const has = k => m.data && Object.prototype.hasOwnProperty.call(m.data, k);
    const PLOTS = (avail?.length
      ? avail.map(k => [k, NAMES[k]]).filter(([, n]) => n)
      : Object.entries(NAMES).filter(([, n]) => has(n)));

    if (PLOTS.length) {
      const wrap = el('div', 'bc-plots');
      wrap.appendChild(el('div', 'bc-plots-h', ko
        ? `최근 5일 변화 (${PLOTS.length}개 항목)` : `Last 5 days (${PLOTS.length} series)`));
      PLOTS.forEach(([meas, label]) => {
        const fig = el('figure', 'bc-plot');
        const im = document.createElement('img');
        im.loading = 'lazy';
        im.alt = `${m._buoyId} ${label}`;
        /* uom=M → 미터법. ⚠️ 기본값은 영국 단위(E)라 그대로 두면 °F·ft 가 나온다. */
        im.src = `https://www.ndbc.noaa.gov/plot?station=${encodeURIComponent(m._buoyId)}`
               + `&meas=${meas}&uom=M&tz=UTC`;
        im.onerror = () => fig.remove();
        fig.appendChild(im);
        wrap.appendChild(fig);
      });
      wrap.appendChild(el('div', 'bc-cap', ko
        ? '차트는 NOAA NDBC 가 제공하는 최근 5일 그래프입니다. '
          + '⚠️ 5일은 그날그날의 날씨를 보는 데는 충분하지만 연구·논문용으로는 짧습니다 — '
          + '계절 변동이나 추세를 보려면 아래 「연도별 전체 이력」에서 원자료를 받으세요.'
        : 'Charts are NOAA NDBC’s own 5-day plots. '
          + '⚠️ Five days is enough to read the current weather but too short for research — '
          + 'for seasonal variation or trends, download the raw archive linked below.'));
      box.appendChild(wrap);
      anyPhoto = true;
    }

    const arc = document.createElement('a');
    arc.className = 'bc-link';
    arc.href = `https://www.ndbc.noaa.gov/station_history.php?station=${encodeURIComponent(m._buoyId)}`;
    arc.target = '_blank'; arc.rel = 'noopener';
    arc.textContent = ko ? '연도별 전체 이력 내려받기 (연구용 원자료) ↗'
                         : 'Full year-by-year archive (raw data for research) ↗';
    box.appendChild(arc);
  }

  /* ④ 원문 관측소 페이지 — 우리가 안 옮긴 것까지 다 있다 */
  if (m._ndbc) {
    const a = document.createElement('a');
    a.className = 'bc-link';
    a.href = `https://www.ndbc.noaa.gov/station_page.php?station=${encodeURIComponent(m._buoyId)}`;
    a.target = '_blank'; a.rel = 'noopener';
    a.textContent = ko ? 'NDBC 관측소 원문 페이지 (5일 그래프·전체 관측값) ↗'
                       : 'NDBC station page (5-day plots, full observations) ↗';
    box.appendChild(a);
  }

  /* 이 부이가 무엇을 하는 곳인지 — 종류에 따라 다르다.
     ⚠️ 관측하지 않는 값을 설명에 쓰지 않는다. 실제로 받은 항목만 근거로 삼는다. */
  const t = (m._meta2?.type || '').toLowerCase();
  const has = k => m.data && Object.prototype.hasOwnProperty.call(m.data, k);
  const measures = [];
  if (has(ko ? '파고' : 'Wave height')) measures.push(ko ? '파고와 파주기' : 'wave height and period');
  if (has(ko ? '수온' : 'Water temp')) measures.push(ko ? '수온' : 'water temperature');
  if (has(ko ? '풍속' : 'Wind')) measures.push(ko ? '바람' : 'wind');
  if (has(ko ? '기압' : 'Pressure')) measures.push(ko ? '기압' : 'air pressure');

  let purpose;
  if (/water level/.test(t)) {
    purpose = ko ? '해수면 높이를 재는 관측소입니다. 조위와 폭풍해일을 감시합니다.'
                 : 'A water-level station: it tracks tides and storm surge.';
  } else if (/waverider/.test(t)) {
    purpose = ko ? '파도 전용 부이입니다. 파고·파향·파주기를 재서 항해와 서핑, 연안 침식 연구에 쓰입니다.'
                 : 'A wave-only buoy measuring height, direction and period — used for navigation, surf and coastal-erosion research.';
  } else if (/c-man/.test(t)) {
    purpose = ko ? '등대·방파제 같은 고정 구조물에 설치된 연안 관측소입니다.'
                 : 'A coastal station mounted on a fixed structure such as a lighthouse or breakwater.';
  } else {
    purpose = ko
      ? '바다에 떠 있는 기상·해양 관측소입니다. 사람이 갈 수 없는 먼 바다의 자료를 실시간으로 보내, 태풍 진로 예측과 파랑 예보의 기초가 됩니다.'
      : 'A moored weather and ocean station. It reports from open water no one can visit, feeding cyclone-track and wave forecasts.';
  }
  if (measures.length) {
    purpose += ko ? ` 지금 이 부이는 ${measures.join(' · ')}을 보내고 있습니다.`
                  : ` Right now it is reporting ${measures.join(', ')}.`;
  }
  box.appendChild(el('div', 'bc-why', esc(purpose)));

  rows.parentElement.appendChild(box);
}

function renderAgencyCheck(jc, rows) {
  const ko = i18n.lang === 'ko';
  const box = el('div', 'agency-check');

  if (!jc.found) {
    box.innerHTML = `<div class="ac-head">${ko ? '기관 대조' : 'Agency cross-check'}</div>`
      + `<div class="ac-none">${ko
        ? '일본 기상청 발표에서 대응하는 지진을 찾지 못했습니다. 기상청은 일본에서 진도가 관측된 지진만 발표하므로, 먼 바다·쿠릴·오가사와라 지역은 대조되지 않습니다. 표시된 값은 미국 지질조사국(USGS) 해입니다.'
        : 'No matching JMA bulletin. JMA publishes only quakes felt in Japan, so remote offshore events are not cross-checked. The values shown are the USGS solution.'}</div>`;
    rows.parentElement.appendChild(box);
    return;
  }

  const f = (v, d = 2) => (v == null ? '—' : v.toFixed(d));
  box.innerHTML = `
    <div class="ac-head">${ko ? '기관 대조' : 'Agency cross-check'}
      <span class="ac-gap">${ko ? '진앙 차이' : 'epicenter differs'} ${jc.distKm.toFixed(0)} km</span></div>
    <table class="ac-tbl">
      <tr><th></th><th>${ko ? '일본 기상청' : 'JMA'}</th><th>USGS</th></tr>
      <tr><td>${ko ? '진앙' : 'Epicenter'}</td>
          <td class="ac-pri">${f(jc.jma.lat)}, ${f(jc.jma.lon)}</td>
          <td>${f(jc.usgs.lat)}, ${f(jc.usgs.lon)}</td></tr>
      <tr><td>${ko ? '규모' : 'Magnitude'}</td>
          <td class="ac-pri">M ${f(jc.jma.mag, 1)}</td>
          <td>M ${f(jc.usgs.mag, 1)}</td></tr>
    </table>
    <div class="ac-note">${ko
      ? `지도에는 <b>일본 기상청</b> 진앙을 표시합니다. 일본 안의 지진은 기상청 관측망이 훨씬 조밀해 진앙이 더 정확합니다. 기관마다 관측점과 지하 속도모델이 달라 수십 km 차이는 정상입니다.`
      : `The map shows the <b>JMA</b> epicenter. JMA's dense domestic network resolves Japanese quakes more precisely. Differences of tens of km between agencies are normal.`}</div>
    <a class="ac-link" href="https://www.jma.go.jp/bosai/map.html#contents=earthquake"
       target="_blank" rel="noopener">${ko ? '기상청 지진정보 ↗' : 'JMA earthquake info ↗'}</a>`;
  rows.parentElement.appendChild(box);
}

/* 이 지점이 열돔인지 직접 판정해서 보여준다.
   ⚠️ 아니면 "아니다"라고 분명히 쓴다. 조용히 아무 말도 안 하면
      사용자는 "판단을 못 한 것"과 "아닌 것"을 구분할 수 없다.
      그리고 참일 때는 phenomena.checkAt 이 지도에도 같이 그리므로
      설명글만 있고 그림이 없는 상태가 생기지 않는다. */
async function renderHeatCheck(m, rows) {
  const ko = i18n.lang === 'ko';
  const box = el('div', 'heat-check');
  box.innerHTML = `<div class="hc-head">${ko ? '열돔 판정' : 'Heat dome check'}</div>`
    + `<div class="hc-body">${ko ? '확인 중…' : 'Checking…'}</div>`;
  rows.parentElement.appendChild(box);
  try {
    const { phenomena } = await import('./layers/phenomena.js');
    const r = await phenomena.checkAt(m.lat, m.lon);
    /* ⚠️ 판정에 몇 초가 걸린다. 그 사이 사용자가 시트를 닫거나 다른 지점을 눌렀으면
       이 블록은 이미 지워진 상태다. 그때 값을 써넣으면 안 된다 —
       다른 지점의 결과가 남아 있는 것처럼 보인다. */
    if (!box.isConnected) return;
    box.classList.toggle('on', r.isDome);
    box.innerHTML =
      `<div class="hc-head">${ko ? '열돔 판정' : 'Heat dome check'}`
      + `<span class="hc-verdict${r.isDome ? ' yes' : ''}">${r.isDome
          ? (ko ? '열돔' : 'Heat dome') : (ko ? '해당 없음' : 'No')}</span></div>`
      + `<div class="hc-body">${r.reason}</div>`
      + `<div class="hc-crit">${ko
          ? `기준: 최고기온 ${i18n.temp(33)} 이상 + 하늘이 부푼 정도`
            + `(약 5.9km 상공의 높이)가 5,880m 이상, 이것이 3일 연속`
          : `Criteria: high ≥ ${i18n.temp(33)} and 500hPa height ≥ 5,880m for 3+ consecutive days`}</div>`
      + (r.isDome ? `<div class="hc-crit">${ko
          ? '지도에도 이 열돔의 범위를 표시했습니다.'
          : 'The extent is now drawn on the globe.'}</div>` : '');
  } catch (e) {
    if (!box.isConnected) return;
    const b = box.querySelector('.hc-body');
    if (b) b.textContent = ko
      ? '판정에 필요한 자료를 받지 못했습니다' : 'Could not fetch the data needed';
  }
}

/* 이 지점을 덮고 있는 광역 현상(열돔·환류)을 배경 설명으로 붙인다.
   지점 정보가 주인공이고 현상은 맥락이다 — 순서를 뒤집지 않는다. */
function renderContext(ctx, rows) {
  const ko = i18n.lang === 'ko';
  const box = el('div', 'ctx-block');
  const head = el('div', 'ctx-head');
  head.innerHTML = `<span class="ctx-tag">${ctx.name}</span>`
    + `<span>${ko ? '이 지점을 덮고 있는 현상' : 'Covering this location'}</span>`;
  box.appendChild(head);

  const dl = el('dl', 'ctx-rows');
  Object.entries(ctx.data || {}).forEach(([k, v]) => {
    if (k.startsWith('_') || v == null) return;
    dl.appendChild(el('dt', null, k));
    dl.appendChild(el('dd', null, String(v)));
  });
  box.appendChild(dl);
  rows.parentElement.appendChild(box);
}

/* 어디인가 — 좌표만으론 감이 안 온다. 국가·도시를 붙인다. */
async function renderPlaceLine(m, rows) {
  const ko = i18n.lang === 'ko';
  const box = el('div', 'place-line');
  box.textContent = ko ? '위치 확인 중…' : 'Locating…';
  rows.parentElement.insertBefore(box, rows);
  try {
    const { lookupPlace } = await import('./place.js');
    const pl = await lookupPlace(m.lat, m.lon);
    const where = pl?.detail || pl?.country
      || (ko ? '바다 위' : 'Over open sea');
    box.innerHTML = `<b>${where}</b><span>${fmtCoord(m.lat, m.lon)}</span>`;
  } catch (_) {
    box.innerHTML = `<span>${fmtCoord(m.lat, m.lon)}</span>`;
  }
}

/* 지진 단층 메커니즘 — 상하로 흔들렸나, 좌우로 어긋났나.
   ⚠️ 큰 지진에만 자료가 있다 (실측: 규모 5.5+ 4건 중 3건).
      없을 때 지어내지 말고 "산출되지 않았다"고 쓴다. */
async function renderFault(detailUrl, rows) {
  const ko = i18n.lang === 'ko';
  const box = el('div', 'fault');
  box.innerHTML = `<div class="fa-t">${ko ? '단층 운동' : 'Fault motion'}</div>`
                + `<div class="fa-load">${ko ? '확인 중…' : 'Checking…'}</div>`;
  rows.parentElement.appendChild(box);

  const { fetchMechanism } = await import('./faultmech.js');
  const m = await fetchMechanism(detailUrl);

  if (!m?.type) {
    box.innerHTML = `<div class="fa-t">${ko ? '단층 운동' : 'Fault motion'}</div>`
      + `<div class="fa-none">${ko
        ? '이 지진은 단층 해석(모멘트 텐서)이 산출되지 않았습니다. 보통 규모가 큰 지진에만 계산됩니다.'
        : 'No moment tensor was computed for this event — usually only larger quakes have one.'}</div>`;
    return;
  }
  const t = m.type;
  box.innerHTML = `
    <div class="fa-t">${ko ? '단층 운동' : 'Fault motion'}</div>
    <div class="fa-name fa-${t.id}">${t.name} <span>${t.motion}</span></div>
    <div class="fa-d">${t.detail}</div>
    <dl class="fa-rows">
      <dt>${ko ? '단층면 1' : 'Plane 1'}</dt>
      <dd>${ko ? '주향' : 'strike'} ${Math.round(m.plane1.strike)}° · ${ko ? '경사' : 'dip'} ${Math.round(m.plane1.dip)}° · ${ko ? '미끌림' : 'rake'} ${Math.round(m.plane1.rake)}°</dd>
      <dt>${ko ? '단층면 2' : 'Plane 2'}</dt>
      <dd>${ko ? '주향' : 'strike'} ${Math.round(m.plane2.strike)}° · ${ko ? '경사' : 'dip'} ${Math.round(m.plane2.dip)}° · ${ko ? '미끌림' : 'rake'} ${Math.round(m.plane2.rake)}°</dd>
      ${m.doubleCouple != null ? `<dt>${ko ? '단순 단층 정도' : 'Double couple'}</dt><dd>${m.doubleCouple}%</dd>` : ''}
    </dl>
    <div class="fa-note">${ko
      ? '두 단층면은 수학적으로 동등해서 어느 쪽이 실제로 움직였는지는 이 자료만으로 알 수 없습니다.'
      : 'The two planes are mathematically equivalent — this data alone cannot say which one slipped.'}</div>`;
}

/* 통과 예보 — "내 머리 위로 언제 지나가나"
   지구본에서 도는 걸 보는 것과 "오늘 밤 8시 52분에 내 위를 지나간다"는 다른 경험이다.
   후자는 밖에 나가 하늘을 보게 만든다.
   ⚠️ 위치를 모르면 계산할 수 없다. 그때는 안내만 하고 조용히 넘어간다. */
/* 유료 기능 자리 — 무엇이 열리는지와 왜 유료인지를 함께 쓴다.
   ⚠️ "구독하세요"만 띄우면 인질처럼 보인다. 이유를 밝히고, 무료로 되는 것도 말한다. */
function renderPaidHint(rows, cap) {
  const ko = i18n.lang === 'ko';
  const TXT = {
    [PAID_CAP.PASSES]: ko
      ? ['내 위치 통과 예보', '이 위성이 내가 있는 곳 위를 언제 지나가는지 계산해 드립니다. 몇 분 전에 알람도 받을 수 있습니다.']
      : ['Passes over my location', 'We compute when this satellite crosses over you, with an alarm a few minutes ahead.'],
    [PAID_CAP.SAT_DEEP]: ko
      ? ['궤도 추적선 · 용도 상세', '어디서 어디로 가는지 선으로 그리고, 무엇을 하는 위성인지 보여드립니다.']
      : ['Orbit track & mission detail', 'Draws where it came from and where it is going, and what the satellite does.'],
    [PAID_CAP.HISTORY]: ko
      ? ['되감기 · 이력', '지난 며칠의 지구를 다시 볼 수 있습니다.']
      : ['Rewind & history', 'Replay the past days of Earth.'],
  }[cap] || (ko ? ['구독 기능', ''] : ['Subscriber feature', '']);

  const box = el('div', 'paid-hint');
  box.innerHTML = `<div class="ph-head">✦ ${TXT[0]}</div><p>${TXT[1]}</p>`;
  const btn = el('button', 'ph-btn', ko ? '구독 알아보기' : 'See subscription');
  btn.onclick = async () => {
    const { subscribeSheet } = await import('./ui-subscribe.js');
    subscribeSheet.open(TXT[1]);
  };
  box.appendChild(btn);
  box.appendChild(el('div', 'ph-free', ko
    ? '위성 위치와 기본 정보는 구독 없이 계속 보실 수 있습니다.'
    : 'Satellite positions and basic info stay free.'));
  rows.parentElement.appendChild(box);
}

async function renderPasses(sat, rows) {
  if (!sat?.rec) return;
  const ko = i18n.lang === 'ko';
  const { myLocation } = await import('./mylocation.js');
  const { computePasses, azName, passQuality, downlinkOf } = await import('./passes.js');

  const box = el('div', 'passes');
  rows.parentElement.appendChild(box);

  const obs = myLocation.coords;
  if (!obs) {
    box.innerHTML = `<div class="ps-title">${ko ? '통과 예보' : 'Pass predictions'}</div>`
      + `<div class="ps-empty">${ko
          ? '내 위치를 알아야 계산할 수 있습니다. 메뉴에서 “내 위치”를 눌러주세요.'
          : 'Needs your location — tap “My location” in the menu.'}</div>`;
    return;
  }

  const list = computePasses(sat.rec, { lat: obs.lat, lon: obs.lon, alt: 0.05 }, 48, 5);
  const dl = downlinkOf(sat.name);

  let html = `<div class="ps-title">${ko ? '내 위치 통과 예보' : 'Passes over you'}`
           + `<span class="ps-sub">${ko ? '앞으로 48시간' : 'next 48 h'}</span></div>`;

  if (!list.length) {
    html += `<div class="ps-empty">${ko
      ? '앞으로 48시간 안에는 앙각 10° 이상으로 지나가지 않습니다.'
      : 'No pass above 10° elevation in the next 48 hours.'}</div>`;
  } else {
    html += list.map((p, i) => {
      const d = new Date(p.start);
      const when = d.toLocaleString(ko ? 'ko-KR' : 'en-US',
        { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const on = alarms.has(sat.name, p.start);
      return `<div class="ps-row">
        <div class="ps-when">${when}</div>
        <div class="ps-main">
          <b>${ko ? '최대앙각' : 'Max elev.'} ${p.maxEl}°</b>
          <span>${azName(p.startAz)} → ${azName(p.endAz)} · ${p.minutes}${ko ? '분' : ' min'}</span>
          <em>${passQuality(p.maxEl)}</em>
        </div>
        <button class="ps-bell${on ? ' on' : ''}" data-i="${i}"
          aria-label="${ko ? '알림' : 'Alert'}" title="${ko ? `${alarms.lead}분 전 알림` : `${alarms.lead} min before`}">
          ${on ? '🔔' : '🔕'}
        </button>
      </div>`;
    }).join('');
    html += `<div class="ps-lead">${ko
      ? `알림은 통과 <b>${alarms.lead}분 전</b>에 옵니다 · 설정에서 변경`
      : `Alerts fire <b>${alarms.lead} min</b> before · change in settings`}</div>`;
  }

  /* 직접 수신 안내 — 이게 이 앱의 특별한 지점이다.
     ⚠️ "수신"만 가능하다고 분명히 적을 것. 송신은 무선국 허가가 필요하다. */
  if (dl) {
    html += `<div class="ps-rx">
      <div class="ps-rx-t">${ko ? '직접 수신 가능' : 'You can receive this'}</div>
      <div class="ps-rx-b">
        <b>${dl.mhz} MHz</b> · ${dl.mode} · ${ko ? dl.what.ko : dl.what.en}<br>
        ${ko
          ? 'SDR 수신기와 안테나가 있으면 위 시간에 직접 신호를 받을 수 있습니다. 수신에는 면허가 필요 없습니다(송신은 무선국 허가 필요).'
          : 'With an SDR receiver and antenna you can pick this up during the pass. Receiving needs no licence (transmitting does).'}
      </div>
    </div>`;
  }
  box.innerHTML = html;

  box.querySelectorAll('.ps-bell').forEach(btn => {
    btn.onclick = async () => {
      const p = list[+btn.dataset.i];
      if (alarms.has(sat.name, p.start)) {
        alarms.remove(sat.name, p.start);
        btn.classList.remove('on'); btn.textContent = '🔕';
        return;
      }
      const st = alarms.status();
      if (!st.ok) { toast(st.msg); return; }
      const okPerm = await alarms.ensurePermission();
      if (!okPerm) { toast(alarms.status().msg || (ko ? '알림 권한이 필요합니다' : 'Permission needed')); return; }
      if (alarms.add(sat.name, p.start)) {
        btn.classList.add('on'); btn.textContent = '🔔';
        toast(ko ? `${alarms.lead}분 전에 알려드립니다` : `You'll be alerted ${alarms.lead} min before`);
      }
    };
  });

  /* ⚠️ 못 하는 걸 될 것처럼 두면 사용자가 통과를 놓친다. 한계를 적는다. */
  const note = el('p', 'ps-limit', ko
    ? '앱이 열려 있을 때 울립니다. 앱을 닫아도 받으려면 홈 화면에 추가해야 합니다(추후 지원).'
    : 'Fires while the app is open. Background alerts need home-screen install (coming later).');
  box.appendChild(note);
}

/* 위성 그림 — 실사진이 있으면 사진, 없으면 개념도.
   ⚠️ 개념도를 사진처럼 보이게 하지 말 것. 16,000개 위성의 사진은 존재하지 않는다.
      "개념도"라고 적어야 사용자가 오해하지 않는다. */
async function renderSatImage(sat, rows) {
  if (!sat) return;
  const ko = i18n.lang === 'ko';
  const box = el('div', 'sat-img');
  rows.parentElement.insertBefore(box, rows);

  const { satPhoto, drawSchematic } = await import('./satimage.js');
  const photo = await satPhoto(sat.name);

  if (photo) {
    const img = new Image();
    img.src = photo.url; img.alt = photo.title; img.loading = 'lazy';
    box.appendChild(img);
    const cap = el('div', 'sat-cap');
    const source = el('a', '', `${photo.credit} ↗`);
    source.href = photo.page;
    source.target = '_blank';
    source.rel = 'noopener';
    cap.appendChild(source);
    box.appendChild(cap);
  } else {
    const cv = document.createElement('canvas');
    drawSchematic(cv, sat, sat.color);
    box.appendChild(cv);
    box.appendChild(el('div', 'sat-cap',
      ko ? '개념도 — 실제 사진이 아닙니다. 크기·궤도만 반영했습니다.'
         : 'Schematic — not a photo. Reflects size and orbit only.'));
  }
}

/* 내린 시트를 다시 올리는 손잡이.
   내리기만 있고 되돌릴 방법이 없으면 정보를 영영 못 본다. */
function showRestore(onTap) {
  hideRestore();
  const b = el('button', 'sheet-restore', i18n.lang === 'ko' ? '정보 다시 보기' : 'Show info');
  b.id = 'sheetRestore';
  b.onclick = () => { hideRestore(); onTap(); };
  document.querySelector('.overlay').appendChild(b);
}
function hideRestore() { document.getElementById('sheetRestore')?.remove(); }

/* 시트에 동적으로 붙는 블록 전부.
   ⚠️ 이 목록을 빠뜨리면 이전 지점의 정보가 다음 시트에 남는다.
      두 번 겪었다:
        1) 위성 정보를 보는데 이전 지점의 시간별 강수확률이 그대로 남음
        2) 쓰나미 시트에 「열돔 판정」이 3개 쌓이고 값이 서로 달라
           "이게 열돔이야 아니야?"라는 질문을 받음 (35°C / 28°C / 28°C 가 동시에 표시)
      두 번째가 더 나쁘다 — 정보가 서로 모순되면 앱 전체를 못 믿게 된다.

   ⚠️ 새 블록을 만들면 반드시 여기 클래스를 추가할 것.
      추가를 잊으면 조용히 쌓이기만 하고 에러가 안 난다. */
const DYNAMIC_BLOCKS = [
  '.st-block',
  '.fire-view',     // 산불 위성 영상 + 주변 뉴스
  '.buoy-cam',      // 부이 카메라 사진
  '.bf-in-sheet',   // AI 브리핑 카드
  '.sat-img',       // 위성 개념도
  '.passes',        // 통과 예보
  '.fault',         // 단층 메커니즘
  '.place-line',    // 지명 줄
  '.official',      // 공식 기관 링크
  '.live',          // 라이브 임베드
  '.evsrc',         // 이벤트 원문 링크
  '.agency-check',  // 기관 대조 (USGS ↔ JMA)
  '.heat-check',    // 지점 열돔 판정
  '.ctx-block',     // 이 지점을 덮고 있는 현상
  '.sheet-cta',     // 예매 버튼
  '.sheet-note',    // 각주
  '.paid-hint',     // 유료 기능 안내
  '.title-orig',    // 제목 원문 (번역했을 때)
  '.safety-actions', // 공식 행동요령 + 한국 긴급전화
].join(', ');

function clearDynamic() {
  document.querySelectorAll(DYNAMIC_BLOCKS).forEach(n => n.remove());
}

function clearRainBars() {
  const b = $('#rainbars');
  if (b) { b.innerHTML = ''; b.style.display = 'none'; }
}

function clearForecast() {
  const b = $('#forecast');
  if (b) { b.innerHTML = ''; b.style.display = 'none'; }
  clearDynamic();
}

/* ══════════════════════════════════════════════════════════════
   전지구 이벤트 배너 (§5-10 이벤트 예외)
   ══════════════════════════════════════════════════════════════ */
/* 하단 배너 — 여러 소식을 **돌아가며** 하나씩 보여준다.
 *
 * ⚠️ 예전에는 가장 등급이 높은 쓰나미 하나를 붙잡고 계속 띄웠다.
 *    두 가지가 잘못됐다.
 *      1) 경보가 여러 건이어도 한 건만 보였다 — 나머지는 볼 방법이 없었다
 *      2) 사라지지 않으니 화면 아래가 영구히 점유됐다
 *    이제 큐를 만들어 한 건씩 보여주고 잠깐 비운 뒤 다음으로 넘어간다.
 *
 * ⚠️ 그래도 경보를 "지나가면 끝"으로 만들지 않는다. 큐는 계속 돌기 때문에
 *    같은 경보가 다시 온다. 놓쳐도 다음 바퀴에 또 보인다.
 * ⚠️ 등급이 높은 것을 먼저, 그리고 더 오래 보여준다.
 */
const BANNER_SHOW_MS = 7000;    // 한 건을 보여주는 시간
const BANNER_ALERT_MS = 11000;  // 쓰나미 경보는 읽을 시간을 더 준다
const BANNER_GAP_MS = 1400;     // 비우는 시간 — 바뀌었다는 걸 눈이 알아채야 한다

/* ⚠️ 한 소식은 **한 번만** 띄운다. 계속 돌리지 않는다.
   이미 본 것을 반복해서 띄우면 화면 아래가 영구히 점유되고, 정작 새로 들어온
   소식이 묻힌다. 지난 것은 이벤트 메뉴에서 언제든 다시 볼 수 있다.
   그래서 여기서는 "새 소식 알림"만 하고, 보관은 이벤트 메뉴가 맡는다. */

export const banner = {
  _queue: [],        // 아직 안 보여준 것들
  _seen: new Set(),  // 이미 보여준 소식의 키 — 다시 띄우지 않는다
  _timer: null,

  init() {
    setInterval(() => this.rebuild(), 15_000);
    /* ⚠️ 카메라가 움직일 때마다 회전을 처음부터 돌리면 안 된다.
       지구를 돌리는 동안 배너가 계속 첫 항목으로 되돌아간다.
       큐만 다시 만들고 순번은 유지한다. */
    store.on('camera', () => this.rebuild());
    this.rebuild();
    this._cycle();
  },

  /** 지금 보여줄 것들을 모은다 (긴급한 것 먼저)
   *
   * ⚠️⚠️ 레이어를 끈다고 여기서 빠지지 않는다.
   *    레이어 스위치는 **지도에 표시할지**를 정하는 것이고, 감시를 끄는 게 아니다.
   *    자료는 레이어가 꺼져 있어도 계속 받는다 (registry.run 은 on/off 를 안 본다).
   *    "지구를 깨끗하게 보고 싶다"와 "쓰나미 경보를 놓쳐도 된다"는 다른 얘기다.
   *
   * ⚠️ 확대 여부도 보지 않는다. 확대해서 다른 걸 보고 있다고 경보를 감추지 않는다.
   *    긴급하지 않은 것(발사 예정)만 멀리서 보는 상태로 제한한다.
   */
  rebuild() {
    const items = [];
    const ko = i18n.lang === 'ko';
    /* ⚠️ 한 소식원이 터져도 나머지는 보여준다.
       실제로 quakes.headline() 이 초기화 전에 불려 배너 전체가 죽은 적이 있다. */
    const safe = (fn) => { try { fn(); } catch (e) { console.warn('[banner]', e.message); } };

    // ── 1. 쓰나미 — 등급 높은 순 ──
    /* ⚠️ 최하위 '쓰나미 정보'(rank 1, Information Statement)는 배너에 안 띄운다.
       실제 위협 없이 안내로 자주 나와(특히 일본 주변) 하단이 계속 차 있게 만든다.
       배너는 행동이 필요한 것만 — 예비특보(2)·주의보(3)·경보(4)만.
       '정보' 등급도 지도·이벤트 메뉴·쓰나미 레이어에는 그대로 나온다(감시는 유지). */
    safe(() => {
      (tsunami.list || []).slice()
        .filter(ts => (ts.level?.rank ?? 0) >= 2)
        .sort((a, b) => (b.level?.rank ?? 0) - (a.level?.rank ?? 0))
        .forEach(ts => items.push({
          key: `ts:${ts.id}`,
          alert: true,
          ms: BANNER_ALERT_MS,
          html: `<span class="dot red"></span>${ts.level[i18n.lang] || ts.level.ko}`
              + ` · ${(ts.area || '').split(';')[0]}`,
          go: () => {
            if (ts.lat != null) flyTo(ts.lon, ts.lat, 2_400_000);
            store.select({ id: ts.id, kind: 'tsunami', name: ts.level[i18n.lang] || ts.level.ko,
                           lat: ts.lat, lon: ts.lon, _ts: ts });
          },
        }));
    });

    /* ── 1-b. 한국 기상특보 ──
       ⚠️ 예전에는 특보만 **별도 띠(#warnBar)** 로 상단에 따로 떴다.
          그래서 지진·쓰나미 배너와 **두 줄이 겹쳐** 화면을 먹었다 (지적받음).
          이제 같은 배너 큐에 넣어 한 줄로 돌아가게 한다.

       ⚠️ 특보는 '소식'이 아니라 **지속되는 상태**다. 한 번 보여줬다고 지우면
          폭염이 계속되는데 표시가 사라진다. 그래서 persist 를 달아
          _seen 에 넣지 않고 계속 순번에 다시 오르게 한다. */
    safe(() => {
      const s = warn.summary?.();
      if (!s || !s.ready || !s.inKorea || !s.mine?.length || warn.off) return;
      const top = s.mine.slice().sort((a, b) => b.levelRank - a.levelRank)[0];
      const more = s.mine.length - 1;
      items.push({
        key: `warn:${top.region}:${top.kind}${top.level}`,
        persist: true,                       // 상태이므로 계속 다시 뜬다
        alert: top.levelRank >= 3,           // 경보급만 붉게
        ms: BANNER_ALERT_MS,
        html: `<span class="dot" style="background:${top.color}"></span>`
            /* ⚠️ 영어 설정에서 등급이 한국어로 새어 나왔다 ("Heat 주의보").
               자료에 levelEn 이 없어서 level 을 그대로 붙이고 있었다. */
            + `${top.icon} ${ko ? top.kind + top.level
                                : `${top.kindEn || top.kind} ${levelEn(top.level)}`}`
            /* ⚠️ 구역명(양산시·서울서남권)은 기상청이 영문을 주지 않는다.
               로마자를 손으로 지어내면 틀린 지명이 되므로 한국어를 그대로 둔다.
               영어 사용자에게도 "Heat Advisory · 양산시" 가
               "Heat 주의보 · 양산시" 보다 낫다. */
            /* ⚠️ 여기 개수는 '내 지역의 다른 특보 건수'다.
               배너 오른쪽 끝의 +N(_counter)은 '대기 중인 다른 소식 수'로 뜻이 다르다.
               둘 다 bn-n 클래스를 쓰면 "+1 +1"처럼 보인다 — 본문 글자로 붙인다. */
            + ` · ${top.region}${more > 0 ? (ko ? ` 외 ${more}건` : ` +${more} more`) : ''}`,
        go: () => warnUI.open(),
      });
    });

    // ── 2. 큰 지진 — 긴급이다. 확대 상태와 무관하게 띄운다 ──
    safe(() => {
      const q = quakes.headline?.();
      if (q) items.push({
        key: `q:${q.id}`,
        alert: true,
        ms: BANNER_ALERT_MS,
        html: `<span class="dot red"></span>${q.name} · ${q.data[i18n.t.F.place]} · ${i18n.rel(q.data._time)}`,
        go: () => { flyTo(q.lon, q.lat, 900_000); store.select(q); },
      });
    });

    /* ⚠️ 하단 배너는 '긴급'만 띄운다 — 쓰나미·큰 지진.
       예전엔 대형 산불·발사 예정 같은 '정보성' 항목도 띄웠는데, 평소에도 하단에
       배너가 계속 떠 있어 산만하다는 요청으로 뺐다(2026-07-28).
       산불·발사는 지도와 이벤트 메뉴에서 그대로 볼 수 있다 — 감시를 끈 게 아니라
       '하단에 자동으로 밀어 올리는 것'만 멈춘 것이다. */

    /* ⚠️ 이미 보여준 것은 큐에 넣지 않는다. 같은 경보를 계속 다시 띄우면
       새로 들어온 소식이 그 뒤에 묻힌다. 지난 것은 이벤트 메뉴에서 본다. */
    // persist 항목(기상특보)은 '지속되는 상태'라 이미 보여줬어도 다시 올린다
    const fresh = items.filter(it => it.key && (it.persist || !this._seen.has(it.key)));
    // 기다리는 것이 있으면 순서를 유지하고, 새 것만 뒤에 붙인다
    const pending = new Set(this._queue.map(it => it.key));
    fresh.forEach(it => { if (!pending.has(it.key)) this._queue.push(it); });

    /* ⚠️ _seen 을 무한히 키우지 않는다. 며칠 켜두면 메모리가 는다.
       경보 id 는 짧으므로 넉넉히 300개까지만 기억한다. */
    if (this._seen.size > 300) {
      this._seen = new Set([...this._seen].slice(-150));
    }
  },

  /** 남은 건수 — 여러 건이 대기 중일 때만 */
  _counter() {
    if (this._queue.length < 2) return '';
    return `<em class="bn-n">+${this._queue.length - 1}</em>`;
  },

  _cycle() {
    clearTimeout(this._timer);
    const box = $('#banner');
    if (!box) return;

    const it = this._queue[0];
    if (!it) {
      // 보여줄 새 소식이 없다 — 비워두고 기다린다 (같은 걸 다시 띄우지 않는다)
      box.classList.remove('on', 'alert');
      this._timer = setTimeout(() => this._cycle(), 3000);
      return;
    }

    box.innerHTML = it.html + this._counter();
    box.classList.toggle('alert', !!it.alert);
    box.classList.add('on');
    box.onclick = it.go;

    this._timer = setTimeout(() => {
      box.classList.remove('on');           // 사라진다 (CSS 전환)
      // 보여줬으므로 큐에서 빼고 기억해 둔다 — 다시 올라오지 않는다
      this._queue.shift();
      /* ⚠️ 기상특보는 기억하지 않는다. 지속되는 상태라 다음 rebuild 에서
         다시 큐에 올라와야 한다 — 폭염이 계속되는데 표시가 사라지면 안 된다. */
      if (!it.persist) this._seen.add(it.key);
      this._timer = setTimeout(() => this._cycle(), BANNER_GAP_MS);
    }, it.ms);
  },

  /* 예전 이름을 남겨둔다 — 다른 곳에서 부르고 있을 수 있다 */
  render() { this.rebuild(); },
};

/* ══════════════════════════════════════════════════════════════
   설정
   ══════════════════════════════════════════════════════════════ */
export const settings = {
  init() {
    $('#gear').onclick = () => $('#settings').classList.toggle('up');
    $('#setClose').onclick = () => $('#settings').classList.remove('up');
    this.render();
    i18n.onChange(() => this.render());
    store.on('tier', () => this.render());
  },
  render() {
    const t = i18n.t;
    const ko = i18n.lang === 'ko';
    $('#setTitle').textContent = t.settings;
    $('#labLang').textContent = t.language;
    $('#labUnit').textContent = t.tempUnit;
    $('#labTier').textContent = t.tier;

    seg('#segLang', [['ko','한국어'],['en','English']], i18n.lang, v => i18n.setLang(v));
    seg('#segUnit', [['c','°C'],['f','°F']], i18n.unit, v => i18n.setUnit(v));

    /* ── 요금제 ──
       ⚠️ 예전엔 여기에 "무료 사용자 / 구독 사용자" 토글이 그대로 있었다.
          그건 게이팅 동작을 확인하려고 만든 개발 도구다. 일반 사용자에게 보이면
          "누르면 공짜로 열리는 버튼"이 되고, 실제 결제는 아무 의미가 없어진다.
          → 일반 화면에는 구독 상태와 [구독하기] 버튼만 둔다.
            개발 토글은 HUD(개발용)를 켠 상태에서만 나타난다. */
    renderTierRow(ko);

    /* 위성 통과 알림 — 몇 분 전에 알릴지 */
    const ko2 = i18n.lang === 'ko';
    $('#labAlarm').textContent = ko2 ? '위성 통과 알림' : 'Satellite pass alert';
    seg('#segAlarm', LEAD_CHOICES.map(m => [m, ko2 ? `${m}분 전` : `${m} min`]),
        alarms.lead, v => { alarms.setLead(Number(v)); this.render(); });
    /* ⚠️ 위성 통과 알림은 **앱이 열려 있을 때만** 울린다(타이머).
       앱이 닫혀도 오는 것은 웹푸시이고 그건 별도 화면이다 —
       한 줄에 섞으면 "알림을 켰으니 닫아도 오겠지"로 읽힌다. */
    const alertBtn = $('#setAlertsBtn');
    if (alertBtn) {
      alertBtn.textContent = ko2 ? '앱이 닫혀 있어도 오는 알림 ›' : 'Alerts while the app is closed ›';
      alertBtn.onclick = async () => {
        $('#settings').classList.remove('up');
        const { alertsSheet } = await import('./ui-alerts.js');
        alertsSheet.open();
      };
    }

    const st = alarms.status();
    $('#alarmHint').textContent = st.ok
      ? (ko2 ? '앱이 열려 있을 때 울립니다. 통과 예보에서 종을 눌러 예약하세요.'
             : 'Fires while the app is open. Tap the bell in pass predictions.')
      : st.msg;
  },
};
function seg(sel, opts, cur, cb) {
  const box = $(sel);
  box.innerHTML = '';
  opts.forEach(([v, label]) => {
    const b = el('button', 'seg' + (v === cur ? ' on' : ''), label);
    b.onclick = () => cb(v);
    box.appendChild(b);
  });
}

/** 요금제 줄 — 구독 상태 + [구독하기] (개발 토글은 HUD 켰을 때만) */
function renderTierRow(ko) {
  const box = $('#segTier');
  if (!box) return;
  box.innerHTML = '';
  box.className = 'tier-box';

  const paid = store.isPaid();
  const badge = el('span', 'tier-badge' + (paid ? ' on' : ''),
    paid ? (ko ? '구독 중' : 'Pro') : (ko ? '무료' : 'Free'));
  box.appendChild(badge);

  if (!paid) {
    const btn = el('button', 'tier-cta', ko ? '구독하기' : 'Subscribe');
    btn.onclick = async () => {
      $('#settings').classList.remove('up');
      const { subscribeSheet } = await import('./ui-subscribe.js');
      subscribeSheet.open();
    };
    box.appendChild(btn);
  } else {
    const btn = el('button', 'tier-cta ghost', ko ? '구독 관리' : 'Manage');
    btn.onclick = async () => {
      $('#settings').classList.remove('up');
      const { subscribeSheet } = await import('./ui-subscribe.js');
      subscribeSheet.open();
    };
    box.appendChild(btn);
  }

  const hint = $('#tierHint');
  if (hint) {
    hint.textContent = paid
      ? (ko ? '모든 레이어가 열려 있습니다.' : 'All layers unlocked.')
      : (ko ? '구름·날씨·태풍·쓰나미·3D 학습은 구독 없이 계속 무료입니다.'
            : 'Clouds, weather, cyclones, tsunami alerts and 3D lessons stay free.');
  }

  /* ⚠️ 무료/유료 '미리보기' 토글은 출시 전 제거했다 (2026-07-28).
     결제가 붙으면 누구나 눌러 유료 기능을 여는 구멍이 되므로, 출시 화면에는 두지 않는다.
     티어는 로그인/구독 상태(auth)만으로 정해진다 — 게스트·무료는 free. */
}

/* ══════════════════════════════════════════════════════════════
   개발용 HUD
   ══════════════════════════════════════════════════════════════ */
export const hud = {
  init() {
    /* ⚠️ 개발용 HUD 는 기본으로 숨긴다.
       고도·프레임·해상도·레이어 ID 가 상시로 떠 있으면 아무리 폰트를 다듬어도
       "개발 도구를 켜둔 화면"으로 보인다. 리빙어스와 가장 크게 벌어지던 지점이다.
       필요할 때만 켜고, 선택은 기억한다. */
    const showHud = on => {
      $('#hud').style.display = on ? 'block' : 'none';
      $('#hudShow').style.display = on ? 'none' : 'block';
      localStorage.setItem('earthus.hud', on ? 'on' : 'off');
    };
    showHud(localStorage.getItem('earthus.hud') === 'on');
    $('#hudHide').onclick = () => showHud(false);
    $('#hudShow').onclick = () => showHud(true);
    document.querySelectorAll('#hud [data-jump]').forEach(b => {
      b.onclick = () => {
        const v = { globe:[127,25,fitGlobeHeight()], country:[128,36,1_300_000], province:[127,37.4,380_000] }[b.dataset.jump];
        flyTo(v[0], v[1], v[2]);
      };
    });
  },
  update() {
    /* 보이지 않는 누적 프레임 번호 — 발열 전수 점검용이다.
       ⚠️ fps 글자는 렌더가 멈추면 마지막 값에서 얼어 "11fps"처럼 남는다.
          그 글자만 보고 계속 돈다고 판정하면 틀린다. 실제 frameNumber 를 DOM 에
          남겨 두면 자동화·실기기 검사에서 두 시점의 차이로 완전 유휴를 확인할 수 있다. */
    $('#hud').dataset.frame = String(scene.frameState.frameNumber);
    $('#hAlt').textContent = (store.height / 1000).toFixed(0) + ' km';
    $('#hMode').textContent = store.mode === 'ambient'
      ? 'AMBIENT'
      : (store.pinsVisible() ? (store.cluster ? 'EXPLORE·클러스터' : 'EXPLORE·개별') : 'EXPLORE·핀없음');
    $('#hPins').textContent = registry.visibleCount();
    $('#hFps').textContent = renderQuality.line();
    $('#hRes').textContent = renderQuality.resLine();
    const s = registry.status;
    $('#hApi').innerHTML = Object.entries(s)
      .map(([k, v]) => `<span class="s-${v}">${k}</span>`).join(' ');
  },
};

/* ── 토스트 ─────────────────────────────────────────────────── */
let toastTimer;
/** 좌표를 도분초 대신 읽기 쉬운 소수 + 반구 표기로 */
export function fmtCoord(lat, lon) {
  const ko = i18n.lang === 'ko';
  const ns = lat >= 0 ? (ko ? '북위' : 'N') : (ko ? '남위' : 'S');
  const ew = lon >= 0 ? (ko ? '동경' : 'E') : (ko ? '서경' : 'W');
  return ko
    ? `${ns} ${Math.abs(lat).toFixed(3)}° ${ew} ${Math.abs(lon).toFixed(3)}°`
    : `${Math.abs(lat).toFixed(3)}°${ns} ${Math.abs(lon).toFixed(3)}°${ew}`;
}

/* 12시간 강수확률 막대.
   ⚠️ "몇 시에 비가 온다"고 쓰지 말 것 — 확률만 보여주고 판단은 사용자 몫이다. */
function renderRainBars(w) {
  const box = $('#rainbars');
  if (!box) return;
  const H = w.hourly;
  if (!H?.precipitation_probability?.length) { box.style.display = 'none'; return; }
  const now = Date.now();
  const rows = H.time.map((t, i) => ({
    at: new Date(t).getTime(),
    p: H.precipitation_probability[i] ?? 0,
    mm: H.precipitation?.[i] ?? 0,
  })).filter(r => r.at >= now - 3600_000).slice(0, 12);
  if (!rows.length || Math.max(...rows.map(r => r.p)) < 5) { box.style.display = 'none'; return; }

  /* ⚠️ 예전에는 두 줄 모두 단위 없는 숫자였다.
     위는 확률, 아래는 시각인데 둘 다 "52 / 14" 처럼 보여서
     "두 번째 줄이 mm 인가?" 하는 질문을 받았다. 물어봐야 아는 표시는 실패한 표시다.
     → 확률에 %, 시각에 시(h)를 붙이고, 강수량은 있을 때만 mm 로 따로 보여준다. */
  const ko = i18n.lang === 'ko';
  const anyMm = rows.some(r => r.mm > 0);

  box.style.display = 'block';
  box.innerHTML =
    `<div class="rb-title">${ko ? '시간별 강수확률' : 'Hourly chance of rain'}`
    + `<span class="rb-legend">${anyMm
        ? (ko ? '% 확률 · mm 예상량' : '% chance · mm expected')
        : (ko ? '% 확률' : '% chance')}</span></div>`
    + '<div class="rb-row">' + rows.map(r => {
      const h = new Date(r.at).getHours();
      return `
      <div class="rb">
        <div class="rb-track"><div class="rb-fill${r.p >= 60 ? ' hi' : ''}" style="height:${Math.max(2, r.p)}%"></div></div>
        <div class="rb-p">${r.p}%</div>
        ${anyMm ? `<div class="rb-mm">${r.mm > 0 ? `${r.mm.toFixed(1)}mm` : '·'}</div>` : ''}
        <div class="rb-t">${ko ? `${h}시` : `${h}h`}</div>
      </div>`;
    }).join('') + '</div>'
    /* 강수는 "확률"로만 말한다 — 사용자 지시. 단정하면 안 틀릴 수가 없다. */
    + `<div class="rb-note">${ko
        ? '확률은 그 시간에 비가 올 가능성입니다. mm 는 오는 경우의 예상 강수량이며, 확률이 낮으면 실제로 안 올 수 있습니다.'
        : 'Percentages are the chance of rain in that hour. mm is the expected amount if it does rain — a low chance means it may not.'}</div>`;
}

export function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}

/* ── 상태 전환 (Ambient ↔ Explore) ──────────────────────────── */
export function bindModeTransition() {
  store.on('camera', (h, mode) => {
    $('#ambient').classList.toggle('hidden', mode === 'explore');
    // 메뉴는 확대 여부와 무관하게 항상 쓸 수 있다 (손잡이만 보인다)
    $('#explore').classList.toggle('on', mode === 'explore');
    /* 오늘의 볼거리 칩도 ambient 와 함께 접는다.
       ⚠️ 확대해서 한 곳을 보고 있는 사람에게 "저 반대편을 보라"는 칩은 방해다.
          (다시 멀어지면 되돌아온다 — 지웠다 만들지 않고 보이기만 바꾼다) */
    const spot = $('#spotChips');
    if (spot && spot.children.length) spot.classList.toggle('on', mode !== 'explore');
    /* 화면 상태를 body 에도 남긴다 — CSS 만으로 겹침을 풀 수 있게.
       (바람 범례가 Ambient 의 큰 온도 숫자와 겹치던 문제. app.css 맨 끝 참고) */
    document.body.classList.toggle('is-ambient', mode !== 'explore');
  });
  /* ⚠️ 초기값을 여기서 한 번 세운다.
     store 의 'camera' 이벤트는 **카메라가 움직여야** 처음 불린다. 그때까지
     body 에 아무 표시도 없어서, 첫 화면에서 바람을 켜면 범례가 잠깐 겹쳐 보였다. */
  document.body.classList.toggle('is-ambient', store.mode !== 'explore');
}
