// 태풍 — 현재 위치 · 지나온 경로 · 예보 원뿔
//
// 데이터: GDACS (EU 공동연구센터 + UN). 전지구를 한 소스로 덮는다.
//   NHC 는 대서양·동태평양만, JTWC 는 RSS 라 파싱이 번거롭다.
//   GDACS 는 둘을 포함해 전 세계를 GeoJSON 으로 준다 (출처는 JTWC/NHC 로 표기됨).
//
// GDACS geometry 응답 구조 (실측)
//   Point_Centroid          현재 중심 1개
//   Point_Polygon_Point_N   6시간 간격 관측점. polygonlabel 에 시각이 들어있다.
//   Line_Line_N             관측점을 잇는 경로 구간 (지나온 길)
//   Poly_Cones              예보 원뿔 (앞으로 갈 범위)
//   Poly_Red/Orange/Green   풍속 반경 (빨강=강풍핵)
//
// ⚠️ 경로는 "지나온 길"이고 원뿔은 "예보"다. 둘을 같은 색으로 그리면
//    사용자가 예보를 확정된 경로로 오해한다. 색과 선 모양으로 반드시 구분한다.

import { viewer } from '../viewer.js';
import { API } from '../config.js';
import { fetchT } from '../net.js';
import { i18n } from '../i18n.js';
import { mapLabel } from '../maplabel.js';
import { power } from '../power.js';

const ALERT = {
  Red:    { color: '#ff4d4d', ko: '적색 경보', en: 'Red alert' },
  Orange: { color: '#ff9f45', ko: '주황 경보', en: 'Orange alert' },
  Green:  { color: '#7ee0a0', ko: '녹색 (주의)', en: 'Green' },
};

/* 최대풍속(km/h) → 등급. 한국 기상청 태풍 강도 기준에 맞췄다. */
function grade(kmh) {
  const ko = i18n.lang === 'ko';
  if (kmh == null) return '—';
  const ms = kmh / 3.6;
  if (ms >= 54) return ko ? '초강력' : 'Violent typhoon';
  if (ms >= 44) return ko ? '매우 강' : 'Very strong';
  if (ms >= 33) return ko ? '강' : 'Strong typhoon';
  if (ms >= 25) return ko ? '중' : 'Typhoon';
  if (ms >= 17) return ko ? '열대폭풍' : 'Tropical storm';
  return ko ? '열대저압부' : 'Tropical depression';
}

/* GDACS 목록에서 빠진 뒤에도 경로를 남겨두는 시간.
   ⚠️ 왜 필요한가 (받은 지적)
     "태풍 노을은 열대성 저압부로 바뀌어서 이제 안 나오는 걸까? 그래도 2~3일은
      구름이 지나가는 거라 계속 위치 추적 라인이 보여줬으면 해"
     맞는 말이다. GDACS 는 열대저기압 지위를 잃으면 목록에서 통째로 뺀다.
     그런데 그 구름과 비는 며칠 더 실제로 지나간다 — 화면에서만 사라지는 것이다.

   ⚠️ 사라진 이유를 우리가 안다고 말하면 안 된다.
      우리가 아는 건 "GDACS 목록에서 빠졌다"뿐이다. 약화인지, 상륙 후 소멸인지,
      온대저기압으로 바뀐 것인지는 GDACS 가 알려주지 않는다.
      그래서 표시는 "관측 종료"로 한다. "열대저압부로 약화"라고 쓰면 지어낸 것이 된다. */
const RETAIN_H = 72;

/* GDACS 응답을 이만큼만 기다린다.
   ⚠️ 넉넉히 주되 무한정은 안 된다 — 넘으면 우리 보관본으로 그린다(refresh 참고).
      사용자에게는 "조금 늦은 자료"가 "빈 화면"보다 언제나 낫다. */
const GDACS_TIMEOUT_MS = 12_000;

/* 과거 유사 사례 — cyclone-analog Lambda 가 만든 것을 읽어 둔다.
   ⚠️ 실패해도 태풍 표시는 그대로 돌아야 한다. 없으면 그 줄만 안 나온다. */
const analog = {
  _by: new Map(),
  async load() {
    try {
      const r = await fetch(`${API.OCEAN}/cyclone-analog.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      this._by.clear();
      (j.storms || []).forEach(s => {
        const v = { ...s, minSampleForPct: j.minSampleForPct };
        if (s.id) this._by.set(String(s.id), v);
        if (s.name) this._by.set(String(s.name).toUpperCase(), v);
      });
    } catch (e) {
      console.warn('[태풍 유사사례] 못 받음 —', e.message);
    }
  },
  get(id, name) {
    return this._by.get(String(id)) || this._by.get(String(name || '').toUpperCase()) || null;
  },
};

export const cyclones = {
  ds: null,
  list: [],          // { id, name, alert, kmh, countries, lat, lon, ... }
  _tracks: {},       // eventid → 그려진 경로 엔티티들
  _hist: new Map(),  // eventid → [{t, lat, lon, name, alert}] 우리가 기록한 위치
  _selected: null,

  init() {
    this.ds = new Cesium.CustomDataSource('cyclone');
    viewer.dataSources.add(this.ds);
    this.ds.show = false;
    return this;
  },

  /** 서버가 보관해 둔 태풍 경로. GDACS 가 목록에서 지운 뒤에도 이건 남는다.
   *
   * ⚠️ 왜 앱이 GDACS 에서 직접 안 받나
   *    경로는 폭풍이 살아있을 때만 받을 수 있다. 빠진 뒤엔 이미 없다.
   *    그래서 아카이버가 살아있는 동안 붙잡아 events/cyclone-tracks.json 에 둔다.
   *    서버에 두면 기기마다 다른 걸 보는 일도 없다.
   * ⚠️ track(지나온) 과 forecast(앞으로) 는 서버에서 이미 나뉘어 온다. 합치지 않는다. */
  async loadTracks() {
    try {
      const r = await fetch(`${API.EVENTS}/cyclone-tracks.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      this._hist = new Map((j.storms || []).map(x => [String(x.id), x]));
    } catch (e) {
      // ⚠️ S3 는 없는 객체에 403 을 준다(404 아님). 경로가 없어도 실시간은 그려야 한다.
      this._hist = new Map();
      if (!/\b(403|404)\b/.test(e.message)) console.warn('[cyclone] 경로 실패', e.message);
    }
  },

  set(on) { if (this.ds) this.ds.show = on; },

  async refresh() {
    /* ⚠️⚠️ GDACS 가 죽어도 화면이 비면 안 된다.
       실측(2026-08-02): GDACS 가 커넥션 풀 고갈로 완전히 응답하지 않았다
       (400 본문 "Timeout expired... all pooled connections were in use",
        이후 4회 연속 45초 타임아웃). 그때 이 함수가 통째로 throw 해서
       **태풍 레이어에 아무것도 안 나왔다.**
       그런데 우리는 자료를 갖고 있었다 — archiver 가 events/cyclone-tracks.json 에
       경로를 보관해 두고, 유사 사례 분석까지 끝나 있었다. 쓰지 못하고 있었을 뿐이다.
       → 실패하면 던지지 말고 **우리 보관본으로 그린다.** 대신 그게 실시간이 아님을
         반드시 화면에 적는다(stale 플래그 → detail 참고). */
    let feats = [];
    let gdacsOk = true;
    try {
      /* ⚠️⚠️ fetch 에는 타임아웃이 없다. 이것 때문에 위 폴백이 무용지물이었다.
         GDACS 가 죽는 방식은 두 가지인데 **무응답이 더 흔하고 더 나쁘다**:
           · 오류 응답(400 등) → catch 로 잡힌다 ✓
           · 아무 응답도 안 함  → fetch 가 **영원히 매달린다.** 오류가 안 나니
                                 catch 도 안 걸리고, 폴백도 영영 실행되지 않는다.
         실측(2026-08-02): 4회 연속 45초 넘게 0바이트. 그동안 화면은 계속 비어 있었다.
         → 제한 시간을 걸어 **실패로 만들어야** 보관본으로 넘어간다. */
      const r = await fetchT(`${API.GDACS}?eventtypes=TC`, { timeout: GDACS_TIMEOUT_MS });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      // ⚠️ eventtypes=TC 로 물어도 지진 등이 섞여 온다. eventtype 으로 다시 거른다.
      feats = (j.features || []).filter(f => f.properties?.eventtype === 'TC');
    } catch (e) {
      gdacsOk = false;
      console.warn('[cyclone] GDACS 응답 없음 — 보관본으로 그린다:', e.message);
    }
    this.gdacsOk = gdacsOk;

    this.list = feats.map(f => {
      const p = f.properties;
      const c = f.geometry?.coordinates || [];
      return {
        id: p.eventid,
        episode: p.episodeid,
        name: (p.eventname || '').replace(/-\d+$/, ''),   // NOUL-26 → NOUL
        alert: p.alertlevel,
        kmh: p.severitydata?.severity ?? null,
        countries: (p.affectedcountries || []).map(x => x.countryname),
        from: p.fromdate, to: p.todate,
        source: p.source,
        report: p.url?.report,
        geometryUrl: p.url?.geometry,
        lon: c[0], lat: c[1],
      };
    }).filter(s => s.lat != null);

    /* ── GDACS 에서 빠진 폭풍을 되살린다 ──────────────────────────
       실시간 목록에 없지만 우리가 최근 RETAIN_H 안에 기록한 것이 있으면
       "관측 종료" 상태로 이어서 그린다. 마지막으로 기록한 자리에 둔다. */
    await this.loadTracks();
    /* 과거 유사 사례도 같이 받아 둔다 — 정보 시트를 열 때 이미 있어야 한다.
       ⚠️ await 하되 실패는 무시한다(load 안에서 잡는다). 없으면 그 줄만 안 나온다. */
    await analog.load();
    const live = new Set(this.list.map(s => String(s.id)));
    const cutoff = Date.now() - RETAIN_H * 3600_000;
    this._hist.forEach((rec, id) => {
      if (live.has(id)) return;
      /* rec.live 는 "우리가 마지막으로 봤을 때 GDACS 목록에 있었다"는 뜻이다.
         · GDACS 가 살아 있으면 그건 위 목록에 이미 있어야 하므로 건너뛴다.
         · GDACS 가 죽었으면 우리 보관본이 **유일한 자료**다 — 살려서 그린다. */
      if (rec.live && gdacsOk) return;
      const t = rec.track || [];
      if (!t.length) return;
      const lastMs = Date.parse(rec.lastSeen);
      if (!Number.isFinite(lastMs) || lastMs < cutoff) return;
      const [lon, lat] = t[t.length - 1];
      this.list.push({
        id, name: (rec.name || '').replace(/-\d+$/, ''),
        alert: rec.alert, kmh: null, countries: [],
        lat, lon,
        from: rec.from, to: rec.to,
        source: 'GDACS',
        /* ⚠️ 둘을 구분한다. 같은 "옛 자료"라도 뜻이 다르다.
           ended — GDACS 는 멀쩡한데 이 폭풍이 목록에서 빠졌다 (관측 종료)
           stale — GDACS 자체가 응답하지 않는다 (폭풍은 아마 살아 있다) */
        ended: !rec.live,
        stale: rec.live && !gdacsOk,
        lastSeen: rec.lastSeen,
      });
    });

    this.draw();
    return this.list;
  },

  /** 현재 위치만 먼저 그린다. 경로는 선택했을 때 불러온다 (요청 절약) */
  draw() {
    this.ds.entities.removeAll();
    this._tracks = {};

    this.list.forEach(s => {
      const a = ALERT[s.alert] || ALERT.Green;
      const col = Cesium.Color.fromCssColorString(a.color);

      /* ── 우리가 기록한 지나온 경로 ────────────────────────────────
         예전엔 눌러야만 경로가 나왔다(GDACS geometry 를 그때 받아서).
         그런데 "어디서 어디로 가고 있나"는 누르기 전에 보여야 하는 정보다.
         이력은 이미 받아 뒀으므로 그리는 데 요청이 더 들지 않는다. */
      const rec = this._hist.get(String(s.id)) || {};
      const past = rec.track || [];
      if (past.length >= 2) {
        const pts = [];
        past.forEach(([x, y]) => pts.push(x, y));
        this.ds.entities.add({
          id: `tc:${s.id}:rec`,
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(pts),
            width: s.ended ? 1.8 : 2.2,
            material: new Cesium.PolylineDashMaterialProperty({
              color: col.withAlpha(s.ended ? 0.5 : 0.7), dashLength: 12,
            }),
            clampToGround: false, arcType: Cesium.ArcType.GEODESIC,
          },
          _meta: { id: `tc-${s.id}`, kind: 'cyclone', name: s.name,
                   lat: s.lat, lon: s.lon, _tc: s },
          _layer: 'cyclone',
        });
      }

      /* ── 관측이 끝난 폭풍 ────────────────────────────────────────
         ⚠️ 소용돌이 팔과 원반은 그리지 않는다. 도는 폭풍이 아니게 됐는데
            계속 돌려 보이면 "아직 태풍이다"라고 잘못 말하는 것이 된다.
            남은 경로와 마지막 위치만 옅게 남긴다. 애니메이션도 없다(발열). */
      if (s.ended) {
        this.ds.entities.add({
          id: `tc:${s.id}`,
          position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat),
          point: {
            pixelSize: 7,
            color: Cesium.Color.TRANSPARENT,
            outlineColor: col.withAlpha(0.75), outlineWidth: 2,
            disableDepthTestDistance: 600_000,
          },
          label: mapLabel({
            text: `${s.name} · ${i18n.lang === 'ko' ? '관측 종료' : 'ended'}`,
            color: col.withAlpha(0.75), size: 'sm', offsetY: -18,
          }),
          _meta: { id: `tc-${s.id}`, kind: 'cyclone', name: s.name,
                   lat: s.lat, lon: s.lon, _tc: s },
          _layer: 'cyclone',
        });
        return;
      }

      /* 태풍은 "퍼지는 파문"이 아니라 "도는 소용돌이"로 그린다.
         ────────────────────────────────────────────────────────
         파문(동심원)은 지진에 맞는 표현이다. 태풍의 본질은 회전이고,
         회전 방향은 반구에 따라 반대다 — 코리올리 효과 때문이다.
             북반구: 반시계 방향 (counterclockwise)
             남반구: 시계 방향   (clockwise)
         이걸 애니메이션으로 보여주면 설명 없이도 알게 된다.
         적도에서는 코리올리가 0 이라 태풍이 아예 생기지 않는다(±5° 이내).

         나선팔이 바깥으로 흘러나가며 도는 모습으로 그린다.
         회전 각속도는 풍속에 비례시켜 강한 태풍이 빠르게 돌게 한다. */
      const rip = Math.min(700, Math.max(180, (s.kmh || 100) * 2.6)) * 1000;
      const ARM_H = 2_000;                          // m — 지면 z-fighting 만 피하면 된다
      /* ⚠️ 회전에 끝을 둔다 (발열 — power.js 주석 참고).
         회전의 목적은 "북반구 태풍은 반시계로 돈다"를 알려주는 것이다.
         그건 몇 바퀴만 보면 전달된다. 영구히 돌리면 그 뒤로는 정보를 주지 않고
         GPU 만 태운다 — 팔마다 매 프레임 27개 좌표를 다시 만든다.
         SPIN_MS 가 지나면 나선을 그 순간 모양으로 굳힌다(모양은 남고 비용은 0). */
      const SPIN_MS = 20_000;
      const spinUntil = Date.now() + SPIN_MS;
      const ccw = s.lat >= 0 ? 1 : -1;              // 북반구 +1(반시계), 남반구 -1(시계)
      const P = Math.max(2600, 7000 - (s.kmh || 100) * 18);   // 강할수록 빨리 돈다
      const ARMS = 3, SEG = 26;

      for (let arm = 0; arm < ARMS; arm++) {
        const base = (arm / ARMS) * Math.PI * 2;
        this.ds.entities.add({
          id: `tc:${s.id}:arm${arm}`,
          polyline: {
            positions: new Cesium.CallbackProperty(() => {
              /* ⚠️ 부호에 주의. ang 은 북쪽 0° 에서 동쪽으로 도는 "방위각"이다.
                 즉 ang 이 커지면 시계 방향이다.
                 북반구는 반시계로 돌아야 하므로 방위각이 줄어야 한다 → 음수.
                 (처음에 ccw 를 그대로 더했다가 반대로 돌았다. 실측으로 잡았다.) */
              /* 수명이 지나면 시계를 멈춘 것처럼 같은 값을 돌려준다.
                 ⚠️ 여기서 멈춰도 CallbackProperty 평가 자체는 남는다.
                    실제 절감은 power 가 렌더를 더 요청하지 않는 것에서 온다 —
                    렌더가 없으면 이 함수도 불리지 않는다. */
              const nowMs = Math.min(Date.now(), spinUntil);
              const spin = -ccw * ((nowMs % P) / P) * Math.PI * 2;
              const pts = [];
              for (let k = 0; k <= SEG; k++) {
                const f = k / SEG;
                /* 나선팔은 회전에 "끌려오며" 뒤처진다.
                   반시계로 돌면 바깥쪽이 더 큰 방위각에 놓인다 → +ccw. */
                const ang = base + spin + ccw * f * 2.6;
                const r = rip * (0.14 + f * 0.86);
                const dLat = (r * Math.cos(ang)) / 110_540;
                const dLon = (r * Math.sin(ang)) / (111_320 * Math.cos(s.lat * Math.PI / 180));
                pts.push(s.lon + dLon, s.lat + dLat, ARM_H);
              }
              return Cesium.Cartesian3.fromDegreesArrayHeights(pts);
            }, false),
            width: 3,
            material: new Cesium.PolylineGlowMaterialProperty({
              color: col.withAlpha(0.55), glowPower: 0.3, taperPower: 0.35,
            }),
            /* ⚠️ clampToGround 를 쓰면 안 된다.
               위치가 CallbackProperty(매 프레임 변화)라서, 지면에 붙이는 순간
               Cesium 이 GroundPolylinePrimitive 를 매 프레임 다시 만든다.
               재생성이 비동기라 만들어지는 동안 화면에서 사라진다 → 깜빡임.
               (실측: 9개 팔 전부 해당, 최악 프레임 30.8ms, 검은 화면 깜빡임 신고)
               대신 살짝 띄운 높이로 그린다. 이 규모에서 현의 처짐은 0.05m 라
               지면에 붙인 것과 눈으로 구분되지 않는다. */
            arcType: Cesium.ArcType.NONE,
          },
          // 나선이 마커를 덮어 클릭을 가로채므로 같은 정보를 물려준다
          _meta: { id: `tc-${s.id}`, kind: 'cyclone', name: s.name,
                   lat: s.lat, lon: s.lon, _tc: s },
          _layer: 'cyclone',
        });
      }
      /* 회전이 보이도록 이 시간만 렌더를 요청한다.
         ⚠️ 예전에는 아무도 시간을 정하지 않고 영구히 돌렸다. */
      power.animate(SPIN_MS);

      // 눈(eye) 주변의 옅은 원반 — 폭풍 반경이 어디까지인지
      this.ds.entities.add({
        id: `tc:${s.id}:disc`,
        position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat),
        ellipse: {
          semiMajorAxis: rip, semiMinorAxis: rip,
          material: col.withAlpha(0.08), height: 0,
        },
        _meta: { id: `tc-${s.id}`, kind: 'cyclone', name: s.name,
                 lat: s.lat, lon: s.lon, _tc: s },
        _layer: 'cyclone',
      });

      this.ds.entities.add({
        id: `tc:${s.id}`,
        position: Cesium.Cartesian3.fromDegrees(s.lon, s.lat),
        point: {
          // 강할수록 크게 — 한눈에 위험도가 보여야 한다
          pixelSize: 10 + Math.min(10, (s.kmh || 0) / 22),
          color: col.withAlpha(0.9),
          outlineColor: Cesium.Color.WHITE.withAlpha(0.8), outlineWidth: 2,
          disableDepthTestDistance: 600_000,
        },
        label: mapLabel({ text: s.name, color: col, size: 'md', offsetY: -22 }),
        _meta: { id: `tc-${s.id}`, kind: 'cyclone', name: s.name,
                 lat: s.lat, lon: s.lon, _tc: s },
        _layer: 'cyclone',
      });
    });
  },

  /** 선택 시 — 지나온 경로 + 예보 원뿔을 불러 그린다 */
  async showTrack(s) {
    if (this._selected === s.id) return;
    this.clearTrack();
    this._selected = s.id;
    if (!s.geometryUrl) return;

    let g;
    try {
      const r = await fetch(s.geometryUrl);
      if (!r.ok) throw new Error('geometry ' + r.status);
      g = await r.json();
    } catch (e) { console.warn('[cyclone] 경로 실패', e.message); return; }

    const a = ALERT[s.alert] || ALERT.Green;
    const col = Cesium.Color.fromCssColorString(a.color);
    const made = [];
    const feats = g.features || [];

    // ── 예보 원뿔 (앞으로 갈 범위) ──
    // 점선·반투명으로 "확정이 아님"을 시각적으로 알린다
    feats.filter(f => f.properties?.Class === 'Poly_Cones').forEach((f, i) => {
      const ring = f.geometry?.coordinates?.[0];
      if (!ring?.length) return;
      made.push(this.ds.entities.add({
        id: `tc:${s.id}:cone${i}`,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(ring.flat()),
          material: col.withAlpha(0.13),
          outline: true, outlineColor: col.withAlpha(0.45),
          height: 0,
        },
      }));
    });

    // ── 지나온 경로 (실선) ──
    const segs = feats.filter(f => String(f.properties?.Class || '').startsWith('Line_'));
    segs.forEach((f, i) => {
      const cs = f.geometry?.coordinates;
      if (!cs || cs.length < 2) return;
      made.push(this.ds.entities.add({
        id: `tc:${s.id}:line${i}`,
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(cs.flat()),
          width: 2.4,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.22, color: col.withAlpha(0.85),
          }),
          clampToGround: false, arcType: Cesium.ArcType.GEODESIC,
        },
      }));
    });

    // ── 6시간 간격 관측점 ──
    feats.filter(f => String(f.properties?.Class || '').startsWith('Point_Polygon_Point_'))
      .forEach((f, i) => {
        // 이 Class 는 Polygon 으로 오지만 우리는 중심만 쓴다 (풍속 반경 원)
        const ring = f.geometry?.coordinates?.[0];
        if (!ring?.length) return;
        let lon = 0, lat = 0;
        ring.forEach(([x, y]) => { lon += x; lat += y; });
        lon /= ring.length; lat /= ring.length;
        made.push(this.ds.entities.add({
          id: `tc:${s.id}:pt${i}`,
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          point: {
            pixelSize: 4.5, color: Cesium.Color.WHITE.withAlpha(0.85),
            outlineColor: col, outlineWidth: 1.5,
            disableDepthTestDistance: 600_000,
          },
          label: {
            text: (f.properties.polygonlabel || '').replace(' UTC', ''),
            font: '300 9px ui-monospace, monospace',
            fillColor: Cesium.Color.WHITE.withAlpha(0.6),
            pixelOffset: new Cesium.Cartesian2(0, 11),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 8_000_000),
          },
        }));
      });

    this._tracks[s.id] = made;
  },

  clearTrack() {
    Object.values(this._tracks).flat().forEach(e => {
      try { this.ds.entities.remove(e); } catch (_) {}
    });
    this._tracks = {};
    this._selected = null;
  },

  /** 정보 시트용 */
  detail(s) {
    const ko = i18n.lang === 'ko';
    const a = ALERT[s.alert] || ALERT.Green;
    const d = {};
    /* ⚠️ 끝난 폭풍에 "등급/최대풍속"을 그대로 보이면 아직 그 세기인 것처럼 읽힌다.
       마지막으로 기록한 시각과, 우리가 아는 사실만 적는다. */
    if (s.ended) {
      d[ko ? '상태' : 'Status'] = ko ? '관측 종료' : 'No longer reported';
      d[ko ? '마지막 기록' : 'Last fix'] = (s.lastSeen || '').slice(0, 16).replace('T', ' ');
      d[ko ? '경로 기록' : 'Track from'] = (s.from || '').slice(0, 16).replace('T', ' ');
      d['_note'] = ko
        ? 'GDACS 실시간 목록에서 빠진 폭풍입니다. 화면의 경로는 **우리가 매시간 기록한 위치**이며 공식 베스트트랙이 아닙니다. 목록에서 빠진 이유(약화·상륙·온대저기압화)는 자료에 나오지 않아 표시하지 않습니다. 남은 구름과 비는 며칠 더 지나갈 수 있습니다.'
        : 'This storm has dropped out of the GDACS live list. The track shown is **our own hourly record**, not an official best track. GDACS does not say why a storm leaves the list (weakening, landfall, extratropical transition), so we do not claim a reason. Its remaining cloud and rain can persist for days.';
      return { title: `${s.name}`, rows: d };
    }
    /* ⚠️ GDACS 가 응답하지 않아 우리 보관본으로 그리고 있는 경우.
       "관측 종료"와 **다른 말**이다 — 폭풍은 아마 살아 있고, 우리가 지금 값을 못 받는 것뿐이다.
       이 둘을 섞으면 "끝난 태풍"이라고 잘못 말하게 된다. */
    if (s.stale) {
      d[ko ? '상태' : 'Status'] = ko
        ? '⚠️ GDACS 응답 없음 — 마지막으로 받은 위치입니다'
        : '⚠️ GDACS not responding — last received position';
      d[ko ? '마지막 수신' : 'Last received'] =
        (s.lastSeen || '').slice(0, 16).replace('T', ' ');
    }
    d[ko ? '등급' : 'Category'] = grade(s.kmh);
    d[ko ? '최대풍속' : 'Max wind'] = s.kmh != null
      ? `${Math.round(s.kmh)} km/h · ${(s.kmh / 3.6).toFixed(0)} m/s · ${(s.kmh / 1.852).toFixed(0)} kt`
      : '—';
    d[ko ? '경보' : 'Alert'] = ko ? a.ko : a.en;
    if (s.countries?.length) d[ko ? '영향권' : 'Affected'] = s.countries.join(', ');
    d[ko ? '발생' : 'Formed'] = (s.from || '').slice(0, 16).replace('T', ' ');
    d[ko ? '최신 관측' : 'Latest'] = (s.to || '').slice(0, 16).replace('T', ' ');
    d[ko ? '출처' : 'Source'] = s.source || 'GDACS';
    if (s.report) d[ko ? '상세 보고서' : 'Full report'] = s.report;

    /* ── 과거 유사 사례 ─────────────────────────────────────────
       ⚠️⚠️ 표현 규율(2026-08-02 확정)을 여기서 지킨다.
         · **건수가 먼저, 퍼센트는 괄호 안.** 퍼센트만 쓰면 모델 예측처럼 읽힌다.
         · 표본이 적으면(minSampleForPct 미만) **퍼센트를 아예 안 쓴다.**
           3/4 를 75% 로 쓰는 순간 정밀한 척하는 거짓이 된다.
         · 문구는 "이렇게 갈 것이다"가 아니라 **"과거의 비슷한 태풍들은 이렇게 갔다"**.
         · 공식 예보(점선 원뿔)를 항상 함께 둔다 — 아래 _note 가 그 역할이다. */
    const an = analog.get(s.id, s.name);
    if (an) {
      if (an.outOfBasin) {
        d[ko ? '과거 유사 사례' : 'Past analogues'] = ko
          ? an.basinNote.ko : an.basinNote.en;
      } else if (an.matches) {
        const n = an.matches;
        const usePct = an.topPct != null;
        d[ko ? '과거 유사 사례' : 'Past analogues'] = ko
          ? `${n}건 중 ${an.topN}건이 ${an.topDir}쪽으로 진행`
            + (usePct ? ` (${an.topPct}%)` : '')
          : `${an.topN} of ${n} moved ${an.topDirEn}`
            + (usePct ? ` (${an.topPct}%)` : '');
        // 나머지 방향도 세어서 보여준다 — 하나만 보이면 그게 예보로 읽힌다
        const rest = an.bins.slice(1, 4)
          .map(b => `${ko ? b.dir : b.dirEn} ${b.n}`).join(' · ');
        if (rest) d[ko ? '그 밖의 진행' : 'Other directions'] = rest;
        if (an.sample?.length) {
          d[ko ? '비슷했던 태풍' : 'Similar storms'] = an.sample.slice(0, 5)
            .map(x => `${x.season} ${x.name}`).join(', ');
        }
        const w = an.why;
        if (w) {
          d[ko ? '유사 판정 기준' : 'Match criteria'] = ko
            ? `반경 ${w.radiusKm}km · 진행방향 ±${w.headingDeg}° · 이후 ${w.lookAheadH}시간`
            : `${w.radiusKm} km · heading ±${w.headingDeg}° · next ${w.lookAheadH} h`;
        }
      }
    }

    d['_note'] = (s.stale
      ? (ko ? '⚠️ 지금 GDACS(전지구 재난경보시스템)가 응답하지 않아, 저희가 보관해 둔 마지막 경로를 보여드리고 있습니다. 현재 위치·강도는 그 이후 달라졌을 수 있습니다. 실제 대응은 기상청 발표를 따르세요. '
            : '⚠️ GDACS is not responding, so this shows the last track we archived. Current position and intensity may have changed since. ')
      : '') + (ko
      ? '점선 원뿔은 예보 범위입니다. 실제 경로는 달라질 수 있습니다.'
        + (an && an.matches
            ? ' ⚠️ 「과거 유사 사례」는 예보가 아닙니다 — 위치·진행방향·강도가 비슷했던 과거 태풍이 이후 어디로 갔는지 센 기록입니다. 판정 기준은 우리가 정한 값이며 공인 표준이 아닙니다. 실제 대응은 기상청 공식 발표를 따르세요.'
            : '')
      : 'The dotted cone is a forecast range — the actual track may differ.'
        + (an && an.matches
            ? ' ⚠️ "Past analogues" is not a forecast — it counts where similar past storms went. Follow official warnings.'
            : ''));
    return { title: `${s.name}`, rows: d };
  },
};
