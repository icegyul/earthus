// 항로 (ROUTE) — 검색창에 "인천 > 나리타 > 로스앤젤레스"를 넣으면
// 그 구간을 지구 위에 잇고, 각 공항의 지금 날씨와 도착 예정 시각의 예보를 보여준다.
//
// 이건 항공편 추적이 아니다. 실제 편명·위치·지연을 받지 않는다.
// (항공편 추적 레이어는 adsb.lol에 CORS 헤더가 없어 잠금 상태로 남아 있다)
// 여기서 그리는 선은 두 공항 사이의 **대권 경로**이고, 시각은 **우리가 계산한 추정**이다.
//
// 지시서 v5.3이 정한 문법을 따른다:
//   15.3 Flow      — 이동/물류는 방향과 속도의 의미를 유지한다 → 대시가 출발→도착으로 흐른다
//   15.5 Truth Lens — 관측과 모델을 같은 색·같은 선으로 합치지 않는다
//   17B TRACK      — 경로는 visualType TRACK, truthClass DERIVED
//   R-11 Dive Replay — 실제 경로는 실선, **추정 경로는 파선**. 항로는 계산이므로 파선이다.
import * as THREE from '../../vendor/three-r184.module.min.js';

const R_M = 6371000;

// 순항 가정. 이 두 숫자가 모든 예상 시각의 출처다 — 화면에도 그대로 밝힌다.
const CRUISE_KMH = 875;   // 장거리 제트기의 평균 대지속도
const OVERHEAD_MIN = 30;  // 지상 활주 + 상승 + 강하 여유
const LAYOVER_MIN = 90;   // 경유 1회당 가정. 실제 연결시간은 편마다 다르다.
const CRUISE_M = 11000;   // 순항 고도 — 지형 과장과 같은 배율로 띄운다

const llToV3 = (latDeg, lonDeg, r) => {
  const la = (latDeg * Math.PI) / 180;
  const lo = (lonDeg * Math.PI) / 180;
  const cl = Math.cos(la);
  return new THREE.Vector3(r * cl * Math.sin(lo), r * Math.sin(la), r * cl * Math.cos(lo));
};

// 한글로 치는 공항. 공항 원자료(OurAirports 계열)는 영문뿐이라 여기서 이어 준다.
// 한국에서 실제로 타는 노선 위주의 **수기 목록**이며, 없는 곳은 IATA·영문으로 찾는다.
const KO_ALIAS = Object.freeze({
  인천: 'ICN', 김포: 'GMP', 제주: 'CJU', 김해: 'PUS', 부산: 'PUS', 대구: 'TAE',
  청주: 'CJJ', 무안: 'MWX', 양양: 'YNY', 여수: 'RSU', 울산: 'USN', 포항: 'KPO',
  나리타: 'NRT', 하네다: 'HND', 도쿄: 'NRT', 간사이: 'KIX', 오사카: 'KIX',
  나고야: 'NGO', 후쿠오카: 'FUK', 삿포로: 'CTS', 오키나와: 'OKA',
  베이징: 'PEK', 상하이: 'PVG', 광저우: 'CAN', 칭다오: 'TAO', 선전: 'SZX',
  홍콩: 'HKG', 마카오: 'MFM', 타이베이: 'TPE', 가오슝: 'KHH',
  방콕: 'BKK', 푸껫: 'HKT', 치앙마이: 'CNX', 싱가포르: 'SIN',
  쿠알라룸푸르: 'KUL', 자카르타: 'CGK', 발리: 'DPS', 덴파사르: 'DPS',
  싱가폴: 'SIN', 코타키나발루: 'BKI', 나트랑: 'CXR', 푸꾸옥: 'PQC',
  마닐라: 'MNL', 세부: 'CEB', 하노이: 'HAN', 호치민: 'SGN', 다낭: 'DAD',
  프놈펜: 'PNH', 비엔티안: 'VTE', 양곤: 'RGN', 울란바토르: 'UBN',
  델리: 'DEL', 뭄바이: 'BOM', 두바이: 'DXB', 도하: 'DOH', 아부다비: 'AUH',
  이스탄불: 'IST', 텔아비브: 'TLV', 카이로: 'CAI', 나이로비: 'NBO',
  요하네스버그: 'JNB', 아디스아바바: 'ADD',
  런던: 'LHR', 히스로: 'LHR', 파리: 'CDG', 드골: 'CDG',
  프랑크푸르트: 'FRA', 뮌헨: 'MUC', 암스테르담: 'AMS', 취리히: 'ZRH',
  로마: 'FCO', 밀라노: 'MXP', 마드리드: 'MAD', 바르셀로나: 'BCN',
  리스본: 'LIS', 빈: 'VIE', 프라하: 'PRG', 부다페스트: 'BUD',
  바르샤바: 'WAW', 헬싱키: 'HEL', 스톡홀름: 'ARN', 코펜하겐: 'CPH',
  오슬로: 'OSL', 모스크바: 'SVO', 이르쿠츠크: 'IKT',
  로스앤젤레스: 'LAX', 로스엔젤레스: 'LAX', 로스앤젤스: 'LAX', 로스엔젤스: 'LAX',
  엘에이: 'LAX', 샌프란시스코: 'SFO', 시애틀: 'SEA', 앵커리지: 'ANC',
  뉴욕: 'JFK', 워싱턴: 'IAD', 시카고: 'ORD', 애틀랜타: 'ATL',
  댈러스: 'DFW', 보스턴: 'BOS', 라스베이거스: 'LAS', 호놀룰루: 'HNL',
  밴쿠버: 'YVR', 토론토: 'YYZ', 멕시코시티: 'MEX', 칸쿤: 'CUN',
  상파울루: 'GRU', 상파울로: 'GRU', 리마: 'LIM', 부에노스아이레스: 'EZE', 산티아고: 'SCL',
  라스베가스: 'LAS', 몬트리올: 'YUL', 호놀루루: 'HNL',
  시드니: 'SYD', 멜버른: 'MEL', 브리즈번: 'BNE', 오클랜드: 'AKL',
  괌: 'GUM', 사이판: 'SPN', 나디: 'NAN',
});

// WMO 날씨코드 — 공항에서 중요한 것만 남긴 짧은 표기
const WMO = Object.freeze({
  0: '맑음', 1: '대체로 맑음', 2: '구름 조금', 3: '흐림',
  45: '안개', 48: '착빙 안개',
  51: '이슬비 약', 53: '이슬비', 55: '이슬비 강',
  56: '어는 이슬비', 57: '어는 이슬비 강',
  61: '비 약', 63: '비', 65: '비 강',
  66: '어는 비', 67: '어는 비 강',
  71: '눈 약', 73: '눈', 75: '눈 강', 77: '싸락눈',
  80: '소나기 약', 81: '소나기', 82: '소나기 강',
  85: '소낙눈 약', 86: '소낙눈 강',
  95: '뇌우', 96: '뇌우·우박 약', 99: '뇌우·우박 강',
});

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const pad2 = (n) => String(n).padStart(2, '0');

// 대권 거리 (km)
function greatCircleKm(a, b) {
  const toR = Math.PI / 180;
  const dLat = (b.lat - a.lat) * toR;
  const dLon = (b.lon - a.lon) * toR;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(a.lat * toR) * Math.cos(b.lat * toR) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(s)));
}

// 출발 방위 (도) — 방향의 의미를 카드에도 남긴다
function initialBearing(a, b) {
  const toR = Math.PI / 180;
  const dLon = (b.lon - a.lon) * toR;
  const y = Math.sin(dLon) * Math.cos(b.lat * toR);
  const x = Math.cos(a.lat * toR) * Math.sin(b.lat * toR)
    - Math.sin(a.lat * toR) * Math.cos(b.lat * toR) * Math.cos(dLon);
  return (Math.atan2(y, x) / toR + 360) % 360;
}

const COMPASS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
const compass = (deg) => COMPASS[Math.round(((deg % 360) + 360) % 360 / 45) % 8];

// 흐르는 파선. 대시가 출발 → 도착으로 흐르므로 선 자체가 방향을 말한다(15.3).
// 파선인 이유는 이 경로가 관측이 아니라 계산이기 때문이다(R-11 · 15.5).
const ROUTE_VS = `
attribute float aDist;
varying float vD;
void main() {
  vD = aDist;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;
const ROUTE_FS = `
precision mediump float;
uniform vec3 uColor;
uniform float uTime;
uniform float uOpacity;
varying float vD;
void main() {
  float f = fract(vD * 26.0 - uTime * 0.55);
  if (f > 0.55) discard;                       // 파선 — 추정 경로
  float head = smoothstep(0.55, 0.0, f);       // 진행 방향으로 밝아진다
  gl_FragColor = vec4(uColor * (0.55 + 0.75 * head), uOpacity);
}`;

export class FlightRoute {
  // aboveR: 순항 셸 반경을 주는 함수 (지형 과장과 같은 배율)
  constructor(scene, getExagger) {
    this.group = new THREE.Group();
    this.group.renderOrder = 6;
    scene.add(this.group);
    this.getExagger = getExagger;
    this.stops = null;
    this.legs = null;
    this.mats = [];
    this.labelBox = document.createElement('div');
    this.labelBox.id = 'route-labels';
    document.body.appendChild(this.labelBox);
    this.labels = [];
  }

  cruiseR() {
    return 1 + (CRUISE_M / R_M) * this.getExagger();
  }

  active() { return !!this.stops; }

  // ---------- 질의 해석 ----------
  // "ICN>NRT>LAX" · "인천 나리타 로스앤젤레스" · "인천공항 → 나리타 → 로스엔젤레스"
  // 경유지가 하나도 안 잡히면 null (평소 검색을 방해하지 않는다)
  static parse(q, airports) {
    if (!q || !airports || !airports.length) return null;
    const raw = q.replace(/->|=>/g, '>').split(/[>→,/]|\s+-\s+/).map((s) => s.trim()).filter(Boolean);
    let parts = raw;
    // 구분자 없이 "ICN NRT LAX" 처럼 코드만 나열한 경우
    if (parts.length === 1) {
      const toks = parts[0].split(/\s+/).filter(Boolean);
      if (toks.length >= 2 && toks.every((t) => /^[A-Za-z]{3}$/.test(t))) parts = toks;
      else return null;
    }
    if (parts.length < 2) return null;
    const stops = [];
    for (const p of parts) {
      const a = FlightRoute.resolve(p, airports);
      if (!a) return { error: p };
      stops.push(a);
    }
    // 같은 공항이 연달아 오면 구간이 성립하지 않는다
    for (let i = 1; i < stops.length; i += 1) {
      if (stops[i].iata === stops[i - 1].iata) return { error: `${stops[i].iata} 연속` };
    }
    return { stops };
  }

  static resolve(token, airports) {
    const t = token.trim();
    if (!t) return null;
    const up = t.toUpperCase();
    const ko = t.replace(/(국제)?공항$/, '');
    const alias = KO_ALIAS[ko] || KO_ALIAS[t];
    const wanted = alias || (/^[A-Z]{3}$/.test(up) ? up : null);
    const rows = [];
    for (const a of airports) {
      const [iata, name, city, cc, lat, lon, tier] = a;
      if (lat == null || lon == null) continue;
      if (wanted) {
        if (iata === wanted) return { iata, name, city, cc, lat, lon, tier };
        continue;
      }
      const lc = t.toLowerCase();
      if ((city || '').toLowerCase().includes(lc) || (name || '').toLowerCase().includes(lc)) {
        rows.push({ iata, name, city, cc, lat, lon, tier });
      }
    }
    if (!rows.length) return null;
    // 큰 공항 우선 (원자료의 등급 필드: 주요 허브가 0)
    rows.sort((x, y) => (x.tier || 0) - (y.tier || 0));
    return rows[0];
  }

  // ---------- 구간 계산 ----------
  // 여기서 나오는 모든 시각은 우리가 계산한 것이다. 실제 운항 시각표가 아니다.
  static computeLegs(stops, departMs) {
    const legs = [];
    let t = departMs;
    for (let i = 1; i < stops.length; i += 1) {
      const a = stops[i - 1];
      const b = stops[i];
      const km = greatCircleKm(a, b);
      const min = Math.round((km / CRUISE_KMH) * 60 + OVERHEAD_MIN);
      const dep = t;
      const arr = dep + min * 60000;
      legs.push({ from: a, to: b, km, min, dep, arr, bearing: initialBearing(a, b) });
      t = arr + LAYOVER_MIN * 60000;   // 경유 가정 — 실제 연결시간은 편마다 다르다
    }
    return legs;
  }

  // ---------- 그리기 ----------
  show(stops) {
    this.clear();
    this.stops = stops;
    const r = this.cruiseR();
    const col = new THREE.Color(0x7fb7f5);

    for (let i = 1; i < stops.length; i += 1) {
      const a = stops[i - 1];
      const b = stops[i];
      const va = llToV3(a.lat, a.lon, 1).normalize();
      const vb = llToV3(b.lat, b.lon, 1).normalize();
      const ang = Math.acos(Math.min(1, Math.max(-1, va.dot(vb))));
      const seg = Math.max(24, Math.min(256, Math.round((ang * 180) / Math.PI) * 2));
      const pos = [];
      const dist = [];
      for (let s = 0; s <= seg; s += 1) {
        const f = s / seg;
        // 구면 선형 보간 = 대권. 중간을 살짝 더 띄워 지구에 파묻히지 않게 한다.
        const p = va.clone().multiplyScalar(Math.sin((1 - f) * ang))
          .addScaledVector(vb, Math.sin(f * ang));
        if (ang > 1e-6) p.divideScalar(Math.sin(ang)); else p.copy(va);
        p.normalize().multiplyScalar(r + Math.sin(f * Math.PI) * ang * 0.02);
        pos.push(p.x, p.y, p.z);
        dist.push(f);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      g.setAttribute('aDist', new THREE.BufferAttribute(new Float32Array(dist), 1));
      const m = new THREE.ShaderMaterial({
        vertexShader: ROUTE_VS,
        fragmentShader: ROUTE_FS,
        uniforms: {
          uColor: { value: col.clone() },
          uTime: { value: 0 },
          uOpacity: { value: 0.95 },
        },
        transparent: true,
        depthWrite: false,
      });
      this.mats.push(m);
      const line = new THREE.Line(g, m);
      line.frustumCulled = false;
      this.group.add(line);
    }

    // 공항 지점: 지표에서 순항 셸까지 세운 기둥 + 꼭대기 점.
    // 선이 왜 떠 있는지(순항 고도 × 지형 과장) 눈으로 알 수 있게 한다.
    const stem = [];
    const dots = [];
    for (const s of stops) {
      const g0 = llToV3(s.lat, s.lon, 1.0005);
      const g1 = llToV3(s.lat, s.lon, r);
      stem.push(g0.x, g0.y, g0.z, g1.x, g1.y, g1.z);
      dots.push(g1.x, g1.y, g1.z);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(stem), 3));
    this.group.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({
      color: 0x7fb7f5, transparent: true, opacity: 0.3, depthWrite: false,
    })));
    const dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(dots), 3));
    const dp = new THREE.Points(dg, new THREE.PointsMaterial({
      color: 0xdfeeff, size: 7, sizeAttenuation: false, transparent: true, depthWrite: false,
    }));
    dp.frustumCulled = false;
    this.group.add(dp);

    for (const s of stops) {
      const el = document.createElement('div');
      el.className = 'route-label';
      el.textContent = s.iata;
      this.labelBox.appendChild(el);
      this.labels.push({ el, v: llToV3(s.lat, s.lon, r) });
    }
  }

  tick(nowMs, camera) {
    if (!this.stops) return;
    const t = nowMs * 0.001;
    for (const m of this.mats) m.uniforms.uTime.value = t;
    if (!camera) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const l of this.labels) {
      const p = l.v.clone().project(camera);
      // 지구 뒤로 넘어간 지점은 숨긴다
      const behind = l.v.clone().normalize().dot(camera.position.clone().normalize()) < 0.02;
      if (behind || p.z > 1) { l.el.style.display = 'none'; continue; }
      l.el.style.display = 'block';
      l.el.style.left = `${(p.x * 0.5 + 0.5) * w}px`;
      l.el.style.top = `${(-p.y * 0.5 + 0.5) * h}px`;
    }
  }

  clear() {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    this.mats = [];
    for (const l of this.labels) l.el.remove();
    this.labels = [];
    this.stops = null;
    this.legs = null;
  }

  // ---------- 공항 날씨 ----------
  // 지금 실황과, 우리가 계산한 도착 예정 시각의 예보를 한 요청으로 받는다.
  // 바람은 항공 관례대로 노트(kn), 시정은 m.
  static async weatherAt(s, needDays) {
    const u = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${s.lat.toFixed(4)}&longitude=${s.lon.toFixed(4)}`
      + '&current=temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,weather_code,cloud_cover,precipitation'
      + '&hourly=temperature_2m,wind_speed_10m,wind_gusts_10m,wind_direction_10m,visibility,weather_code,precipitation'
      + `&forecast_days=${Math.max(1, Math.min(7, needDays))}&timezone=UTC&wind_speed_unit=kn`;
    try {
      const r = await fetch(u);
      if (!r.ok) return null;
      return await r.json();
    } catch (e) {
      return null;
    }
  }

  // 실황(current)을 hourAt과 같은 모양으로 맞춘다. current에는 시정이 없다.
  static current(wx) {
    const c = wx && wx.current;
    if (!c) return null;
    return {
      time: Date.parse(`${c.time}:00Z`) || Date.parse(`${c.time}Z`),
      temp: c.temperature_2m, wind: c.wind_speed_10m, gust: c.wind_gusts_10m,
      dir: c.wind_direction_10m, vis: null, code: c.weather_code, precip: c.precipitation,
    };
  }

  // 예보 배열에서 목표 시각에 가장 가까운 시간을 고른다.
  // 목표가 예보 범위 밖이면 null — 없는 값을 만들어 내지 않는다.
  static hourAt(wx, targetMs) {
    const H = wx && wx.hourly;
    if (!H || !H.time || !H.time.length) return null;
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < H.time.length; i += 1) {
      const t = Date.parse(`${H.time[i]}:00Z`);
      const d = Math.abs(t - targetMs);
      if (d < bestD) { bestD = d; best = i; }
    }
    if (best < 0 || bestD > 3600000 * 1.5) return null;   // 1.5시간 넘게 벌어지면 없는 셈
    const pick = (k) => (H[k] && H[k][best] != null ? H[k][best] : null);
    return {
      time: Date.parse(`${H.time[best]}:00Z`),
      temp: pick('temperature_2m'),
      wind: pick('wind_speed_10m'),
      gust: pick('wind_gusts_10m'),
      dir: pick('wind_direction_10m'),
      vis: pick('visibility'),
      code: pick('weather_code'),
      precip: pick('precipitation'),
    };
  }
}

// ---------- 카드 ----------
const utc = (ms) => {
  const d = new Date(ms);
  return `${pad2(d.getUTCMonth() + 1)}/${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}Z`;
};
const hm = (min) => `${Math.floor(min / 60)}시간 ${pad2(min % 60)}분`;
const wxLine = (w) => {
  if (!w) return '<span class="v na">INSUFFICIENT_DATA</span>';
  const bits = [];
  if (w.code != null) bits.push(WMO[w.code] || `코드 ${w.code}`);
  if (w.temp != null) bits.push(`${Math.round(w.temp)}°C`);
  if (w.wind != null) {
    let s = `바람 ${Math.round(w.wind)}kn`;
    if (w.dir != null) s += ` ${compass(w.dir)}`;
    if (w.gust != null && w.gust - w.wind >= 5) s += ` (돌풍 ${Math.round(w.gust)}kn)`;
    bits.push(s);
  }
  if (w.vis != null) bits.push(w.vis >= 9999 ? '시정 10km+' : `시정 ${(w.vis / 1000).toFixed(1)}km`);
  if (w.precip) bits.push(`강수 ${w.precip}mm`);
  return esc(bits.join(' · '));
};

export function routeCardHtml(stops, legs, wx, badge) {
  const name = (s) => `${esc(s.city || s.name)} <b>${esc(s.iata)}</b>`;
  const total = legs.reduce((a, l) => a + l.min, 0) + (legs.length - 1) * LAYOVER_MIN;
  const totalKm = legs.reduce((a, l) => a + l.km, 0);

  // showNote가 card/card-h/card-b 껍데기를 씌운다 — 여기서는 본문만 만든다.
  let h = `<div style="margin-bottom:7px">`
    + `<span class="badge demo">항공편 추적 아님</span></div>`;
  h += `${stops.map((s) => esc(s.iata)).join(' → ')} · 대권 ${Math.round(totalKm).toLocaleString()}km`
    + ` · 경유 포함 약 ${hm(total)}<br/>`;

  // 출발 공항의 지금
  const s0 = stops[0];
  h += `<div class="stat"><span class="k">${name(s0)} 지금</span></div>`;
  h += `<div style="padding:2px 0 8px">${wxLine(wx[0] && wx[0].now)}</div>`;

  legs.forEach((l, i) => {
    h += `<div class="stat"><span class="k">${esc(l.from.iata)} → ${esc(l.to.iata)}</span>`
      + `<span class="v">${Math.round(l.km).toLocaleString()}km · ${hm(l.min)} · ${compass(l.bearing)}행</span></div>`;
    const w = wx[i + 1] || {};
    h += `<div style="padding:2px 0 8px">`
      + `<div>${name(l.to)} 도착 예상 <b>${utc(l.arr)}</b></div>`
      + `<div style="color:var(--text-dim)">그때 예보 — ${wxLine(w.at)}</div>`
      + `<div style="color:var(--text-dim)">지금 실황 — ${wxLine(w.now)}</div>`
      + `</div>`;
  });

  // 무엇이 우리 계산이고 무엇이 남의 값인지 분리해 밝힌다 (15.5 Truth Lens)
  h += `<div class="readiness" style="font-size:10.5px;line-height:1.6;color:var(--text-dim)">`
    + `<b>이 화면이 계산한 것</b> — 경로는 두 공항을 잇는 <b>대권</b>이고, 소요는 `
    + `대권거리 ÷ 순항 ${CRUISE_KMH}km/h + ${OVERHEAD_MIN}분(활주·상승·강하), `
    + `경유는 1회당 ${LAYOVER_MIN}분으로 가정했습니다. 실제 항로는 항로점·관제·제트기류로 달라지고, `
    + `편서풍 때문에 같은 구간도 동쪽행이 더 빠릅니다. <b>실제 운항 시각표가 아닙니다.</b><br/>`
    + `<b>남이 준 것</b> — 공항 날씨는 Open-Meteo 지점값(제공자 모델)입니다. `
    + `도착 예보는 위 추정 시각에 가장 가까운 예보 시간을 골랐고, 예보 범위를 벗어나면 `
    + `<b>INSUFFICIENT_DATA</b>로 두고 값을 만들지 않았습니다.<br/>`
    + `<b>안 하는 것</b> — 실제 항공편 추적(편명·기체 위치·지연)은 하지 않습니다. `
    + `adsb.lol에 CORS 헤더가 없어 프록시를 붙이기 전까지 항공편 레이어는 잠금입니다.`
    + `</div>`;
  return h;
}

export { LAYOVER_MIN, CRUISE_KMH };
