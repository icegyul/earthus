/* 서핑 시트 — 이 해변에 스웰이 들어오는가
 *
 * 화면의 뼈대는 셋이다. 하나로 합치지 않는다:
 *     ① 스웰이 들어오는가   (스웰 방향 vs 해변이 보는 방향)
 *     ② 파면이 깔끔한가     (바람이 육풍인가 해풍인가)
 *     ③ 어떤 파도인가       (주기 — 잡파인가 너울인가)
 *
 * ⚠️ **점수를 만들지 않는다.** "서핑 지수 7.2점"은 근거 없이 권위를 갖고
 *    무엇 때문에 7.2인지 아무도 모른다. 셋을 각각 말하고 합치는 판단은 타는 사람이 한다.
 *
 * ⚠️ **"타기 좋습니다"라고 말하지 않는다.** 바다에서는 사람이 죽는다.
 *    이안류·조류·수심·바닥은 우리가 모르는 값이고, 모르면서 권할 수 없다.
 */

import { i18n } from './i18n.js';
import { beaches, shortName, shortRegion } from './beaches.js';
import { judge, SURF_RULES } from './surf.js';
import { get, nearest, distKm } from './korea.js';
import { myLocation } from './mylocation.js';
import { viewer, onCameraIdle } from './viewer.js';
import { intro } from './intro.js';
/* 부이 실측을 함께 보여주려고 더 가져온다 — 아래 nearestBuoy 참고 */
import { API } from './config.js';
import { nearestRip, RIP_COLOR, RIP_EN } from './coast.js';
import { fetchT } from './net.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const DIR8 = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
const DIR8_EN = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const dirText = (deg, ko) => deg == null ? '—'
  : (ko ? DIR8 : DIR8_EN)[Math.round(deg / 45) % 8];

/* 바람 관측소를 해변에서 얼마나 멀리까지 찾을까.
   ⚠️ 너무 멀면 산 너머 바람을 해변 바람이라고 말하게 된다. */
const WIND_MAX_KM = 25;

const N_SHOW = 12;

/* 서핑 메뉴를 눌렀을 때 내려갈 높이(m).
   받은 지적: "서핑 메뉴 누르면 이렇게 확대했을 때 위치랑 정보를 나오게 해달라고"
   ⚠️ 목록만 띄우면 **그 해변이 어디인지**를 알 수 없다. 이름을 알아도 처음 가는
      사람에게는 좌표가 없는 것과 같다. 지도에 찍어야 "여기서 저기까지"가 보인다.
   ⚠️ 실측: 보내 준 화면이 강릉~양양 해안 약 90km 를 담고 있다. 120km 면
      해변 대여섯 곳과 해안선의 방향이 함께 보인다. 더 내려가면 한 곳만 남는다. */
const ZOOM_M = 120_000;

/* 이 높이보다 이미 낮으면 카메라를 건드리지 않는다.
   ⚠️ 사용자가 직접 확대해 둔 자리를 빼앗으면 안 된다 — 보고 있던 곳이 사라진다. */
const ZOOM_SKIP_M = 300_000;

/* 지도 위 표시가 보이는 거리. ⚠️ 전지구에서 해변 12개 이름표가 뜨면 지구가 안 보인다. */
const MARK_MAX_M = 1_400_000;

/* 이 높이보다 위에서는 **권역 대표 하나씩**만 찍는다.
   받은 지적: "이렇게 한반도를 보면 다 나올 필요 없어. 동서남 표차가 큰 대표 지역만
              보여줘도 돼. 그럼 사용자가 큰 파도가 어딘지 금방 찾겠지. 어차피 그 근처
              바다는 파도 차이가 크게 없거든. 디테일하게 보고 싶으면 확대해서 보겠지"
   ⚠️ 실측(고도 929km, 한반도 전체): 해변 12개가 전부 동해 남부 한 점에 뭉쳐
      이름표가 서로를 덮었다 — 대탄·조살·칠포·영덕이 한 덩어리로 못 읽었다.
      그 화면에서 알고 싶은 건 "어느 바다가 큰가"지 "칠포가 0.3m"가 아니다.
   ⚠️ 권역을 더 뭉치지는 않는다. 동해를 하나로 합치자는 생각이 들 수 있는데,
      태풍·저기압 위치에 따라 **동해 북부와 남부는 실제로 갈린다.** */
const REGION_M = 300_000;

/* 권역마다 몇 곳을 재서 대표값을 낼까.
   ⚠️ 한 곳만 재면 그 지점의 사정(만·방파제)이 권역 전체가 된다.
   ⚠️ 많이 재면 요청이 늘어난다. 권역 8곳 × 3 = 24지점 = 한 번에 두 묶음이면 끝난다. */
const REGION_SAMPLES = 3;

/* 지도를 이만큼 옮기면 "여긴 다른 지역"으로 보고 버튼을 띄운다. */
const AWAY_KM = 90;

/* 해변 핀 — 네이버 지도처럼 **동그란 아이콘**으로 찍는다.
   받은 요청: 보내 준 네이버 화면처럼 "이렇게 표시해주고 옆에 정보를".
   ⚠️ 그림 파일을 쓰지 않는다. 캔버스로 그려 dataURI 로 만든다 —
      파일 하나를 더 받게 하면 그만큼 늦고, 실패하면 표시가 통째로 사라진다.
   ⚠️ 한 번만 만들어 재사용한다. 해변마다 그리면 12번 그리게 된다. */
let _pin = null;
function pinImage() {
  if (_pin) return _pin;
  const S = 48, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const r = S / 2 - 3;
  g.beginPath(); g.arc(S / 2, S / 2, r, 0, Math.PI * 2);
  g.fillStyle = '#2aa8bd'; g.fill();
  g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.92)'; g.stroke();
  // 파도 — 물결 두 줄
  g.strokeStyle = '#fff'; g.lineWidth = 3.2; g.lineCap = 'round';
  [-5, 4].forEach(dy => {
    g.beginPath();
    g.moveTo(S / 2 - 11, S / 2 + dy);
    g.quadraticCurveTo(S / 2 - 5.5, S / 2 + dy - 5, S / 2, S / 2 + dy);
    g.quadraticCurveTo(S / 2 + 5.5, S / 2 + dy + 5, S / 2 + 11, S / 2 + dy);
    g.stroke();
  });
  _pin = c.toDataURL('image/png');
  return _pin;
}

export const surfPanel = {
  _tab: 'near',
  _ready: false,
  _wind: null,

  _region: null,

  init() {
    document.addEventListener('click', async (e) => {
      if (e.target.closest('[data-sf-grow]')) { this.toggleHeight(); return; }
      if (e.target.closest('#sfHere')) { this.here(); return; }
      const t = e.target.closest('[data-sf-tab]');
      if (t) { this._tab = t.dataset.sfTab; this.render(); return; }
      const r = e.target.closest('[data-sf-region]');
      if (r) {
        // 빈 값이면 "이 주변"으로 돌아간다 (지도·내 위치 기준)
        this._region = r.dataset.sfRegion || null;
        const body = $('#sfBody');
        if (body) body.insertAdjacentHTML('afterbegin',
          `<p class="mt-load sf-loading">${i18n.lang === 'ko' ? '받는 중…' : 'Loading…'}</p>`);
        await this._fill();
        this.render();
        // ⚠️ 지역을 바꾸면 지도 표시도 바뀌어야 한다. 안 바꾸면 목록은 남해인데
        //    지도에는 동해 해변이 찍혀 있게 된다.
        this._marks();
        this._zoom(true);
      }
    });
    /* 지도를 옮기면 화면이 따라와야 한다.
       ⚠️ 매 프레임이 아니라 **멈췄을 때만** 본다. 카메라가 움직이는 동안 전 지점을
          다시 계산하는 것이 이 앱 발열의 원인이었다(pointLayer 머리말 참고). */
    onCameraIdle(() => this._onCamera());
    return this;
  },

  /* 지도가 멈췄다 — 무엇을 보여줄지 다시 정한다 */
  _onCamera() {
    const el = $('#sfSheet');
    if (!el?.classList.contains('up')) { this._hereBtn(false); return; }
    const h = viewer.camera?.positionCartographic?.height ?? 0;
    const want = h > REGION_M ? 'region' : 'beach';
    // 높이가 문턱을 넘나들면 표시를 갈아 끼운다
    /* ⚠️ 지도만 갈아 끼우면 시트는 그대로다 — 지도는 해변을 찍는데 목록은
       바다별 표를 보여주는 어긋남이 낚시 화면에서 실측으로 걸렸다. */
    if (want !== this._markMode) { this._marks(); this.render(); }
    if (want === 'region') { this._hereBtn(false); return; }

    /* 받은 지적: "표시가 안 나온 지역으로 가면 정보보기 버튼 나와서 나오게 해주면 되"
       ⚠️ 여기서 **자동으로 다시 받지 않는다.** 지도를 조금 미는 것만으로 목록이
          바뀌면 읽던 것을 잃는다. 물어보고, 누를 때만 바꾼다. */
    const c = this._center();
    let away = Infinity;
    try {
      const p = viewer.camera.positionCartographic;
      if (c && p) away = distKm(Cesium.Math.toDegrees(p.latitude),
                                Cesium.Math.toDegrees(p.longitude), c.lat, c.lon);
    } catch (_) { }
    this._hereBtn(away > AWAY_KM);
  },

  _hereBtn(on) {
    let b = document.getElementById('sfHere');
    if (!on) { b?.classList.remove('on'); return; }
    if (!b) {
      b = document.createElement('button');
      b.id = 'sfHere';
      document.body.appendChild(b);
    }
    b.textContent = i18n.lang === 'ko' ? '이 지역 해변 보기' : 'Search this area';
    b.classList.add('on');
  },

  /** 지금 보고 있는 지도 기준으로 다시 고른다.
      ⚠️ 카메라는 **건드리지 않는다.** 사용자가 고른 자리다. */
  async here() {
    this._region = null;
    this._hereBtn(false);
    const body = $('#sfBody');
    if (body) body.insertAdjacentHTML('afterbegin',
      `<p class="mt-load sf-loading">${i18n.lang === 'ko' ? '받는 중…' : 'Loading…'}</p>`);
    await this._fill();
    this.render();
    this._marks();
  },

  async open() {
    /* ⚠️ 기본은 **낮은 상태**다. 시트가 화면을 덮으면 지도에 찍은 해변이
       하나도 안 보인다 — 받은 요청("확대했을 때 위치랑 정보")이 지도 쪽이었다.
       목록을 길게 보고 싶으면 손잡이를 눌러 키운다. */
    $('#sfSheet')?.classList.add('up', 'peek');
    /* ⚠️⚠️ 인트로 회전을 **여기서** 세운다. _zoom() 에서 세우면 늦다 —
       기준점(_anchor)이 카메라 위치를 읽는데, 그 사이에도 지구가 돌고 있어
       기준이 실제로 보고 있던 곳에서 밀린다. 실측 0.48° (약 42km). */
    intro.stop();
    const ko = i18n.lang === 'ko';
    const body = $('#sfBody');
    if (!this._ready) body.innerHTML =
      `<p class="mt-load">${ko ? '해변 자료를 받는 중…' : 'Loading…'}</p>`;
    try {
      await beaches.load();
      /* 바람은 기상청 AWS 736지점에서 가져온다.
         ⚠️ 없어도 화면은 뜬다 — 바람 없이도 스웰·주기는 말할 수 있다. */
      try { this._wind = await get('aws'); } catch (_) { this._wind = null; }
      await this._fill();
      this._ready = true;
      this.render();
      /* ⚠️ 지도는 목록이 준비된 **뒤에** 옮긴다. 먼저 날아가면 도착했을 때
         아직 아무 표시도 없어서 "빈 바다로 보내진" 것처럼 보인다. */
      this._marks();
      setTimeout(() => this._zoom(), 380);   // 시트가 자리를 잡은 뒤에 잰다
    } catch (e) {
      body.innerHTML = `<p class="mt-load">${ko ? '해변 자료를 받지 못했습니다'
        : 'Could not load'}<br><small>${esc(e.message)}</small></p>`;
    }
  },

  close() {
    $('#sfSheet')?.classList.remove('up');
    this._clearMarks();
    this._hereBtn(false);
  },

  /* ══ 지도로 내려간다 ══════════════════════════════════════════════
     ⚠️ 이미 가까이 보고 있으면 건드리지 않는다 — 사용자가 맞춰 둔 자리를
        빼앗는 것은 도와주는 게 아니다. */
  _zoom(force) {
    const at = this._at;
    if (!at) return;
    try {
      const h = viewer.camera.positionCartographic?.height ?? Infinity;
      /* ⚠️ 지역을 **직접 고른** 경우와 시트 높이를 바꾼 경우는 가까이 있어도 옮긴다.
         남해를 눌렀는데 동해를 계속 보고 있으면 무엇을 고른 건지 알 수 없고,
         시트를 낮췄는데 해변이 그대로 시트 자리에 있으면 낮춘 뜻이 없다. */
      if (!force && at.from !== 'region' && h < ZOOM_SKIP_M) return;
      /* ⚠️⚠️ **인트로 회전을 먼저 세운다.** 이게 없으면 날아가 도착한 뒤에도
         지구가 계속 돌아 해변이 화면 밖으로 밀려난다.
         실측: 앵커는 128.95°E 였는데 촬영 시점 카메라는 131.43°E — 2.5° 밀렸고
         해변 12곳이 전부 화면 왼쪽 밖(x = -1165px)에 있었다. 표시는 다 만들어졌는데
         하나도 안 보였다. 시트가 열리면 drift 는 멈추지만(panels 의 OPEN_PANELS)
         **intro 는 아무도 세우지 않는다.**
         ⚠️ 트윈도 끊는다 — 남아 있으면 flyTo 가 끝나자마자 카메라를 도로 가져간다. */
      intro.stop();
      viewer.camera.cancelFlight?.();
      viewer.scene.tweens?.removeAll?.();
      /* ⚠️⚠️ 기준점이 아니라 **고른 해변들의 한가운데**로 간다.
         기준점은 "어느 해변을 고를까"를 정하는 값이고, 카메라가 가야 할 곳은
         "고른 해변들이 다 보이는 자리"다. 둘을 같게 두면 목록에는 있는데
         지도에는 없는 해변이 생긴다 — 실측에서 12곳이 전부 화면 왼쪽으로 밀렸다. */
      const c = this._center() || at;
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(c.lon, c.lat - this._sheetShiftDeg(), ZOOM_M),
        duration: 1.6,
      });
    } catch (_) { /* 뷰어가 아직이면 목록만 보여준다 */ }
  },

  /** 지도에 찍은 해변들의 한가운데 */
  _center() {
    const l = this._pick || [];
    if (!l.length) return null;
    return { lat: l.reduce((s, b) => s + b.lat, 0) / l.length,
             lon: l.reduce((s, b) => s + b.lon, 0) / l.length };
  },

  /* 시트에 가리지 않는 자리로 지도를 밀어 올리는 양(위도 °).
     ⚠️⚠️ 이게 없으면 해변이 **정확히 시트 뒤에** 놓인다. 카메라는 화면 한가운데를
        보는데, 화면 아래 절반은 시트가 덮고 있기 때문이다.
        실측: 시트를 열자 표시 12개가 다 만들어졌는데 하나도 안 보였다.
     ⚠️ 시트 높이를 실제로 재서 계산한다 — 화면 크기·기기마다 다르다. */
  _sheetShiftDeg() {
    const vh = window.innerHeight || 900;
    const el = $('#sfSheet');
    const sheetTop = el ? el.getBoundingClientRect().top : vh;
    const visibleMid = Math.max(0, sheetTop) / 2;      // 보이는 지도의 세로 한가운데
    const shiftPx = vh / 2 - visibleMid;               // 화면 중앙에서 이만큼 위로 올려야 한다
    if (!(shiftPx > 0)) return 0;
    const fovy = viewer.camera?.frustum?.fovy ?? (Math.PI / 3);
    const groundPerPx = (2 * ZOOM_M * Math.tan(fovy / 2)) / vh;   // m/px
    // 카메라를 남쪽으로 밀면 기준점이 화면 위쪽으로 올라온다
    return (shiftPx * groundPerPx) / 111_320;
  },

  /* 시트를 낮췄다 키웠다. 받은 요청이 "확대했을 때 **위치**랑 정보"였다 —
     지도를 못 보면 위치를 보여주는 뜻이 없다. */
  toggleHeight() {
    const el = $('#sfSheet');
    if (!el) return;
    el.classList.toggle('peek');
    this.render();
    /* ⚠️ 시트가 다 움직인 **뒤에** 재야 한다. 애니메이션 도중에 재면
       지금 높이가 아니라 지나가는 높이가 잡힌다. */
    setTimeout(() => this._zoom(true), 380);
  },

  /* ══ 해변을 지도에 찍는다 ═════════════════════════════════════════
     ⚠️ 이름만 찍지 않는다. 받은 요청이 "위치**랑 정보**"였다 —
        어디인지와 지금 어떤지가 같이 보여야 목록을 안 열어도 읽힌다.
     ⚠️ 너울 높이와 수온만 올린다. 카드에 있는 것을 다 올리면 이름표가 지도를 덮는다. */
  _marks() {
    /* 높이에 따라 **무엇을 찍을지가 다르다.**
       멀리서는 "어느 바다가 큰가", 가까이서는 "이 해변이 지금 어떤가"를 묻는다.
       ⚠️ 같은 것을 크기만 줄여 보여주면 둘 다 못 읽는다 — 실측에서 12개가 한 점에 뭉쳤다. */
    const h = viewer.camera?.positionCartographic?.height ?? 0;
    const mode = h > REGION_M ? 'region' : 'beach';
    this._markMode = mode;
    if (mode === 'region') { this._regionsDrawn = false; this._markRegions(); return; }

    this._clearMarks();
    const ko = i18n.lang === 'ko';
    const list = this._pick || [];
    if (!list.length) return;
    try {
      this._ensureDs();
      const img = pinImage();
      /* ⚠️⚠️ 이름표가 서로 **겹친다.** 한국 동해안은 해변이 5km 간격으로 붙어 있어
         120km 상공에서 33px 밖에 안 떨어진다 — 이름표 높이가 20px 이니 다 포개진다.
         실측 첫 화면: 사천·사근진·경포·강문 넷이 한 덩어리로 뭉개져 못 읽었다.
         → 위에서부터 **좌우로 번갈아** 놓는다. 같은 쪽끼리는 두 칸씩 벌어진다.
         ⚠️ 매 프레임 화면좌표를 재서 겹치는 것을 숨기는 방법도 있지만 쓰지 않는다 —
            카메라가 움직일 때마다 전 지점을 다시 계산하는 것이 이 앱 발열의 원인이었다.
            좌우 번갈이는 한 번 정하면 공짜다. */
      const ordered = [...list].sort((a, b) => b.lat - a.lat);

      /* ⚠️ 받은 지시: "해변, 해수욕장은 빼고 이름만 가자."
         ⚠️⚠️ 그래서 **자료 쪽에서** 같은 이름이 두 번 나오지 않게 해야 한다.
            한때 "망상 해수욕장"(37.594)과 "망상해수욕장"(37.598)이 600m 떨어져
            둘 다 살아남아 지도에 "망상"이 두 번 떴다. 화면에서 긴 이름으로
            되돌리는 방식은 지시를 어기는 것이므로, dedup-beaches.py 의
            SAME_NAME_M(1.5km) 규칙으로 자료에서 합쳤다. 지금 겹치는 쌍은 0 이다. */
      /* ⚠️⚠️ 좌우 번갈이만으로는 부족한 곳이 있다. 서해·남해는 해변이 촘촘해
         120km 상공에서 이름표가 서로를 덮는다(낚시 화면에서 먼저 걸렸다).
         → 앞서 이름을 단 곳에서 **실거리로 멀리 떨어진 것만** 이름을 단다.
           나머지는 핀만 찍는다 — 있다는 건 보이고, 확대하면 이름이 나온다.
         ⚠️ 화면 좌표가 아니라 실거리로 판단한다. 카메라가 움직일 때마다 다시
            계산하지 않기 위해서다(이 앱 발열의 원인이었다). */
      const LABEL_GAP_KM = 4;
      const labeled = [];
      ordered.forEach((b, i) => {
        const far = labeled.every(p => distKm(p.lat, p.lon, b.lat, b.lon) >= LABEL_GAP_KM);
        if (far) labeled.push(b);
        const sea = beaches._sea.get(b.name) || null;
        /* ⚠️ 값이 없으면 그 자리를 **비운다**. 0 으로 채우면 "파도가 없다"로 읽힌다.
           ⚠️ 받은 지시: 이름 **옆에** 정보. 두 줄로 쌓으면 지도가 글자로 덮인다.
              올리는 건 너울 높이·주기·수온까지다 — 카드에 있는 걸 다 올리지 않는다. */
        const bits = [];
        if (sea?.swellH != null) bits.push(`${sea.swellH.toFixed(1)}m`);
        if (sea?.sst != null) bits.push(`${sea.sst.toFixed(0)}°`);
        const text = shortName(b.name) + (bits.length ? '  ' + bits.join(' · ') : '');
        const right = i % 2 === 0;      // 위에서부터 오른쪽·왼쪽 번갈아
        this._ds.entities.add({
          id: `surf:${b.name}`,
          position: Cesium.Cartesian3.fromDegrees(b.lon, b.lat),
          /* ⚠️ 점이 아니라 **아이콘**이다. 점은 지진·부이·관측소와 구분이 안 된다.
             ⚠️ disableDepthTestDistance 를 크게 둬야 한다 — 안 그러면 해안선 지형에
                가려 바다 쪽 해변이 사라진다. */
          billboard: {
            image: img, width: 22, height: 22,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, MARK_MAX_M),
          },
          ...(far ? { label: {
            text,
            font: '600 11px -apple-system, sans-serif',
            fillColor: Cesium.Color.WHITE,
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString('#0b1a20').withAlpha(0.78),
            backgroundPadding: new Cesium.Cartesian2(6, 4),
            style: Cesium.LabelStyle.FILL,
            /* 핀 옆으로 붙인다 — 좌우 번갈아 두면 붙어 있는 해변끼리 안 포개진다 */
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: right ? Cesium.HorizontalOrigin.LEFT
                                    : Cesium.HorizontalOrigin.RIGHT,
            pixelOffset: new Cesium.Cartesian2(right ? 14 : -14, 0),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, MARK_MAX_M),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          } } : {}),
          // 누르면 목록의 그 카드로 데려간다 (main.js 의 onPick 참고)
          _beach: b.name,
        });
      });
    } catch (e) {
      console.warn('[서핑] 지도 표시 실패 —', e.message);
    }
  },

  _ensureDs() {
    if (!this._ds) {
      this._ds = new Cesium.CustomDataSource('surf');
      viewer.dataSources.add(this._ds);
    }
    return this._ds;
  },

  /* ══ 권역 대표 ════════════════════════════════════════════════════
     한반도 전체가 보이는 높이에서는 권역마다 하나씩만 찍는다.

     ⚠️⚠️ 값은 **그 권역에서 가장 큰 너울**이다. 평균이 아니다.
        이 화면에서 묻는 것이 "큰 파도가 어디냐"이기 때문이다 —
        평균을 쓰면 한 곳만 크게 이는 날에 그 권역이 조용해 보인다.
     ⚠️ 몇 곳을 재서 낸 값인지 시트에 적는다. 권역 전체를 잰 것처럼 말하지 않는다.
     ⚠️ 한 곳만 재면 그 지점 사정(만·방파제)이 권역 전체가 된다 → 3곳을 고르게 뽑는다. */
  async _fillRegions() {
    if (this._regions && Date.now() - this._regionsAt < 10 * 60_000) return this._regions;
    const picks = [];
    const byRegion = new Map();
    beaches.regions().forEach(r => {
      const l = beaches.byRegion(r).filter(b => b.facing != null)
        .sort((a, b) => b.lat - a.lat);
      if (!l.length) return;
      // 권역 안에서 고르게 — 처음·가운데·끝
      const take = [];
      for (let i = 0; i < REGION_SAMPLES; i++) {
        const idx = Math.round((i / Math.max(1, REGION_SAMPLES - 1)) * (l.length - 1));
        if (!take.includes(l[idx])) take.push(l[idx]);
      }
      byRegion.set(r, take);
      picks.push(...take);
    });
    await beaches.sea(picks);

    const out = [];
    byRegion.forEach((take, r) => {
      const seas = take.map(b => beaches._sea.get(b.name)).filter(Boolean);
      /* ⚠️ 자료를 못 받은 권역은 **값 없이** 내보낸다. 0 으로 채우면 "잔잔하다"가 된다. */
      const sw = seas.map(s => s.swellH).filter(v => v != null);
      const st = seas.map(s => s.sst).filter(v => v != null);
      const all = beaches.byRegion(r).filter(b => b.facing != null);
      out.push({
        region: r,
        lat: all.reduce((s, b) => s + b.lat, 0) / all.length,
        lon: all.reduce((s, b) => s + b.lon, 0) / all.length,
        maxSwell: sw.length ? Math.max(...sw) : null,
        sst: st.length ? st.reduce((a, b) => a + b, 0) / st.length : null,
        sampled: seas.length, of: take.length, beaches: all.length,
      });
    });
    this._regions = out;
    this._regionsAt = Date.now();
    return out;
  },

  _markRegions() {
    const ko = i18n.lang === 'ko';
    this._fillRegions().then(rows => {
      // 그리는 사이에 확대했으면 그만둔다 (권역 표시가 개별 표시를 덮어쓰면 안 된다)
      if (this._markMode !== 'region') return;
      /* 값이 방금 도착했으면 시트도 다시 그린다 — 지도만 바뀌고 목록이 그대로면
         둘이 다른 말을 하게 된다. */
      if (!this._regionsDrawn) { this._regionsDrawn = true; this.render(); }
      this._clearMarks();
      this._ensureDs();
      const img = pinImage();
      /* 가장 큰 곳을 밝게. ⚠️ 색으로 "좋다/나쁘다"를 말하지 않는다 — 크기만 말한다. */
      const top = rows.reduce((a, b) => ((b.maxSwell ?? -1) > (a?.maxSwell ?? -1) ? b : a), null);
      rows.forEach((r, i) => {
        const bits = [];
        if (r.maxSwell != null) bits.push(`${r.maxSwell.toFixed(1)}m`);
        if (r.sst != null) bits.push(`${r.sst.toFixed(0)}°`);
        const isTop = top && r === top && r.maxSwell != null;
        const text = shortRegion(r.region) + (bits.length ? '  ' + bits.join(' · ') : '')
          + (isTop ? (ko ? '  ← 가장 큼' : '  ← highest') : '');
        this._ds.entities.add({
          id: `surf:r:${r.region}`,
          position: Cesium.Cartesian3.fromDegrees(r.lon, r.lat),
          billboard: {
            image: img, width: isTop ? 30 : 24, height: isTop ? 30 : 24,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          label: {
            text,
            font: `${isTop ? 700 : 600} 12px -apple-system, sans-serif`,
            fillColor: Cesium.Color.WHITE,
            showBackground: true,
            backgroundColor: Cesium.Color.fromCssColorString(isTop ? '#12333d' : '#0b1a20')
              .withAlpha(0.82),
            backgroundPadding: new Cesium.Cartesian2(7, 5),
            style: Cesium.LabelStyle.FILL,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            horizontalOrigin: i % 2 ? Cesium.HorizontalOrigin.RIGHT
                                    : Cesium.HorizontalOrigin.LEFT,
            pixelOffset: new Cesium.Cartesian2(i % 2 ? -16 : 16, 0),
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          // 누르면 그 권역으로 들어간다
          _surfRegion: r.region,
        });
      });
    }).catch(e => console.warn('[서핑] 권역 표시 실패 —', e.message));
  },

  /** 지도에서 권역을 눌렀을 때 — 그 권역으로 들어간다 */
  async openRegion(region) {
    this._region = region;
    $('#sfSheet')?.classList.add('up', 'peek');
    await this._fill();
    this.render();
    this._marks();
    this._zoom(true);
  },

  _clearMarks() {
    try { this._ds?.entities.removeAll(); } catch (_) { }
  },

  /** 지도에서 해변을 눌렀을 때 — 목록의 그 카드로 데려간다 */
  focus(name) {
    $('#sfSheet')?.classList.add('up');
    const card = document.querySelector(`[data-sf-beach="${CSS.escape(name)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('sf-hit');
    setTimeout(() => card.classList.remove('sf-hit'), 1600);
  },

  /* 기준점을 어디로 잡을까.
     받은 지적: "화면을 옮겼을 때 다른 지역도 나와야 해. 사용자가 근처 해변이
                 아닌 다른 곳을 원할 수 있잖아" — 맞는 말이다.
     → 순서: ① 사용자가 고른 지역 ② **지금 보고 있는 지도 중심** ③ 내 위치 ④ 양양
     ⚠️ 전지구 화면(고도가 아주 높음)에서는 지도 중심이 의미가 없다. 그때만 건너뛴다. */
  _anchor() {
    if (this._region) {
      const list = beaches.byRegion(this._region).filter(b => b.facing != null);
      if (list.length) {
        const la = list.reduce((s, b) => s + b.lat, 0) / list.length;
        const lo = list.reduce((s, b) => s + b.lon, 0) / list.length;
        return { lat: la, lon: lo, from: 'region' };
      }
    }
    try {
      const c = viewer.camera.positionCartographic;
      // 3,000km 보다 낮게 보고 있으면 "그 지역을 보는 중"으로 친다
      if (c && c.height < 3_000_000) {
        return { lat: Cesium.Math.toDegrees(c.latitude),
                 lon: Cesium.Math.toDegrees(c.longitude), from: 'map' };
      }
    } catch (_) { /* 뷰어가 아직이면 넘어간다 */ }
    const p = myLocation.coords;
    if (p) return { lat: p.lat, lon: p.lon, from: 'me' };
    // ⚠️ 마지막 기본값은 양양이다. 목록 순서대로 자르면 남해가 먼저 나오는데,
    //    한국에서 서핑이 실제로 이뤄지는 곳은 동해 북부다.
    return { lat: 38.02, lon: 128.72, from: 'home' };
  },

  /** 지금 보여줄 해변들의 파랑을 한 번에 받아 둔다 */
  async _fill() {
    const at = this._anchor();
    this._at = at;
    // ⚠️ 실패해도 화면은 뜬다 — 부이가 없다고 서핑 정보를 막지 않는다
    // ⚠️ 부이와 이안류를 **동시에** 받는다.
    //    순서대로 기다리면 화면이 그만큼 늦게 뜬다.
    [this._buoy, this._rip] = await Promise.all([
      nearestBuoy(at.lat, at.lon).catch(() => null),
      nearestRip(at.lat, at.lon).catch(() => null),
    ]);
    this._pick = this._region
      ? beaches.byRegion(this._region).filter(b => b.facing != null).slice(0, N_SHOW)
      : beaches.near(at.lat, at.lon, N_SHOW);
    await beaches.sea(this._pick);
  },

  render() {
    const ko = i18n.lang === 'ko';
    const body = $('#sfBody');
    if (!body) return;
    const m = beaches.meta || {};

    const list = this._pick || [];
    const tabs = [
      ['near', ko ? '이 주변' : 'Here'],
      ['how', ko ? '읽는 법' : 'How to read'],
    ].map(([k, t]) =>
      `<button class="mt-tab${this._tab === k ? ' on' : ''}" data-sf-tab="${k}">${t}</button>`
    ).join('');

    /* 지역 고르기 — 지도를 옮기지 않고도 다른 바다를 볼 수 있어야 한다 */
    const regions = beaches.regions().map(r => {
      const n = beaches.byRegion(r).filter(b => b.facing != null).length;
      if (!n) return '';
      return `<button class="mt-tab sm${this._region === r ? ' on' : ''}" `
        + `data-sf-region="${esc(r)}">${esc(shortRegion(r))} ${n}</button>`;
    }).join('');

    const peek = $('#sfSheet')?.classList.contains('peek');
    body.innerHTML = `
      <button class="sf-grow" data-sf-grow>${peek
        ? (ko ? '목록 크게 ▲' : 'Expand ▲') : (ko ? '지도 보기 ▼' : 'Show map ▼')}</button>
      <div class="mt-tabs">${tabs}</div>
      ${this._tab === 'how' ? this._how(ko) : `
        <div class="mt-tabs regions">
          <button class="mt-tab sm${!this._region ? ' on' : ''}" data-sf-region="">${
            ko ? '이 주변' : 'Here'}</button>${regions}
        </div>
        <p class="mt-times">${ko
          ? `${{ region: '', map: '<b>지금 보고 있는 지도</b> 주변입니다 · ',
                 me: '<b>내 위치</b> 주변입니다 · ',
                 home: '<b>양양 기준</b>입니다 (위치를 모릅니다) · ' }[this._at?.from] || ''}`
            + `해변 ${m.count}곳 중 바다 방향을 낸 곳 ${m.withFacing}곳 · 파랑 자료 Open-Meteo 해양`
          : `${m.withFacing} of ${m.count} beaches have a shore orientation · waves: Open-Meteo Marine`}</p>
        ${buoyLine(this._buoy, ko)}
        ${swimWarn(ko, this._rip)}
        ${this._markMode === 'region' ? this._regionList(ko) : ''}
        <div class="mt-list">${list.map(b => this._card(b, ko)).join('')}</div>
        ${this._foot(ko)}`}
    `;
  },

  /* 멀리서 볼 때 — 어느 바다가 큰가를 먼저 말한다.
     ⚠️ 지도에는 권역 대표를 찍어 놓고 목록만 개별 해변이면 둘이 어긋난다.
        지도가 권역을 말하는 동안에는 시트도 권역을 먼저 말한다.
     ⚠️⚠️ **"몇 곳을 재서 낸 값"인지 반드시 적는다.** 권역 전체를 잰 것이 아니다.
        3지점의 최댓값을 "동해 중부 0.8m"라고만 쓰면 잰 적 없는 곳까지 단정하게 된다. */
  _regionList(ko) {
    const rows = (this._regions || []).slice()
      .sort((a, b) => (b.maxSwell ?? -1) - (a.maxSwell ?? -1));
    if (!rows.length) return '';
    const items = rows.map((r, i) => `
      <button class="sf-rg${i === 0 && r.maxSwell != null ? ' top' : ''}"
              data-sf-region="${esc(r.region)}">
        <b>${esc(shortRegion(r.region))}</b>
        <span class="n">${r.maxSwell == null ? '—' : r.maxSwell.toFixed(1) + 'm'}</span>
        <em>${r.sst == null ? '' : r.sst.toFixed(0) + '°'}</em>
      </button>`).join('');
    return `
      <div class="sf-rglist">
        <p class="sf-rghead">${ko
          ? `바다별 <b>가장 큰 너울</b> · 권역마다 ${REGION_SAMPLES}곳을 재서 낸 값입니다`
          : `Largest swell by sea · sampled at ${REGION_SAMPLES} points per region`}</p>
        ${items}
        <p class="sf-rgnote">${ko
          ? `권역별 ${REGION_SAMPLES}개 표본 · 바다 선택 시 해변별 표시`
          : `${REGION_SAMPLES} samples per region · select a sea for beach detail`}</p>
      </div>`;
  },

  _windAt(b) {
    if (!this._wind?.stations) return null;
    const st = nearest(this._wind.stations, b.lat, b.lon, WIND_MAX_KM);
    if (!st) return null;
    const dir = st.wd10 ?? st.wd1;
    const spd = st.ws10 ?? st.ws1;
    if (dir == null) return null;
    return { dir, speed: spd ?? null, name: st.name, km: Math.round(st.km) };
  },

  _card(b, ko) {
    const sea = beaches._sea.get(b.name) || null;
    const wind = this._windAt(b);
    const j = judge(b, sea, wind, ko);

    /* 머리 — 받은 지시대로 **이름과 위치**만. "해수욕장·해변" 꼬리는 뗀다.
       (주문진해수욕장 → 주문진 · 사근진해변 → 사근진) */
    /* ⚠️⚠️ 일본 해변은 **바다 방향을 계산해 두지 않았다.** 그래서 이 화면의 핵심
       판단("이 스웰이 들어오는가")을 못 한다. 카드마다 그 사실을 적는다 —
       안 적으면 한국 해변과 똑같아 보이는데 판단만 빠져 있어 더 헷갈린다.
    ⚠️ 이름이 원문(일본어)이거나 우리가 옮긴 표기면 그것도 밝힌다. */
    const jp = b.country === 'jp';
    const markKo = { tr: '표기 변환', ja: '현지 표기', en: '영문' }[b.nameMark];
    const head = `
      <header>
        <h4>${esc(shortName(b.name))}${jp && b.nameJa && b.nameMark !== 'ja'
          ? ` <span class="sf-ja">${esc(b.nameJa)}</span>` : ''}</h4>
        <span class="mt-alt">${jp ? (ko ? '일본' : 'Japan') : esc(shortRegion(b.region))}${
          b.km != null ? ` · ${b.km}km` : ''}${
          markKo && ko ? ` · ${markKo}` : ''}</span>
      </header>${jp ? `<p class="sf-nofacing">${ko
        ? '바다 방향 자료 없음 · 파도·주기·수온 표시'
        : 'Shore orientation unavailable · waves, period and temperature shown'}</p>` : ''}`;

    if (!sea) {
      return `<article class="mt-card" data-sf-beach="${esc(b.name)}">${head}
        <p class="sf-none">${ko ? '이 지점의 파랑 자료가 없습니다'
                                : 'No wave data at this point'}</p></article>`;
    }

    /* ⚠️ **너울과 풍파를 나눠 보여준다.** 이게 서핑에서 가장 중요한 구분이다:
       같은 1.5m 라도 너울 12초면 좋은 파도, 풍파 5초면 못 타는 잡파다.
       합쳐진 wave_* 하나만 보여주면 이 차이가 통째로 사라진다.
       ⚠️ 값이 없으면 '—' 로 둔다. 0 으로 채우면 "파도가 없다"로 읽힌다. */
    const v = (x, d = 1) => (x == null ? '—' : x.toFixed(d));
    const trio = `
      <div class="sf-trio">
        <div class="sf-cell">
          <span class="k">${ko ? '너울' : 'Swell'}</span>
          <span class="n">${v(sea.swellH)}<i>m</i></span>
          <span class="s">${v(sea.swellPeriod, 1)}${ko ? '초' : 's'}</span>
        </div>
        <div class="sf-cell">
          <span class="k">${ko ? '파도' : 'Wind wave'}</span>
          <span class="n">${v(sea.windH)}<i>m</i></span>
          <span class="s">${sea.windPeriod ? `${v(sea.windPeriod, 1)}${ko ? '초' : 's'}`
                                            : (ko ? '없음' : 'none')}</span>
        </div>
        <div class="sf-cell">
          <span class="k">${ko ? '수온' : 'Sea temp'}</span>
          <span class="n">${v(sea.sst)}<i>°</i></span>
          <span class="s">${sea.sst == null ? '' : (ko ? this._suit(sea.sst) : '')}</span>
        </div>
      </div>`;

    const tide = this._tide(sea.tide, ko);

    if (!j.ok) {
      return `<article class="mt-card" data-sf-beach="${esc(b.name)}">${head}${trio}${tide}
        <p class="sf-none">${esc(j.why)}</p></article>`;
    }

    const cls = { direct: 'good', angled: 'ok', glancing: 'weak', blocked: 'bad' };
    const wcls = { offshore: 'good', cross: 'ok', onshore: 'bad' };

    return `
      <article class="mt-card" data-sf-beach="${esc(b.name)}">
        ${head}
        ${trio}
        ${tide}
        <ul class="sf-rows">
          <li class="${cls[j.exposure.key] || ''}">
            <i>${ko ? '스웰' : 'Swell'}</i>
            <b>${j.exposure.text}</b>
            <em>${ko ? `${j.exposure.gapDeg}° 차이` : `${j.exposure.gapDeg}° off`}</em>
          </li>
          ${j.wind ? `<li class="${wcls[j.wind.key] || ''}">
            <i>${ko ? '바람' : 'Wind'}</i>
            <b>${j.wind.text}</b>
            <em>${j.wind.speed != null ? `${j.wind.speed.toFixed(1)} m/s` : ''}</em>
          </li>` : `<li><i>${ko ? '바람' : 'Wind'}</i>
            <b class="dim">${ko ? '가까운 관측소가 없습니다' : 'No nearby station'}</b></li>`}
        </ul>
      </article>`;
  },

  /* 물때.
     ⚠️⚠️ **조차가 작은 곳에서 크게 띄우지 않는다.** 실측(48시간):
        양양·강릉 0.27m · 포항 0.16m  ← 한국 서핑의 중심인데 가장 작다
        부산 1.00m · 제주 남 2.21m · 인천 6.87m
        동해에서 만조·간조를 크게 적으면 **없는 중요성을 만드는 것**이 된다.
        그래서 0.5m 미만이면 "영향 거의 없음"이라고 한 줄로만 적는다. */
  _tide(t, ko) {
    if (!t) return '';
    const hhmm = (ms) => new Intl.DateTimeFormat(ko ? 'ko-KR' : 'en', {
      hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
    if (!t.matters) {
      return `<p class="sf-tide small">${ko
        ? `물때 — 조차 ${(t.rangeM * 100).toFixed(0)}cm 로 <b>영향이 거의 없는 바다</b>입니다.`
        : `Tide range only ${(t.rangeM * 100).toFixed(0)} cm — little effect here.`}</p>`;
    }
    const nx = (t.next || []).map(n =>
      `${n.kind === 'high' ? (ko ? '만조' : 'High') : (ko ? '간조' : 'Low')} ${hhmm(n.at)}`
    ).join(' · ');
    return `<p class="sf-tide">${ko
      ? `<b>물때</b> 조차 ${t.rangeM.toFixed(2)}m · 지금 ${t.nowM > 0 ? '+' : ''}${t.nowM.toFixed(2)}m`
        + `${t.rising != null ? ` (${t.rising ? '드는 중' : '나는 중'})` : ''}`
        + `${nx ? ` — ${nx}` : ''}`
      : `<b>Tide</b> range ${t.rangeM.toFixed(2)} m${nx ? ` — ${nx}` : ''}`}</p>`;
  },

  /* 수온으로 슈트를 가늠한다.
     ⚠️ 이건 **널리 쓰이는 목안**이지 공인 기준이 아니다. 화면에도 그렇게 적는다.
        사람마다 추위를 타는 정도가 다르고, 바람·시간에 따라 체감이 달라진다. */
  _suit(t) {
    if (t >= 24) return '슈트 없이도';
    if (t >= 20) return '스프링';
    if (t >= 17) return '3/2mm';
    if (t >= 14) return '4/3mm';
    return '5mm+';
  },

  _how(ko) {
    const P = SURF_RULES.PERIOD;
    return `<div class="mt-note">${ko ? `
      <b>파고는 주기와 함께 읽습니다.</b><br>
      파고 1.5m · 주기 6초 → 잡파. 파고 1.5m · 주기 14초 → 좋은 너울.
      같은 1.5m 인데 완전히 다릅니다.
      <br><br>
      <b>그리고 그 해변에 들어와야 합니다.</b> 북향 해변에 남쪽 스웰은 안 들어옵니다.
      그래서 스웰이 오는 방향과 <b>해변이 보는 방향</b>을 견줍니다 —
      전국 해변 ${beaches.meta?.withFacing ?? 0}곳의 방향을
      OpenStreetMap 해안선에서 계산해 두었습니다.
      <br><br>
      <b>바람은 파면을 만들거나 부숩니다.</b> 육지에서 바다로 부는 육풍은
      파면을 세워 깔끔하게 하고, 바다에서 불어오는 해풍은 뭉갭니다.
      ` : `
      <b>Read wave height with period.</b><br>
      1.5 m at 6 s is chop; 1.5 m at 14 s is a good groundswell.
      <br><br><b>Swell direction must face the beach.</b> We compare swell direction with the
      <b>shore orientation</b> of ${beaches.meta?.withFacing ?? 0} beaches,
      computed from OpenStreetMap coastlines.
      <br><br><b>Wind shapes or ruins the face.</b> Offshore cleans it up; onshore blows it out.`}
      <br><br>
      <b>${ko ? '주기 표시 구간' : 'Period display bands'}</b><br>
      ${P.map(p => `· ~${p.max}s ${ko ? p.ko : p.en}`).join('<br>')}
    </div>`;
  },

  _foot(ko) {
    const m = beaches.meta || {};
    return `<p class="mt-foot">
      ${ko ? `표시 기준 · 파도 · 바람 · 해안선 방향<br><small>${esc(m.source || '')} · ${esc(m.license || '')} · 파랑 Open-Meteo 해양</small>`
      : `Display inputs · waves · wind · shoreline orientation<br><small>${esc(m.source || '')} · ${esc(m.license || '')}</small>`}
    </p>`;
  },
};

/* ⚠️⚠️ **입수 통제 경고 — 맨 위에 둔다.**
   받은 신고: "강릉쪽 파도가 점차 세저서 입수가 금지되는 해수욕장이 생기나봐"

   확인해 보니 우리 자료는 **정반대**를 말하고 있었다 —
   같은 시각 강릉 앞바다 파고 0.9m, 앞으로 더 낮아짐, 풍랑특보 없음
   (강릉에 나와 있는 특보는 폭염경보·열대야뿐이었다).

   ⚠️ 그런데 이건 모순이 아니다. **해수욕장 입수 통제는 파고로 정하지 않는다.**
      대개 **이안류**로 막는데, 이안류는 해변 코앞 수십 미터에서 생기는 흐름이라
      우리가 쓰는 격자에는 **원리상 안 잡힌다.** 0.9m 잔잔한 바다에서도 끌려 나간다.

   ⚠️⚠️ 그래서 위험한 것은 "자료가 없다"가 아니라 **"괜찮아 보인다"** 는 것이다.
      통제 중인 해변인데 우리 화면은 파고 0.9m 만 조용히 띄운다.
      → 맨 아래 긴 주의 문구에 묻어 두지 않고, **목록보다 먼저** 보이게 둔다.

   ⚠️⚠️ **2026-08-04: 자료가 생겼다.** 국립해양조사원 이안류 지수 승인이 나서
      열 곳은 실제 등급을 말할 수 있게 됐다.
      → 그 열 곳에서는 "알 수 없습니다"라고 쓰면 **거짓말**이 된다. 등급을 보여준다.
      → 나머지 240여 곳에서는 이 문구를 그대로 쓴다. 그쪽은 여전히 모른다.
      ⚠️ 등급이 '관심'이어도 **"들어가도 된다"로 바뀌지 않는다.**
         입수 통제는 해수욕장 관리 주체가 정하고, 이안류 말고도 이유는 많다. */
export function swimWarn(ko, rip) {
  /* 관측 해변이 아니거나, 자료가 오래됐으면 — 예전 그대로 "모른다"고 말한다.
     ⚠️ 값을 못 받았을 때 조용히 아무것도 안 띄우면, 경고가 사라진 화면이 된다.
        그게 제일 위험하다. 모를 때는 **모른다고 크게** 적는다. */
  if (!rip || rip.stale || !rip.grade) {
    return `<p class="mt-danger">${ko
      ? '<b>입수 상태 미연결</b> · 현장 안내와 안전요원 지시를 따르세요.'
      : '<b>Water-entry status unavailable</b> · follow on-site signs and lifeguards.'}</p>`;
  }

  const col = RIP_COLOR[rip.grade] || '#f87171';
  const gEn = RIP_EN[rip.grade] || rip.grade;
  const mins = rip.ageMin == null ? null : Math.max(0, Math.round(rip.ageMin));
  const when = mins == null ? '' : (ko
    ? (mins < 1 ? '방금' : `${mins}분 전`)
    : (mins < 1 ? 'just now' : `${mins} min ago`));

  /* ⚠️ 같은 해변이 아니면 **어디 값인지·얼마나 먼지 반드시 밝힌다.**
     이걸 빼면 옆 해변 값을 이 해변 값으로 읽는다. */
  const whose = rip.same
    ? (ko ? '이 해변' : 'this beach')
    : (ko ? `${rip.ko} 해수욕장 (${rip.distKm.toFixed(0)}km 떨어짐)`
          : `${rip.name || rip.ko} beach, ${rip.distKm.toFixed(0)} km away`);

  /* 오늘 더 높았던 적이 있으면 그것도 적는다.
     ⚠️ 지금 '관심'이어도 아까 '위험'이었으면 그건 알아야 하는 정보다. */
  const worse = rip.todayWorst && rip.todayWorst !== rip.grade
    && (rip.gradeRank || 0) < 4
    ? (ko ? ` · 오늘 최고 <b>${rip.todayWorst}</b>` : ` · today's peak <b>${rip.todayWorst}</b>`)
    : '';

  return `<p class="mt-danger rip-live" style="--rip:${col}">
    <b class="rip-grade">${ko ? rip.grade : gEn}</b>
    ${ko
      ? `<b>이안류 ${rip.grade}</b> — ${whose}, ${when} 관측${worse}<br>`
        + `<small>등급 출처 · 국립해양조사원</small><br>`
        + `<b>입수 통제</b> · 현장 안내와 안전요원 지시를 따르세요.`
      : `<b>Rip current: ${gEn}</b> — ${whose}, observed ${when}${worse}<br>`
        + `<small>Graded by KHOA, not computed by us.</small><br>`
        + `<b>Water-entry status</b> · follow signage and lifeguards.`}
  </p>`;
}

/* ── 가장 가까운 부이가 **실제로 잰** 파고 ────────────────────────────
   ⚠️⚠️ 왜 이걸 따로 보여주나 (받은 신고에서 나왔다)
     "강릉쪽 파도가 점차 세저서 입수가 금지되는 해수욕장이 생기나봐"
     그때 우리 화면은 그 앞바다를 **0.9m** 라고 말하고 있었다(Open-Meteo 모델).
     10km 앞 강릉 부이가 같은 시각에 잰 값은 **최대 2.0m** 였다.
     모델이 틀렸다기보다 **다른 것을 말하고 있었다** — 모델이 주는 건 유의파고고,
     사람 몸에 부딪히는 건 최대파고다.
   ⚠️ 모델을 지우고 부이로 바꾸지 않는다. 부이는 몇십 km 떨어진 한 점이고,
      해변마다 값이 다르다. **둘 다 보여주고 무엇이 다른지 적는다.**
   ⚠️ 부이가 멀면 아예 말하지 않는다 — 200km 밖 부이로 이 해변을 말할 수 없다. */
const BUOY_MAX_KM = 120;
let _buoyCache = null, _buoyAt = 0;

export async function nearestBuoy(lat, lon) {
  try {
    if (!_buoyCache || Date.now() - _buoyAt > 5 * 60_000) {
      const r = await fetchT(`${API.OCEAN}/kma-buoy.json`, { cache: 'no-cache' });
      _buoyCache = r.ok ? await r.json() : null;
      _buoyAt = Date.now();
    }
    const st = _buoyCache?.stations || [];
    const R = 6371, rad = d => d * Math.PI / 180;
    let best = null;
    for (const b of st) {
      // ⚠️ 최대파고가 있는 부이만 본다. 연안방재 지점은 바람만 재고 파고가 없다.
      if (b.whMax == null || b.lat == null) continue;
      const dp = rad(b.lat - lat), dl = rad(b.lon - lon);
      const h = Math.sin(dp / 2) ** 2
              + Math.cos(rad(lat)) * Math.cos(rad(b.lat)) * Math.sin(dl / 2) ** 2;
      const km = 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
      if (!best || km < best.km) best = { ...b, km };
    }
    return best && best.km <= BUOY_MAX_KM ? best : null;
  } catch (_) { return null; }
}

export function buoyLine(b, ko) {
  if (!b) return '';
  const hh = b.tm ? `${b.tm.slice(8, 10)}:${b.tm.slice(10, 12)}` : '';
  const bits = [];
  if (b.whMax != null) bits.push(ko ? `<b>가장 큰 파도 ${b.whMax.toFixed(1)}m</b>`
                                    : `<b>max ${b.whMax.toFixed(1)} m</b>`);
  if (b.whSig != null) bits.push(ko ? `큰 쪽 평균 ${b.whSig.toFixed(1)}m`
                                    : `sig ${b.whSig.toFixed(1)} m`);
  if (b.wp != null) bits.push(ko ? `주기 ${b.wp.toFixed(0)}초` : `${b.wp.toFixed(0)} s`);
  return `<p class="mt-buoy">${ko
    ? `🌊 <b>${esc(b.name)} 부이</b>가 ${hh} 에 실제로 잰 값 — ${bits.join(' · ')}`
      + `<br><small>${Math.round(b.km)}km 떨어진 <b>먼바다</b> 값입니다. `
      + `아래 목록은 해변별 <b>모델 예측</b>이라 숫자가 다릅니다 — `
      + `모델은 큰 쪽 평균을, 부이는 가장 큰 파도까지 함께 알려줍니다.</small>`
    : `🌊 <b>${esc(b.name)} buoy</b>, measured ${hh} — ${bits.join(' · ')}`
      + `<br><small>${Math.round(b.km)} km offshore. The list below is model forecast.</small>`}</p>`;
}
