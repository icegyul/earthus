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
  Red:    { color: '#ff4d4d', ko: 'GDACS 적색 영향 추정', en: 'GDACS red impact estimate' },
  Orange: { color: '#ff9f45', ko: 'GDACS 주황 영향 추정', en: 'GDACS orange impact estimate' },
  Green:  { color: '#7ee0a0', ko: 'GDACS 녹색 영향 추정', en: 'GDACS green impact estimate' },
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
const CYCLONE_SPIN_MS = 20_000;
const CYCLONE_FRAME_MS = 67;  // 나선팔 좌표 재생성은 15fps 로 제한

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

/* 일본 기상청(JMA) 공식 태풍 예보.
   ⚠️⚠️ **우리가 만든 값이 하나도 없다.** 진로·강도·약화 전망은 전부 JMA 의 것이고
      우리는 옮기기만 한다. 받은 지적이 정확했다 —
      "소멸할 것으로 예상된다는 공신력 있는 곳에서 제시한 걸 쓰면 되지."
      우리가 단정하면 자체 예보지만, 공식 발표를 출처와 함께 전하는 건 우리 일이다.
   ⚠️ 이름으로 맞춘다. GDACS 는 'DOLPHIN-26', JMA 는 'Dolphin' 이라 대문자로 맞춘 뒤
      번호 접미사를 떼고 비교한다. */
const official = {
  _by: new Map(),
  meta: null,
  async load() {
    try {
      const r = await fetchT(`${API.EVENTS}/typhoon-official.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      this._by.clear();
      this.meta = { source: j.source, url: j.sourceUrl, note: j.note, at: j.generated };
      (j.storms || []).forEach(s => {
        if (s.name) this._by.set(String(s.name).toUpperCase(), s);
        if (s.key) this._by.set(String(s.key).toUpperCase(), s);
      });
    } catch (e) {
      console.warn('[태풍 공식예보] 못 받음 —', e.message);
    }
  },
  get(name) {
    const key = String(name || '').toUpperCase().replace(/-\d+$/, '');
    return this._by.get(key) || null;
  },
};

/* 유럽중기예보센터(ECMWF) 진로.
   받은 지적: "유럽 기상청도 예보 될 텐데??" — 맞다. 같은 경로에 BUFR 로 나온다.

   ⚠️⚠️ **기상청·JMA 와 같은 것이 아니다.** 저쪽은 사람이 검토해 발표한 공식 통보문이고
      이것은 모델이 계산한 원자료다. 나란히 그리되 **모델이라고 밝히고**, 선도 점선 중에서
      가장 성기게(점) 그린다. 같은 굵기·같은 모양으로 그리면 "유럽 기상청 공식 예보"로
      읽히는데 그건 사실이 아니다.
   ⚠️ ecmwf-ingest 가 이름 없는 가상 저기압(70W·71A…)을 이미 걸러 낸다. 실측 25개 중 22개가
      그것이었다 — 걸러내지 않으면 있지도 않은 태풍이 화면에 뜬다. */
const ecmwfTc = {
  _by: new Map(),
  meta: null,
  async load() {
    try {
      const r = await fetchT(`${API.EVENTS}/typhoon-ecmwf.json`, { cache: 'no-cache' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      this._by.clear();
      this.meta = { run: j.run, note: j.note, at: j.generated, capH: j.capH,
                    source: j.source, url: j.sourceUrl, license: j.license };
      (j.storms || []).forEach(s => {
        if (s.name) this._by.set(String(s.name).toUpperCase(), s);
      });
    } catch (e) {
      console.warn('[ECMWF 태풍] 못 받음 —', e.message);
    }
  },
  /** official 과 같은 모양({agency, steps})으로 바꿔 돌려준다 — 그리는 쪽이 한 갈래면 된다 */
  get(name) {
    const key = String(name || '').toUpperCase().replace(/-\d+$/, '');
    const s = this._by.get(key);
    if (!s) return null;
    return {
      agency: 'ECMWF', agencyKo: '유럽중기예보센터', kind: 'model',
      issue: this.meta?.at, run: this.meta?.run,
      modelHorizonH: s.modelHorizonH, shownH: s.shownH,
      steps: (s.steps || []).map(p => ({ ...p, validUtc: null })),
      ensemble: s.ensemble || null,
    };
  },
};

/* 예보 시각을 사람이 읽는 말로.
   받은 지시: "시간 말고 예상 시간으로 해줘 8월3일 am9 이렇게나 더 좋은 방법으로"
   ⚠️ "+48h" 는 **읽는 사람이 암산을 해야** 하는 값이다. 그것도 지금이 몇 시인지 알아야 한다.
      기상청 통보문도 "08월 04일 09시"로 적는다 — 그 방식이 맞다.
   ⚠️ 기상청 API 는 "202608021800"(UTC) 처럼 구분자 없이 준다. Date() 가 이 꼴을 못 읽어
      Invalid Date 가 되고, 그러면 라벨이 통째로 사라진다. */
function stepDate(x, issuedAt) {
  const raw = x.validKst || x.validUtc;
  if (raw) {
    const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(String(raw));
    const d = m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]))
                : new Date(raw);
    if (!isNaN(d.getTime())) return d;
  }
  // ECMWF 는 회차 기준 +h 만 준다 — 발표 시각에 더한다
  if (issuedAt && x.h != null) {
    const b = new Date(issuedAt);
    if (!isNaN(b.getTime())) return new Date(b.getTime() + x.h * 3_600_000);
  }
  return null;
}

/* ⚠️ 보는 사람의 시간대로 적는다. 태풍이 일본 앞바다에 있어도 "내가 몇 시에 대비하나"가
      알고 싶은 것이므로 현지 시각이 맞다. */
function stepLabel(d, ko) {
  const h = d.getHours();
  if (ko) {
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${d.getMonth() + 1}/${d.getDate()}\n${h < 12 ? '오전' : '오후'} ${h12}시`;
  }
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
               'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${MON[d.getMonth()]} ${d.getDate()}\n${h12}${h < 12 ? 'AM' : 'PM'}`;
}

/* 중심에서 방위별 반경(km)을 받아 고리 좌표를 만든다.
   ⚠️ 강풍역은 **방위마다 다르다** (실측: 북동 500km · 남서 390km). 하나로 평균 내면
      실제로 부는 쪽을 줄이고 안 부는 쪽을 늘린다 — 위험한 쪽을 작게 그리게 된다. */
function ringDegrees(lat, lon, radiusKmAt, stepDeg = 6) {
  const R = 6371, r = Math.PI / 180;
  const out = [];
  for (let b = 0; b <= 360; b += stepDeg) {
    const km = radiusKmAt(b % 360);
    if (!(km > 0)) continue;
    const d = km / R;
    const la = Math.asin(Math.sin(lat * r) * Math.cos(d)
      + Math.cos(lat * r) * Math.sin(d) * Math.cos(b * r));
    const lo = lon * r + Math.atan2(
      Math.sin(b * r) * Math.sin(d) * Math.cos(lat * r),
      Math.cos(d) - Math.sin(lat * r) * Math.sin(la));
    out.push(lo / r, la / r);
  }
  return out;
}

/* 지면에서 띄우는 높이(m).
   ⚠️⚠️ **0 으로 두면 선이 통째로 안 보인다.** 지구 표면과 정확히 같은 자리라
      깊이 검사에서 지면이 이기고, 특히 **멀리서 볼수록** 확실히 진다
      (깊이 버퍼 정밀도가 떨어져서다. 실측: 3,600km 상공에서 예보선 3개가 전부 사라졌다).
   ⚠️ 이 파일의 나선팔(ARM_H)이 이미 같은 이유로 2km 를 띄우고 있었다 —
      **해법이 옆에 있었는데 새로 그린 선들에는 적용하지 않았다.**
   ⚠️ 면(영향권)은 선보다 더 낮게 둔다. 같은 높이면 이번엔 면이 선을 가린다. */
const LIFT_LINE_M = 6_000;
const LIFT_AREA_M = 3_000;

/** [lon,lat,...] → 띄운 높이의 Cartesian3 배열 */
function lifted(flatLonLat, h = LIFT_LINE_M) {
  const out = [];
  for (let i = 0; i < flatLonLat.length; i += 2) out.push(flatLonLat[i], flatLonLat[i + 1], h);
  return Cesium.Cartesian3.fromDegreesArrayHeights(out);
}

/** JMA 방위별 강풍역 → 방위각(0~360) 하나를 넣으면 반경(km)이 나오는 함수 */
function radiusFn(areas) {
  const list = (areas || []).filter(a => a.km > 0);
  if (!list.length) return null;
  const all = list.find(a => a.deg == null);
  if (all || list.length === 1) return () => (all || list[0]).km;
  // 방위가 있는 것들 — 각 방위에서 가장 가까운 쪽 값을 쓴다 (JMA 는 반원 두 개로 준다)
  return (b) => {
    let best = list[0], bd = 999;
    list.forEach(a => {
      let d = Math.abs(((a.deg - b + 540) % 360) - 180);
      d = 180 - d;                       // 방위차가 작을수록 가깝다
      if (d < bd) { bd = d; best = a; }
    });
    return best.km;
  };
}

export const cyclones = {
  ds: null,
  list: [],          // { id, name, alert, kmh, countries, lat, lon, ... }
  _tracks: {},       // eventid → 그려진 경로 엔티티들
  _hist: new Map(),  // eventid → [{t, lat, lon, name, alert}] 우리가 기록한 위치
  _selected: null,
  _spinTimer: null,
  _ensembleVisible: true,

  init() {
    this.ds = new Cesium.CustomDataSource('cyclone');
    viewer.dataSources.add(this.ds);
    this.ds.show = false;
    return this;
  },

  /** 정보창의 번호 검색도 지도와 같은 공식 자료를 쓰게 한다.
   *  ⚠️ JMA 번호를 ui-cyclone 쪽에서 다시 fetch/추측하면 지도와 뉴스가 서로 다른
   *     회차를 볼 수 있다. refresh()에서 이미 받은 원문 레코드만 그대로 돌려준다. */
  async officialFor(name) {
    /* 공유 딥링크는 refresh()가 list를 채운 직후 곧바로 정보창을 열 수 있다.
       그 시점에는 뒤이어 받는 official.load()가 아직 끝나지 않았을 수 있으므로,
       별도 fetch를 만들지 않고 같은 레코드가 준비될 때까지만 짧게 기다린다. */
    for (let i = 0; i < 50; i += 1) {
      const rec = official.get(name);
      if (rec || official.meta) return rec;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return null;
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

  set(on) {
    if (this.ds) this.ds.show = on;
    if (!on) this._freezeArms();
  },

  /** 소용돌이를 현재 모양으로 고정한다 — 꺼진 레이어의 남은 20초도 즉시 끝낸다. */
  _freezeArms() {
    clearTimeout(this._spinTimer);
    this._spinTimer = null;
    const now = Cesium.JulianDate.now();
    this.ds?.entities.values.forEach(e => {
      const prop = e.polyline?.positions;
      if (!(prop instanceof Cesium.CallbackProperty)) return;
      try {
        const pts = prop.getValue(now);
        if (pts) e.polyline.positions = new Cesium.ConstantProperty(pts);
      } catch (_) { /* 갱신 중 지워졌으면 넘어간다 */ }
    });
    power.cancel('cyclone');
  },

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
    await official.load();
    /* ⚠️ ECMWF 는 실패해도 나머지가 그대로 돌아야 한다 — 셋 다 각자 try 안에서 끝난다 */
    await ecmwfTc.load();
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

  /** 갱신으로 지워진 경로를 되돌린다 (draw 의 주석 참고) */
  _restore(sel) {
    if (!sel) return;
    const s = this.list.find(x => String(x.id) === String(sel));
    // ⚠️ 목록에서 빠진 태풍이면 되살리지 않는다 — 없는 것을 그리게 된다
    if (s) this.showTrack(s);
  },

  /** 현재 위치만 먼저 그린다. 경로는 선택했을 때 불러온다 (요청 절약) */
  draw() {
    /* ⚠️⚠️ removeAll() 은 **펼쳐 놓은 경로까지** 지운다.
       그런데 _selected 는 남아서, 다시 그리려 해도 showTrack() 이 맨 앞의
       `if (this._selected === s.id) return;` 에 걸려 되돌아온다.
       → 태풍 경로를 열어 둔 채 20분(REFRESH.cyclone)이 지나면 선이 통째로 사라지고
         **다른 태풍을 눌렀다 돌아오기 전에는 다시 안 나온다.**
       실제로 이 자리에서 걸렸다(검증 중 경로가 이유 없이 사라졌다).
       → 지우기 전에 무엇이 열려 있었는지 기억했다가 다시 그린다. */
    const sel = this._selected;
    this._selected = null;
    clearTimeout(this._spinTimer);
    this._spinTimer = null;
    power.cancel('cyclone');
    this.ds.entities.removeAll();
    this._tracks = {};
    let spinning = false;

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
      const spinUntil = Date.now() + CYCLONE_SPIN_MS;
      spinning = true;
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
              /* 수명 안에서는 끝 시각을 넘지 않게 한다. 수명이 끝나면 draw() 아래의
                 타이머가 CallbackProperty 자체를 ConstantProperty 로 바꾼다. */
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

    if (spinning) {
      /* 회전이 보이도록 이 시간만 렌더를 요청하고, 끝나면 CallbackProperty 자체도 뗀다.
         ⚠️ 시계 값만 고정하면 이후 줌·이동 때 팔마다 27좌표를 계속 다시 만든다. */
      /* 나선팔 하나가 매 장면 27개 좌표를 다시 만든다. 30fps 는 방향을 읽는 데
         필요하지 않으므로 15fps 로 제한해 CPU·GPU 작업을 절반으로 줄인다. */
      power.animate(CYCLONE_SPIN_MS, CYCLONE_FRAME_MS, 'cyclone');
      this._spinTimer = setTimeout(() => this._freezeArms(), CYCLONE_SPIN_MS + 100);
    }

    this._restore(sel);
  },

  /** 선택 시 — 지나온 경로 + 예보 원뿔을 불러 그린다 */
  /** 기관별 예보 경로. ⚠️ GDACS 와 무관하게 항상 그린다. */
  _drawForecasts(s, made, ko) {
    /* ══ 기관별 예보 경로 ═══════════════════════════════════════
       받은 지시: "태풍 진행 예상방향, 여러 개 기관들 예보되는 라인 그려달라"

       ⚠️⚠️ **색과 굵기를 반드시 가른다.** 공식 예보(기상청·JMA)와
          우리가 센 과거 사례가 같은 굵기로 그려지면 사용자는 셋 다 예보로 읽는다.
          그건 우리가 지켜온 선이 무너지는 지점이다.
            · 공식 예보  — 굵은 실선 + 시점 표시. 기관마다 다른 색
            · 과거 사례  — 아주 얇고 흐린 다발. 배경처럼 깔린다
       ⚠️ 기관이 다르면 선도 따로 그린다. 평균 내지 않는다. */
    /* ⚠️ 색만으로는 부족하다. 두 기관 예보가 거의 겹치면(오늘 기상청·JMA 가 그렇다)
       나중에 그린 선이 앞 선을 통째로 덮어 **한 기관만 있는 것처럼 보인다.**
       받은 지적: "노랑색과 초록색 기관 안 겹치게 해줘"
       → 위치를 옮기면 예보를 틀리게 그리는 것이므로, **대시 무늬를 서로 어긋나게** 둔다.
         한 선의 빈칸에서 다른 선이 드러나 둘 다 보인다. */
    const AG = {
      /* ⚠️ "기상청"만 쓰면 옆에 "일본 기상청"이 있어 어느 나라 것인지 헷갈린다.
         받은 지적: "한국 기상청이라고 넣어줘". 나라를 밝히는 자리에서는 밝힌다. */
      KMA:   { color: '#5ad1e8', ko: '한국 기상청',      dash: 0b1111111100000000, len: 20 },
      JMA:   { color: '#f2a65a', ko: '일본 기상청',      dash: 0b0000000011111111, len: 20 },
      NHC:   { color: '#c9a7ff', ko: '미국 NHC',        dash: 0b1100110011001100, len: 16 },
      /* ⚠️ ECMWF 만 **점**으로 그린다. 공식 통보문이 아니라 모델 원자료이기 때문이다.
         선이 성길수록 "이건 계산 결과"라는 뜻으로 읽힌다. */
      ECMWF: { color: '#ff7ab6', ko: '유럽중기예보센터', dash: 0b1010101010101010, len: 12,
               model: true },
    };
    const off = official.get(s.name);
    const eu = ecmwfTc.get(s.name);
    const groups = [...(off?.agencies || []), ...(eu ? [eu] : [])];

    /* ══ ECMWF 앙상블 진로 다발 ════════════════════════════════════
       각 선은 ECMWF 가 독립 계산한 한 멤버다. 평균·중심선을 새로 만들지 않는다.
       ⚠️ 중간 시각의 좌표가 없으면 앞뒤를 잇지 않는다. 이어 버리면 ECMWF 가 내지 않은
          구간을 earthus 가 직선으로 보간해 새 예보를 만드는 셈이다.
       ⚠️ 선택한 태풍에만 만들고, 무한 애니메이션은 없다. 51개 선은 흐린 배경으로 한 번만
          렌더해 결정론 진로와 공식 통보문이 계속 앞에서 읽히게 한다. */
    const ens = eu?.ensemble;
    (ens?.members || []).forEach(member => {
      const ordered = (member.steps || [])
        .filter(x => x.lat != null && x.lon != null)
        .sort((a, b) => a.h - b.h);
      const segments = [];
      let segment = [];
      ordered.forEach(x => {
        if (segment.length && x.h - segment[segment.length - 1].h > 6) {
          if (segment.length > 1) segments.push(segment);
          segment = [];
        }
        segment.push(x);
      });
      if (segment.length > 1) segments.push(segment);
      segments.forEach((points, si) => {
        const entity = this.ds.entities.add({
          id: `tc:${s.id}:ens:${member.member}:${si}`,
          show: this._ensembleVisible,
          polyline: {
            positions: lifted(points.map(x => [x.lon, x.lat]).flat(), LIFT_LINE_M - 400),
            width: member.type === 'control' ? 1.05 : 0.75,
            material: Cesium.Color.fromCssColorString('#ff7ab6')
              .withAlpha(member.type === 'control' ? 0.24 : 0.13),
            arcType: Cesium.ArcType.GEODESIC,
            clampToGround: false,
          },
        });
        entity._earthusEnsemble = true;
        made.push(entity);
      });
    });

    groups.forEach((g, gi) => {
      const steps = (g.steps || []).filter(x => x.lat != null && x.lon != null);
      if (steps.length < 2) return;
      const meta = AG[g.agency] || { color: '#8ee6c8', ko: g.agencyKo, dash: 255, len: 16 };
      const c = Cesium.Color.fromCssColorString(meta.color);

      made.push(this.ds.entities.add({
        id: `tc:${s.id}:fc:${g.agency}`,
        polyline: {
          positions: lifted(steps.map(x => [x.lon, x.lat]).flat()),
          width: 2.6,
          /* ⚠️ 예보선은 **점선**이다. 실선으로 그리면 지나온 경로와 구분이 안 되고,
             "정해진 길"처럼 읽힌다. */
          material: new Cesium.PolylineDashMaterialProperty({
            color: c.withAlpha(0.92), dashLength: meta.len, dashPattern: meta.dash,
          }),
          arcType: Cesium.ArcType.GEODESIC, clampToGround: false,
        },
      }));

      /* ══ 영향권 ══════════════════════════════════════════════════
         받은 지시: "보통 태풍 예보는 영향권으로 동그라미 연속으로 보여주니깐
                     우리도 그렇게 표시해주고"
         맞다. 기상청·JMA 통보문 그림이 정확히 그 꼴이다. 그리고 그 값이 이미 있었다 —
         받아만 놓고 **그리지 않고 있었다.**

         ⚠️⚠️ **실황과 예보를 같은 말로 부르면 안 된다.**
           · 지금(h=0)  강풍역·폭풍역   = 지금 실제로 그만큼 불고 있는 범위
           · 앞으로(h>0) 폭풍경계역     = 진로가 어긋날 가능성까지 더해 "닿을 수 있는" 범위
             실측(돌핀): +12h 230km → +117h 440km. **태풍이 커지는 게 아니라
             진로의 불확실성이 커지는 것**이다. 이걸 "폭풍반경"이라 적으면 거짓이 된다.
         ⚠️ 채운 원을 겹쳐 그리면 통보문의 그 길쭉한 영역이 저절로 만들어진다. */
      steps.forEach((x, i) => {
        const zone = radiusFn(x.stormArea);
        if (zone) {
          made.push(this.ds.entities.add({
            id: `tc:${s.id}:fc:${g.agency}:z${i}`,
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(
                Cesium.Cartesian3.fromDegreesArray(ringDegrees(x.lat, x.lon, zone))),
              height: LIFT_AREA_M,
              material: c.withAlpha(x.h ? 0.055 : 0.14),   // 실황은 조금 더 진하게
              outline: false, arcType: Cesium.ArcType.GEODESIC,
            },
          }));
        }
        // 강풍역(15m/s) — 실황에만 있고 **방위마다 다르다**
        const gale = radiusFn(x.galeArea);
        if (gale) {
          made.push(this.ds.entities.add({
            id: `tc:${s.id}:fc:${g.agency}:g${i}`,
            polygon: {
              hierarchy: new Cesium.PolygonHierarchy(
                Cesium.Cartesian3.fromDegreesArray(ringDegrees(x.lat, x.lon, gale))),
              height: LIFT_AREA_M,
              material: c.withAlpha(0.06), outline: false,
              arcType: Cesium.ArcType.GEODESIC,
            },
          }));
        }
        // 예보원 — 70% 확률로 중심이 이 안에 든다. ⚠️ 태풍 크기가 아니다.
        if (x.circleKm > 0) {
          made.push(this.ds.entities.add({
            id: `tc:${s.id}:fc:${g.agency}:c${i}`,
            polyline: {
              positions: lifted(ringDegrees(x.lat, x.lon, () => x.circleKm, 8)),
              width: 1.2,
              material: new Cesium.PolylineDashMaterialProperty({
                color: c.withAlpha(0.42), dashLength: 8,
              }),
              arcType: Cesium.ArcType.GEODESIC, clampToGround: false,
            },
          }));
        }
      });

      /* ══ 시점 표시 ══════════════════════════════════════════════
         ⚠️ 예전에는 **모든 스텝에 "+12h"** 를 찍었다. 두 가지가 잘못이었다.
           ① 읽는 사람이 "지금 몇 시지?" 부터 암산해야 한다. 기상청 통보문은
              "08월 04일 09시"로 적는다 — 그 방식이 맞다.
           ② 기관 3~4곳 × 스텝 7~8개 = 라벨 30개가 한 자리에 뭉쳤다.
         → **날짜가 바뀌는 첫 지점**과 **마지막 지점**에만 적는다. 기관당 4~6개가 된다. */
      const issued = g.issue || null;
      let lastDay = null;
      const marks = new Set();
      steps.forEach((x, i) => {
        if (!x.h) return;                                  // 지금 위치는 태풍 표시가 이미 있다
        const d = stepDate(x, issued);
        if (!d) return;
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (key !== lastDay) { marks.add(i); lastDay = key; }
      });
      marks.add(steps.length - 1);                          // 예보가 어디서 끝나는지

      steps.forEach((x, i) => {
        if (!x.h) return;
        const d = stepDate(x, issued);
        const show = marks.has(i) && d;
        /* ⚠️ 기관마다 라벨을 위/아래로 번갈아 놓는다. 같은 쪽에 두면 예보가 겹칠 때
           글자끼리 포개진다 — 오늘 기상청·JMA 가 실제로 그랬다. */
        const dy = (gi % 2 ? 1 : -1) * (18 + Math.floor(gi / 2) * 34);
        made.push(this.ds.entities.add({
          id: `tc:${s.id}:fc:${g.agency}:p${i}`,
          position: Cesium.Cartesian3.fromDegrees(x.lon, x.lat),
          point: {
            pixelSize: show ? 5.5 : 3.5, color: c,
            outlineColor: Cesium.Color.BLACK.withAlpha(0.5),
            outlineWidth: 1, disableDepthTestDistance: 900_000,
          },
          ...(show ? {
            label: {
              text: stepLabel(d, ko),
              font: '600 10px -apple-system, sans-serif',
              fillColor: Cesium.Color.WHITE.withAlpha(0.95),
              /* 배경을 깔아 글자를 알갱이로 만든다 — 겹쳐도 어느 쪽 것인지 보인다 */
              showBackground: true,
              backgroundColor: c.withAlpha(0.34),
              backgroundPadding: new Cesium.Cartesian2(6, 4),
              style: Cesium.LabelStyle.FILL,
              verticalOrigin: dy < 0 ? Cesium.VerticalOrigin.BOTTOM
                                     : Cesium.VerticalOrigin.TOP,
              pixelOffset: new Cesium.Cartesian2(0, dy),
              distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 12_000_000),
              disableDepthTestDistance: 900_000,
            },
          } : {}),
        }));
      });

      // 기관 이름은 선 끝에 한 번만
      const last = steps[steps.length - 1];
      made.push(this.ds.entities.add({
        id: `tc:${s.id}:fc:${g.agency}:name`,
        position: Cesium.Cartesian3.fromDegrees(last.lon, last.lat),
        label: {
          /* ⚠️ ECMWF 는 이름 옆에 "모델"을 붙인다. 안 붙이면 공식 통보문으로 읽힌다. */
          text: (ko ? meta.ko : g.agency) + (meta.model ? (ko ? ' 모델' : ' model') : ''),
          font: '600 11px -apple-system, sans-serif',
          fillColor: c, style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          outlineColor: Cesium.Color.BLACK.withAlpha(0.85), outlineWidth: 2.5,
          verticalOrigin: gi % 2 ? Cesium.VerticalOrigin.TOP : Cesium.VerticalOrigin.BOTTOM,
          pixelOffset: new Cesium.Cartesian2(0, gi % 2 ? 10 : -10),
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 14_000_000),
          disableDepthTestDistance: 900_000,
        },
      }));
    });

    this._legend(groups, AG, ko, !!analog.get(s.id, s.name)?.sample?.length, s, ens);
  },

  /* ══ 범례 ═════════════════════════════════════════════════════════
     받은 질문: "그리고 흰색 선은 뭐야?"
     ⚠️⚠️ **만든 사람이 자기 화면을 보고 못 알아봤다.** 그럼 아무도 못 알아본다.
        과거 유사 사례를 흐리게 깐 것은 "예보로 읽히면 안 되니까"였는데,
        흐리게 하는 것만으로는 **뜻을 지우기만 하고 알려주지는 못했다.**
        선을 그리면 그 선이 무엇인지도 같이 적어야 한다. */
  _legend(groups, AG, ko, hasAnalog, s, ensemble) {
    let box = document.getElementById('tcLegend');
    if (!box) {
      box = document.createElement('div');
      box.id = 'tcLegend';
      box.tabIndex = 0;
      box.addEventListener('click', e => {
        const btn = e.target.closest('[data-tcl-ensemble]');
        if (btn) {
          this._ensembleVisible = !this._ensembleVisible;
          this.ds.entities.values.forEach(entity => {
            if (entity._earthusEnsemble) entity.show = this._ensembleVisible;
          });
          btn.setAttribute('aria-pressed', String(this._ensembleVisible));
          btn.textContent = this._ensembleVisible
            ? (i18n.lang === 'ko' ? '진로 다발 숨기기' : 'Hide track bundle')
            : (i18n.lang === 'ko' ? '진로 다발 보이기' : 'Show track bundle');
          power.animate(300);
          return;
        }
        this._legendCollapsed = !this._legendCollapsed;
        this._paintLegendCollapse(box);
      });
      box.addEventListener('keydown', e => {
        // 안쪽 진로 다발 버튼의 키 입력은 그 버튼이 처리한다.
        if (e.target !== box || !['Enter', ' '].includes(e.key)) return;
        e.preventDefault();
        this._legendCollapsed = !this._legendCollapsed;
        this._paintLegendCollapse(box);
      });
      document.body.appendChild(box);
    }
    const row = (color, dashed, label, note) =>
      /* ⚠️ color 도 같이 준다 — 점선 항목은 border-top:dashed currentColor 로 그리는데,
         background 만 주면 글자색(흰색)으로 나와 어느 기관인지 알 수 없게 된다. */
      `<div class="tcl-row"><i style="color:${color};background:${color}"
        class="${dashed ? 'dash' : ''}"></i><b>${label}</b>${
        note ? `<span>${note}</span>` : ''}</div>`;

    /* ── 굵은 실선(GDACS 경로)을 범례 맨 위에 ─────────────────────
       받은 지적: "선이 4개네? 하나는 어디꺼야?"
       화면에서 제일 굵은 선인데 범례에 없었다. 제일 먼저 적는다. */
    const gsrc = String(s?.source || '').toUpperCase();
    const gwho = gsrc.includes('JTWC') ? (ko ? '미국 JTWC' : 'US JTWC')
               : gsrc.includes('NHC')  ? (ko ? '미국 NHC'  : 'US NHC')
               : (s?.source || 'GDACS');
    const gdacsRow = row(
      (ALERT[s?.alert] || ALERT.Green).color, false,
      gwho === 'GDACS' ? 'GDACS' : `${gwho} · GDACS`,
      ko ? '관측 경로와 진로' : 'observed track & path');

    const rows = groups.map(g => {
      const m = AG[g.agency] || { color: '#8ee6c8', ko: g.agencyKo };
      const horizon = (g.steps || []).reduce((a, x) => Math.max(a, x.h || 0), 0);
      const name = (ko ? m.ko : g.agency) + (m.model ? (ko ? ' 모델' : ' model') : '');
      const note = m.model
        ? (ko ? `수치모델 · ${horizon}시간` : `model output · ${horizon}h`)
        : (ko ? `공식 예보 · ${horizon}시간` : `official · ${horizon}h`);
      return row(m.color, true, name, note);
    });
    rows.unshift(gdacsRow);
    if ((ensemble?.members || []).length) {
      const total = ensemble.totalMembers || ensemble.members.length;
      const available = ensemble.availableByH || [];
      const last = available[available.length - 1];
      const count = last ? last.n : ensemble.members.length;
      rows.push(row('#ff7ab6', false,
        ko ? `ECMWF 앙상블 ${total}개 멤버` : `ECMWF ensemble ${total} members`,
        ko ? `화면 진로 ${ensemble.members.length}개 · ${last?.h ?? ''}시간 자료 ${count}개 · 평균 아님`
           : `${ensemble.members.length} shown · ${count} at ${last?.h ?? ''}h · not a mean`));
      rows.push(`<button type="button" class="tcl-toggle" data-tcl-ensemble
        aria-pressed="${this._ensembleVisible}">${this._ensembleVisible
          ? (ko ? '진로 다발 숨기기' : 'Hide track bundle')
          : (ko ? '진로 다발 보이기' : 'Show track bundle')}</button>`);
    }
    if (groups.some(g => (g.steps || []).some(x => x.circleKm > 0))) {
      rows.push(row('rgba(255,255,255,.55)', true,
        ko ? '옅은 동그라미' : 'Thin circles',
        ko ? '70% 확률로 중심이 드는 범위' : '70% probability circle'));
      rows.push(row('rgba(255,255,255,.22)', false,
        ko ? '넓게 칠한 띠' : 'Shaded band',
        ko ? '폭풍이 닿을 수 있는 범위' : 'storm watch area'));
    }
    if (hasAnalog) {
      rows.push(row('rgba(255,255,255,.55)', false,
        ko ? '흰 실선 다발' : 'Faint white lines',
        ko ? '과거 비슷했던 태풍들이 간 길 — 예보 아님'
           : 'where past similar storms went — not a forecast'));
    }
    box.innerHTML = `<div class="tcl-mini"><b>${ko ? '태풍 진로 안내' : 'Cyclone track guide'}</b>`
      + `<span>${ko ? '펼치기' : 'Expand'}</span></div>`
      + `<div class="tcl-detail">${rows.join('')}</div>`;
    this._paintLegendCollapse(box);
    box.classList.toggle('on', rows.length > 0);
  },

  _paintLegendCollapse(box = document.getElementById('tcLegend')) {
    if (!box) return;
    const ko = i18n.lang === 'ko';
    const collapsed = !!this._legendCollapsed;
    box.classList.toggle('collapsed', collapsed);
    box.setAttribute('aria-expanded', String(!collapsed));
    box.setAttribute('aria-label', collapsed
      ? (ko ? '태풍 진로 안내 펼치기' : 'Expand cyclone track guide')
      : (ko ? '태풍 진로 안내 접기' : 'Collapse cyclone track guide'));
  },

  /** 과거 유사 사례 다발. ⚠️ 예보가 아니다 — 얇고 흐리게만. */
  _drawAnalogs(s, made) {
    const anForPaths = analog.get(s.id, s.name);
    (anForPaths?.sample || []).forEach((h, i) => {
      const path = h.path || [];
      if (path.length < 3) return;
      made.push(this.ds.entities.add({
        id: `tc:${s.id}:an${i}`,
        polyline: {
          // ⚠️ 예보선보다 **낮게** 띄운다 — 배경으로 깔려야 한다
          positions: lifted(path.flat(), LIFT_AREA_M),
          width: 1,
          material: Cesium.Color.WHITE.withAlpha(0.16),
          arcType: Cesium.ArcType.GEODESIC, clampToGround: false,
        },
      }));
    });
  },

  async showTrack(s) {
    if (this._selected === s.id) return;
    const ko = i18n.lang === 'ko';
    this.clearTrack();
    this._selected = s.id;
    this._selStorm = s;   // 타임라인(setFxTime)이 쓴다

    const a = ALERT[s.alert] || ALERT.Green;
    const col = Cesium.Color.fromCssColorString(a.color);
    const made = [];

    /* ⚠️⚠️ 기관 예보선과 과거 사례는 **GDACS 와 무관하다.**
       예전에는 이 함수가 맨 앞에서 `if (!s.geometryUrl) return;` 로 빠져나가서,
       GDACS 가 죽으면(오늘이 그렇다) 아무 선도 안 그려졌다 — 우리가 이미 갖고 있는
       기상청·JMA 예보와 과거 사례까지 함께 사라졌다.
       → **먼저 그리고**, GDACS 원뿔은 받아지면 얹는다. */
    this._drawForecasts(s, made, ko);
    this._drawAnalogs(s, made);

    let g = null;
    if (s.geometryUrl) {
      try {
        const r = await fetchT(s.geometryUrl);
        if (!r.ok) throw new Error('geometry ' + r.status);
        g = await r.json();
      } catch (e) { console.warn('[cyclone] GDACS 경로 실패 — 예보선만 그린다:', e.message); }
    }
    if (!g) { this._tracks[s.id] = made; power.animate(300); return; }
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

    /* ── 이 실선의 이름표 ────────────────────────────────────────────
       받은 지적: "선이 4개네? 하나는 어디꺼야? 이름 없는 선"
       기상청·JMA·ECMWF 선에는 이름이 붙는데 이 GDACS 실선만 무명이었다.
       서태평양이면 원자료가 보통 미국 JTWC(하와이 합동태풍경보센터)다.
       ⚠️ 우리가 단정하지 않는다 — GDACS 가 주는 source 필드를 그대로 옮긴다. */
    if (segs.length) {
      const lastCs = segs[segs.length - 1].geometry?.coordinates;
      const tail = lastCs?.[lastCs.length - 1];
      if (tail) {
        const src = String(s.source || '').toUpperCase();
        const who = src.includes('JTWC') ? (ko ? '미국 JTWC' : 'US JTWC')
                  : src.includes('NHC')  ? (ko ? '미국 NHC'  : 'US NHC')
                  : (s.source || 'GDACS');
        made.push(this.ds.entities.add({
          id: `tc:${s.id}:recname`,
          position: Cesium.Cartesian3.fromDegrees(tail[0], tail[1]),
          label: {
            text: who === 'GDACS' ? 'GDACS'
                 : `${who}${ko ? ' (GDACS 제공)' : ' (via GDACS)'}`,
            font: '600 11px -apple-system, sans-serif',
            fillColor: col, style: Cesium.LabelStyle.FILL_AND_OUTLINE,
            outlineColor: Cesium.Color.BLACK.withAlpha(0.85), outlineWidth: 2.5,
            verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
            pixelOffset: new Cesium.Cartesian2(0, -14),
            distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 14_000_000),
            disableDepthTestDistance: 900_000,
          },
        }));
      }
    }

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
    // 예보 타임라인을 연다 — 스크러버·플레이 버튼 (받은 지시)
    import('../ui-timeline.js').then(m => m.fxTimeline.show(s)).catch(() => {});
  },

  /* ══ 타임라인 — 예보 시각의 기관별 위치 ═══════════════════════════
     받은 지시: "타임라인 잡고 움직이면 그 시간대 위치 볼 수 있게,
                플레이 버튼 누르면 시간대별로 움직임"
     ⚠️ 기관 위치를 하나로 합치지 않는다. 반투명 원반을 기관 색으로 각자 그린다 —
        겹치면 진해진다. 진한 곳 = 기관들이 대체로 동의하는 자리.
     ⚠️ 원반 반지름은 통보문의 폭풍 범위(radiusFn) 값이다. 값이 없는 기관은
        위치 점만 찍는다 — 그림용 상수로 채우지 않는다.
     ⚠️ 스텝 시각은 발표 시각 + h 라 기관마다 어긋난다. stepDate 로 절대 시각을
        만들어 "지금 + fxH" 와 맞춘다. 시각을 못 만들거나 예보가 그 시각까지
        안 가면 그 기관은 안 그린다 — 연장하지 않는다. */
  _fx: [],
  setFxTime(fxH) {
    this._fx.forEach(e => { try { this.ds.entities.remove(e); } catch (_) {} });
    this._fx = [];
    const s = this._selStorm;
    if (fxH == null || !s || !this._selected) { power.animate(400); return; }
    const AGC = { KMA: '#5ad1e8', JMA: '#f2a65a', NHC: '#c9a7ff', ECMWF: '#ff7ab6' };
    const target = Date.now() + fxH * 3_600_000;
    const off = official.get(s.name);
    const eu = ecmwfTc.get(s.name);
    const groups = [...(off?.agencies || []), ...(eu ? [eu] : [])];
    groups.forEach(g => {
      const issued = g.issue || null;
      const steps = [{ _abs: Date.now(), lat: s.lat, lon: s.lon, stormArea: null },
        ...(g.steps || [])
          .filter(x => x.lat != null && x.lon != null)
          .map(x => ({ ...x, _abs: stepDate(x, issued)?.getTime() }))
          .filter(x => x._abs)]
        .sort((x, y) => x._abs - y._abs);
      let a = null, b = null;
      for (const x of steps) {
        if (x._abs <= target) a = x;
        if (x._abs >= target) { b = x; break; }
      }
      if (!a || !b) return;
      const t = b._abs === a._abs ? 0 : (target - a._abs) / (b._abs - a._abs);
      const lat = a.lat + (b.lat - a.lat) * t;
      const lon = a.lon + (b.lon - a.lon) * t;
      const col = Cesium.Color.fromCssColorString(AGC[g.agency] || '#8ee6c8');
      const rf = radiusFn((t < 0.5 ? a : b).stormArea);
      const km = rf ? Math.max(rf(0), rf(90), rf(180), rf(270)) : null;
      if (km) {
        this._fx.push(this.ds.entities.add({
          position: Cesium.Cartesian3.fromDegrees(lon, lat),
          ellipse: {
            semiMajorAxis: km * 1000, semiMinorAxis: km * 1000,
            height: LIFT_AREA_M,
            material: col.withAlpha(0.13),
            outline: true, outlineColor: col.withAlpha(0.5), outlineWidth: 1,
          },
        }));
      }
      this._fx.push(this.ds.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat),
        point: { pixelSize: 7, color: col,
                 outlineColor: Cesium.Color.BLACK.withAlpha(0.6), outlineWidth: 1.5,
                 disableDepthTestDistance: 900_000 },
      }));
    });
    power.animate(500);
  },

  clearTrack() {
    this.setFxTime(null);
    this._selStorm = null;
    import('../ui-timeline.js').then(m => m.fxTimeline.hide()).catch(() => {});
    Object.values(this._tracks).flat().forEach(e => {
      try { this.ds.entities.remove(e); } catch (_) {}
    });
    this._tracks = {};
    this._selected = null;
    // ⚠️ 선을 지웠으면 범례도 지운다. 남으면 없는 선을 설명하게 된다.
    document.getElementById('tcLegend')?.classList.remove('on');
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
      d[ko ? '출처' : 'Source'] = 'Global Disaster Awareness and Coordination System, GDACS · CC BY 4.0';
      d['_note'] = ko
        ? 'GDACS 실시간 목록에서 빠진 폭풍입니다. 화면의 경로는 **우리가 매시간 기록한 위치**이며 공식 베스트트랙이 아닙니다. 목록에서 빠진 이유(약화·상륙·온대저기압화)는 자료에 나오지 않아 표시하지 않습니다. GDACS 영향 추정은 자동 모델 산출물이며 지역 당국의 공식 경보가 아닙니다.'
        : 'This storm has dropped out of the GDACS live list. The track shown is **our own hourly record**, not an official best track. GDACS does not say why a storm leaves the list, so we do not claim a reason. GDACS impact estimates are automated model outputs, not official alerts from local authorities.';
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
    d[ko ? '자동 영향 추정' : 'Automated impact estimate'] = ko ? a.ko : a.en;
    if (s.countries?.length) d[ko ? '영향권' : 'Affected'] = s.countries.join(', ');
    d[ko ? '발생' : 'Formed'] = (s.from || '').slice(0, 16).replace('T', ' ');
    d[ko ? '최신 관측' : 'Latest'] = (s.to || '').slice(0, 16).replace('T', ' ');
    d[ko ? '출처' : 'Source'] = `${s.source || '원 기관'} · Global Disaster Awareness and Coordination System, GDACS`;
    if (s.report) d[ko ? '상세 보고서' : 'Full report'] = s.report;

    /* ── 각국 기상기관 공식 예보 ────────────────────────────────
       받은 지시: "미국 일본 한국 중에 **먼저 발표된 걸로** 말해주면 돼 — 태풍 소멸 등"
                  "발표는 매일 바뀌니깐 예측 문장도 매일 바뀌어야 해, 기관 업데이트 기준으로"

       ⚠️⚠️ 여기 있는 값은 **하나도 우리 것이 아니다.** 진로·강도·약화 전망은
          전부 각 기관의 발표이고 우리는 옮기기만 한다. 주어를 우리로 바꾸는
          순간 자체 예보가 되고, 그건 규율 위반이자 기상업무법 문제다.
       ⚠️⚠️ **기관이 다르면 다르다고 그대로 말한다.** 평균 내거나 하나로 합치지 않는다
          (지진에서 JMA·USGS 를 다루는 방식과 같다).
       ⚠️ 문장은 **발표 시각과 함께** 적는다. 매시간 다시 받으므로 발표가 바뀌면
          문장도 바뀐다 — 그 근거가 화면에 보여야 한다. */
    const off = official.get(s.name);
    if (off?.agencies?.length) {
      const fmt = (t) => (t || '').replace('T', ' ').slice(0, 16);
      // 발표가 새로운 기관부터
      const ags = [...off.agencies].sort((a, b) => (b.issue || '').localeCompare(a.issue || ''));

      ags.forEach(g => {
        const st = g.steps || [];
        const now0 = st.find(x => x.h === 0) || st[0];
        const last = st[st.length - 1];
        const bits = [];
        if (now0) {
          bits.push(ko
            ? `현재 ${now0.categoryKo ? now0.categoryKo + ' ' : ''}`
              + `${now0.windMs != null ? `최대풍속 ${now0.windMs} m/s` : ''}`
              + `${now0.intensityKo ? `·「${now0.intensityKo}」` : ''}`
              + `${now0.courseKo ? `, ${now0.courseKo}쪽으로` : ''}`
              + `${now0.speedKmh ? ` 시속 ${now0.speedKmh}km` : ''}`
              + `${now0.place ? ` (${now0.place})` : ''}.`
            : `Now ${now0.category || ''} ${now0.windMs ?? '—'} m/s.`);
        }
        if (last && last.h) {
          bits.push(ko
            ? `**+${last.h}시간**${last.validKst || last.validUtc
                ? `(${fmt(last.validKst || last.validUtc)})` : ''}에는 `
              + `${last.place ? `**${last.place}**, ` : ''}`
              + `${last.categoryKo ? last.categoryKo + ' ' : ''}`
              + `${last.windMs != null ? `${last.windMs} m/s` : ''}`
              + `${last.intensityKo ? `·「${last.intensityKo}」` : ''}로 예보합니다.`
            : `At +${last.h} h: ${last.place || ''} ${last.windMs ?? '—'} m/s.`);
        }
        if (g.downgrade) {
          bits.push(ko
            ? `⚠️ **+${g.downgrade.h}시간에 ${g.downgrade.toKo || g.downgrade.to}로 바뀔 것**으로 봅니다.`
            : `⚠️ Change to ${g.downgrade.to} at +${g.downgrade.h} h.`);
        }
        if (g.basinNote) bits.push(ko ? `(${g.basinNote.ko})` : `(${g.basinNote.en})`);
        d[`${ko ? g.agencyKo : g.agency} 예보 · ${fmt(g.issue)} 발표`] = bits.join(' ');
      });

      // ⚠️ "먼저 발표한 곳"을 앞세우되 나머지를 지우지 않는다 (위에서 이미 다 적었다)
      if (off.earliestDowngrade) {
        const e = off.earliestDowngrade;
        d[ko ? '약화를 먼저 예보한 곳' : 'First to forecast weakening'] = ko
          ? `${e.agencyKo} — +${e.h}시간에 ${e.toKo || e.to}`
          : `${e.agency} — ${e.to} at +${e.h} h`;
      }
      d[ko ? '⚠️ 기관 비교' : '⚠️ Agencies'] = ko
        ? `${ags.length}개 기관의 발표를 **그대로** 옮겼습니다. 서로 다를 수 있으며 `
          + '저희가 하나로 합치거나 평균 내지 않습니다. 실제 대응은 기상청 발표를 따르세요.'
        : `${ags.length} agencies, relayed verbatim and not merged.`;
    }

    /* ECMWF 앙상블은 공식 통보문 아래에 따로 둔다.
       ⚠️ 기관 예보 수에 합치지 않는다. 51개 멤버를 "51개 기관"으로 읽히게 하거나,
          평균 진로처럼 요약하면 자료의 성격이 바뀐다. 화면에 실제 그릴 수 있는 진로 수와
          마지막 시각에 좌표가 있는 수만 그대로 센다. */
    const eu = ecmwfTc.get(s.name);
    const ens = eu?.ensemble;
    if ((ens?.members || []).length) {
      const available = ens.availableByH || [];
      const last = available[available.length - 1];
      const total = ens.totalMembers || ens.members.length;
      d[ko ? `ECMWF 앙상블 · ${eu.run || '회차 미상'}`
           : `ECMWF ensemble · ${eu.run || 'run unknown'}`] = ko
        ? `전체 ${total}개 멤버 중 **화면에 그릴 수 있는 진로 ${ens.members.length}개**입니다. `
          + (last ? `+${last.h}시간 좌표는 ${last.n}개 멤버에 있습니다. ` : '')
          + '각 선은 서로 다른 모델 계산 결과이며 **평균 진로가 아닙니다**. '
          + '사람이 검토해 발표한 공식 통보문도 아닙니다.'
        : `${ens.members.length} drawable tracks from ${total} members. `
          + (last ? `${last.n} members have coordinates at +${last.h} h. ` : '')
          + 'Each line is an independent model calculation, not a mean track or an official bulletin.';
    }

    const an = analog.get(s.id, s.name);

    /* ── 주변의 실제 관측은 얼마나 있나 ─────────────────────────
       사용자가 말한 "A에서 본 변화가 B·C에서도 이어졌나"의 출발점이다.
       ⚠️ 아직 관측소 연쇄를 인과관계·진로 예측으로 바꾸지 않는다. 지상과 부이는
       태풍 주변의 표면 상태를 확인하는 서로 다른 관측망이고, 빈 방위는 '안전'이 아니라
       '직접 근거가 적음'이다. 그래서 수·시각·자료원만 그대로 보여 준다. */
    const se = an?.surfaceEvidence;
    if (se) {
      const srcName = { gts: ko ? '세계 지상관측 GTS' : 'Global GTS',
                        metar: 'METAR', buoy: ko ? '해양 부이' : 'Ocean buoys' };
      const bySource = (se.bySource || []).map(x => {
        const name = srcName[x.id] || x.id;
        return ko
          ? `${name} ${x.n}곳 (최근 ${se.freshWithinMinutes}분 ${x.freshN} · 바람 ${x.windN} · 기압 ${x.pressureN})`
          : `${name} ${x.n} (${x.freshN} within ${se.freshWithinMinutes} min · wind ${x.windN} · pressure ${x.pressureN})`;
      }).join(' · ');
      d[ko ? `주변 표면 관측 · 반경 ${se.radiusKm}km` : `Nearby surface observations · ${se.radiusKm} km`] = ko
        ? `총 ${se.n}곳 중 최근 ${se.freshWithinMinutes}분 관측 ${se.freshN}곳. ${bySource}`
        : `${se.n} total; ${se.freshN} observed within ${se.freshWithinMinutes} min. ${bySource}`;
      const sectorText = (se.sectors || []).map(x =>
        `${ko ? x.dir : x.dirEn} ${x.n}${ko ? `곳/최근 ${x.freshN}` : `/fresh ${x.freshN}`}`).join(' · ');
      if (sectorText) d[ko ? '방위별 직접 관측' : 'Direct observations by direction'] = sectorText;
      const times = (se.sources || []).map(x => {
        const label = srcName[x.id] || x.id;
        const at = x.observedUtc || x.generated || '—';
        return `${label} n=${x.count} · ${at}`;
      }).join(' / ');
      if (times) d[ko ? '관측 자료원·시각' : 'Observation sources · time'] = times;
      if ((se.missing || []).length) {
        d[ko ? '⚠️ 못 받은 관측망' : '⚠️ Unavailable observation feeds'] = (se.missing || [])
          .map(x => srcName[x] || x).join(' · ');
      }
    }

    /* ── 왜 이 방향인가 ────────────────────────────────────────
       받은 요청: "중국쪽 고기압, 일본쪽 저기압 때문에 … 편서풍 때문에 …
                   이렇게 될 것으로 예상된다" 식으로 설명해 달라.

       ⚠️⚠️ 그중 **"이렇게 될 것으로 예상된다"는 쓰지 않는다.** 진로와 소멸을
          단정하는 것은 예보이고 우리는 예보 기관이 아니다.
          대신 **왜 그 방향인지는 실제로 잰 기압장으로 말할 수 있다** —
          아래 문장의 숫자는 전부 500hPa 관측(모델 해석)에서 나온 것이고,
          '앞으로'에 해당하는 부분은 **과거를 센 결과**로만 적는다.

       ⚠️ 문장을 서버가 만들지 않는다. 서버는 숫자만 주고 여기서 조립한다 —
          그래야 화면의 각 숫자가 어디서 왔는지 추적할 수 있다. */
    const sv = an?.steering;
    if (sv) {
      const dir8 = (deg) => (ko ? ['북','북동','동','남동','남','남서','서','북서']
                                : ['N','NE','E','SE','S','SW','W','NW'])[Math.round(deg / 45) % 8];
      const parts = [];

      // ① 무엇이 밀고 있나 — 북태평양 고기압의 위치
      if (sv.ridgeWestLon != null || sv.ridgeNorthLat != null) {
        const w = sv.ridgeWestLon, n = sv.ridgeNorthLat;
        parts.push(ko
          ? `상공 5.5km(500hPa)에서 **북태평양 고기압**(지위고도 ${sv.ridgeGpm}m 이상)이 `
            + (w != null ? `서쪽으로 **${Math.abs(w).toFixed(0)}°${w < 0 ? 'W' : 'E'}**까지` : '')
            + (w != null && n != null ? ', ' : '')
            + (n != null ? `북쪽으로 **${n.toFixed(0)}°N**까지` : '')
            + ` 뻗어 있습니다 (관측 최대 ${sv.maxGpm}m).`
          : `At 500 hPa the **subtropical high** (≥ ${sv.ridgeGpm} m) reaches `
            + (w != null ? `**${Math.abs(w).toFixed(0)}°${w < 0 ? 'W' : 'E'}** westward` : '')
            + (w != null && n != null ? ' and ' : '')
            + (n != null ? `**${n.toFixed(0)}°N** northward` : '')
            + ` (max ${sv.maxGpm} m).`);
        parts.push(ko
          ? '태풍은 이 고기압의 **가장자리를 따라** 움직입니다.'
          : 'Storms travel **along the edge** of this high.');
      } else {
        // ⚠️ 못 찾았으면 "고기압이 없다"가 아니라 "본 범위 안에 없다"고 적는다
        parts.push(ko
          ? `주변 ${sv.sampled.latFrom.toFixed(0)}~${sv.sampled.latTo.toFixed(0)}°N 범위에서는 `
            + `${sv.ridgeGpm}m 이상 구역을 찾지 못했습니다.`
          : `No ≥ ${sv.ridgeGpm} m area within the sampled box.`);
      }

      // ② 실제 지향류 — ⚠️ 고리 평균이다. 중심에서 재면 태풍 자기 바람이 잡힌다.
      if (sv.steerDir != null) {
        parts.push(ko
          ? `이 배치에서 나오는 지향류는 **${dir8(sv.steerDir)}쪽 ${sv.steerSpeed} m/s**입니다 `
            + `(태풍 중심을 뺀 반경 ${sv.steerRingDeg}° 고리 ${sv.steerRingN}곳 평균).`
          : `The resulting steering flow is **${dir8(sv.steerDir)} at ${sv.steerSpeed} m/s** `
            + `(mean of ${sv.steerRingN} points on a ${sv.steerRingDeg}° ring, centre excluded).`);
      }

      // ③ 편서풍대 — 교과서 설명을 **세어서** 말한다
      const rc = an.recurve;
      if (rc && rc.medianLat != null && rc.turned) {
        parts.push(ko
          ? `북쪽으로 올라가 **편서풍대**에 들면 진행이 북동으로 꺾입니다(전향). `
            + `유사 사례 ${rc.n}건 중 **${rc.turned}건**이 그렇게 꺾였고`
            + (rc.pct != null ? ` (${rc.pct}%)` : '')
            + `, 꺾인 위도는 중앙값 **${rc.medianLat}°N**이었습니다.`
          : `Further north the **westerlies** turn storms northeast (recurvature). `
            + `**${rc.turned}** of ${rc.n} analogues did so`
            + (rc.pct != null ? ` (${rc.pct}%)` : '')
            + `, at a median latitude of **${rc.medianLat}°N**.`);
      }

      d[ko ? '왜 이 방향인가' : 'Why this direction'] = parts.join(' ');
      d[ko ? '기압장 출처' : 'Pressure field'] = sv.source;
    }

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
        /* ⚠️ 2026-08-02 알고리즘을 논문 기준으로 갈아엎었는데 **이 화면만 옛 필드를
           읽고 있었다** — 화면에 "반경 undefined km · 진행방향 ±undefined°" 가
           그대로 나왔다. 서버 자료 구조를 바꿀 때 읽는 쪽을 같이 고쳐야 한다. */
        const w = an.why;
        if (w) {
          d[ko ? '유사 판정 기준' : 'Match criteria'] = ko
            ? `계절 ±${w.seasonWindowDays}일 · 최근 ${(w.windowPts - 1) * w.stepH}시간 경로 비교 · `
              + `가까운 순 ${w.topN}건 · 이후 ${w.lookAheadH}시간`
            : `±${w.seasonWindowDays} days of season · last ${(w.windowPts - 1) * w.stepH} h of track · `
              + `nearest ${w.topN} · next ${w.lookAheadH} h`;
          d[ko ? '판정 방식' : 'Method'] = w.method;
        }
      }
    }

    d['_note'] = (s.stale
      ? (ko ? '⚠️ 지금 GDACS(전지구 재난경보시스템)가 응답하지 않아, 저희가 보관해 둔 마지막 경로를 보여드리고 있습니다. 현재 위치·강도는 그 이후 달라졌을 수 있습니다. 실제 대응은 기상청 발표를 따르세요. '
            : '⚠️ GDACS is not responding, so this shows the last track we archived. Current position and intensity may have changed since. ')
      : '') + (ko
      ? 'GDACS 영향 추정은 자동 모델 산출물이며 지역 당국의 공식 경보가 아닙니다. 점선 원뿔은 예보 범위입니다. 실제 경로는 달라질 수 있습니다.'
        + (an && an.matches
            ? ' ⚠️ 「과거 유사 사례」는 예보가 아닙니다 — 위치·진행방향·강도가 비슷했던 과거 태풍이 이후 어디로 갔는지 센 기록입니다. 판정 기준은 우리가 정한 값이며 공인 표준이 아닙니다. 실제 대응은 기상청 공식 발표를 따르세요.'
            : '')
      : 'GDACS impact estimates are automated model outputs, not official alerts from local authorities. The dotted cone is a forecast range — the actual track may differ.'
        + (an && an.matches
            ? ' ⚠️ "Past analogues" is not a forecast — it counts where similar past storms went. Follow official warnings.'
            : ''));
    if (se) {
      d['_note'] += ko
        ? ' 주변 표면 관측은 현재 상태를 확인하는 근거입니다. 이 앱은 아직 관측소 연쇄를 자체 진로 예측이나 기관별 우열 판단으로 사용하지 않습니다.'
        : ' Nearby surface observations are evidence for current conditions. Earthus does not use station chains to issue its own track forecast or rank agencies.';
    }
    return { title: `${s.name}`, rows: d };
  },
};
