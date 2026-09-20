// EARTHUS v2 — 기압 H/L 중심 찾기 (DEV-DIRECTIVE 2026-09-20 · '### W1' 표의 기압 줄 · 작업 C2)
//
// 무엇이 없어 있었나: 지시서의 기압은 "색면은 옅게 · 4 hPa 등압선 + **H/L 기호**"다. 등압선은 공용 셰이더가 긋는다
// (field-scales.js pressure.isolines). 그런데 H·L 을 **어디에** 놓을지, 그 옆에 적을 중심 기압이 **얼마인지**를 아는
// 코드가 v2 에 없었다. v1(prototype/js/isobars.js extrema)은 동아시아 1° 격자에서 '5×5 이웃보다 확실히 높거나 낮은 칸'을
// 골랐다 — 전지구 0.5° · 8bit 눈금에서는 같은 값이 여러 칸 깔려(고원) '확실히 낮은 칸'이 아예 없거나 수십 개가 된다.
//
// 이 파일이 하는 일: 프레임 저장소(gfs-frames.js)의 CPU 사본 한 장에서 고기압·저기압 중심을 찾는다. 순수 함수다 —
//   DOM · THREE · fetch 를 모른다. 그리기(앞 반구 거르기 · 줌에 따른 솎기 · 글자)는 그리는 쪽 몫이다.
//     findPressureCenters(field, decode, opts) → [{ kind, lat, lon, hPa, prominence, row, col }]  센 것부터
//     formatCenter(c, lang)                    → 'L 985' · 'H 1032'
//     matchCenters(a, b, maxDeg)               → 두 키프레임의 중심을 짝짓는다(같은 종류 · 가까운 것끼리)
//     lerpCenter(pair, mix)                    → 두 키프레임 사이의 위치. **사이에서는 찾지 않는다**(아래 '시간')
//
// 입력: { w, h, data(Uint8Array), channels? } — 행 0 = 북위 90 · 열 0 = 서경 180 · 점 격자(gfs-frames.js 머리 주석).
//   격자 간격은 상수로 박지 않고 크기에서 읽는다(dLon = 360/w · dLat = 180/(h−1)). 0°~360° 격자면 opts.grid 로 준다.
//   디코드 {scale, offset} 은 **매니페스트 fields.mslp.channels.R 에서 온다.** 이 파일에 기본값이 없다 — 안 주면 던진다.
//   (지금 운영은 hPa = byte × 1 + 870, 그 앞 런은 byte × 0.5 + 940 이었다. 눈금은 또 바뀔 수 있다.)
//
// ── ⚠️ 두드러짐은 '반경 R° 고리'가 아니라 '고개까지의 깊이'다 — 지시와 다른 점이라 크게 적는다 ──────────────────
//   작업 지시는 "주변(반경 R° 고리)과의 기압 차가 임계 이상인 것만"이었다. 재 보니 고리는 **아열대 고기압을 지운다.**
//   교과서 배치를 720×361 · 1 hPa 눈금으로 만들어 쟀다(2026-09-20 · tools/earthus-v53/pressure-centers.test.mjs 의
//   '교과서 기압 배치'가 바로 이 장이고, 북태평양 고기압의 고리 숫자는 그 시험이 다시 재서 잠근다):
//                                      고리 3° · 6° · 10° (L = 고리 최솟값 − 중심 · H = 중심 − 고리 최댓값)      고개까지
//     북태평양 고기압(동서 40° · 남북 12°)      0 · 0 · 2  hPa   → 어느 반경에서도 4 hPa 미달, **사라진다**          12
//     아조레스 고기압                          1 · 1 · 2         → **사라진다**                                     56(전지구 최고 = 장의 폭)
//     알류샨 저기압(σ 10° · 깊이 30)           1 · 4 · 11        → 3° 고리로는 사라진다                              37
//     태풍(σ 1.5° · 깊이 40)                  32 · 38 · 36                                                         56(전지구 최저)
//   아열대 고기압은 동서로 길다. 어떤 반경의 고리든 능선의 긴 축을 지나므로 고리의 최댓값 ≈ 중심값이다 — 반경을 여러 개
//   써도 고쳐지지 않는다. 고리 **평균**은 그것들을 살리지만(10° 에서 6.9 · 7.2) 큰 저기압 8° 옆구리에 붙은 혹 —
//   고개가 제 바닥보다 3 hPa 높을 뿐인 것 — 을 5.8 · 11.8 · 14.9 로 부풀려 어느 반경에서도 통과시킨다(시험 '옆구리의 혹'의 장).
//   그래서 지형학의 **prominence** 를 그대로 쓴다: 저기압의 두드러짐 = (더 깊은 저기압으로 넘어가는 가장 낮은 고개의 기압) − (중심 기압).
//   고기압은 부호만 반대다. 이 정의에서 임계값의 근거가 지시가 말한 그대로 선다 —
//     **두드러짐 ≥ 4 hPa  ⇒  4 hPa 등압선 가운데 적어도 하나가 '이 중심만'(더 깊은 중심 없이) 닫아 두른다.**
//     중심이 c, 고개가 s ≥ c + 4 이면 (c, c+4] 안에 4 의 배수 m 이 있고 m ≤ s 이므로, m 등압선 안쪽에서 이 중심은
//     더 깊은 중심과 이어지지 않는다. 닫힌 등압선이 하나도 없는 곳에 H·L 을 찍지 않는다 — 일기도를 그리는 사람의 규칙이다.
//     (거꾸로는 아니다: 중심 999 · 고개 1001 이면 1000 선이 닫히지만 두드러짐은 2 다. 4 는 등압선이 어느 값에 놓이든
//      닫힌 선이 **보장되는** 가장 작은 두드러짐이다 — 그래서 임계가 등압선 간격과 같아야 한다.)
//   전지구에서 가장 깊은 저기압(가장 센 고기압)은 넘어갈 더 깊은 곳이 없다. 그 두드러짐은 **장 전체의 폭**(최고 − 최저)으로
//   둔다 — 지형학에서 최고봉의 두드러짐을 해발고도로 두는 것과 같은 약속이다. 그래서 그 둘이 늘 목록 맨 앞에 온다.
//
// ── 어떻게 찾나 (2단계) ──────────────────────────────────────────────────────────────────────────────────────
//   1단계 — 후보와 두드러짐(전 격자 한 번 훑기). 칸을 기압이 낮은 것부터 물에 잠그듯 연다(계수 정렬 · 8bit 라 O(N)).
//     이웃(8방향)에 이미 열린 칸이 없으면 새 웅덩이가 **태어나고**, 서로 다른 두 웅덩이에 닿으면 그 칸이 **고개**다 —
//     얕은 쪽 웅덩이가 그 고개 높이에서 죽고 (고개 − 제 바닥)이 그 웅덩이의 두드러짐이 된다(union-find).
//     · 8bit 고원: 같은 값의 칸들은 같은 높이에서 곧바로 합쳐져 두드러짐 0 으로 죽는다 → 고원 하나에 후보 하나.
//     · 경도 랩: 열 0 과 열 w−1 은 이웃이다 → ±180° 에 걸친 저기압이 둘로 갈리지 않는다.
//     · 극: 맨 윗줄·맨 아랫줄은 **한 점**이다 → 그 줄의 칸들은 서로 전부 이웃이다(극을 건너 반대편 경도와 이어진다).
//     고기압은 값을 뒤집어(255 − byte) 같은 일을 한 번 더 한다.
//   2단계 — 원격자 정밀화(후보 수십 개에만). 후보의 고원(같은 바이트 · 이어진 칸)을 원격자에서 모아 **넓이 가중 무게중심**
//     (칸의 넓이 ∝ cos 위도 — 그냥 세면 극 쪽 칸이 더 많아 중심이 극으로 끌린다)을 구하고, 거기서 **가장 가까운 고원 칸**에
//     놓는다. 그래서 기호는 늘 고원 위에 서고, hPa 는 그 칸의 바이트를 푼 값 그대로다(초승달 고원의 무게중심은 고원 밖일 수 있다).
//   솎은 격자에서 찾지 않는다: 반경 1.5° 태풍은 0.5° 격자에서 세 칸이다 — 2° 로 솎아 중심이 솎은 점에서 1° 만 비껴도
//     깊이 40 hPa 가 26 hPa 로 읽힌다(exp(−(1/1.5)²) = 0.64).
//   opts.block(기본 1 · 2 · 4)을 주면 **1단계만** 묶음 격자(4 = 2°)에서 돈다. 묶음은 솎기가 아니라 **묶음 안의 최저(고기압은 최고)** 라서
//     태풍의 바닥값이 그대로 남고, 2단계는 여전히 원격자다 — 위치·hPa 는 같고 두드러짐만 보수적으로(고개가 조금 낮게) 잡힌다.
//     매끄러운 난수 장 5개(장마다 중심 150~180개 · 솎기와 상한을 끄고)에서 block 1 과 견줬다:
//       block 2 — 두드러짐 4 hPa 짜리 1~2개를 잃고 최대 1 hPa 낮게.   block 4 — 4~5 hPa 짜리 3~8개를 잃고 최대 5 hPa 낮게.
//       커진 것 · 없던 것이 생긴 것은 없다. 기본 옵션(솎기 · 상한 12)에서는 24개 가운데 0~2개가 달랐다.
//       block 8 은 두드러짐 16 hPa 짜리도 잃었다 — 그래서 4 까지만 받는다(더 큰 값은 4 로 읽는다).
//       (견준 스크립트는 저장소에 남기지 않았다. 시험은 교과서 장에서 같은 성질 — 같은 자리 · 같은 hPa · 두드러짐은 크지 않게 — 을 잠근다.)
//
// ── 비용 (node 24.18 · 데스크톱 · 720×361 매끄러운 난수 장 · 새 프로세스에서 잼 · 시험이 매번 다시 재서 찍는다) ──────────
//   block 1(기본) : 첫 호출 38 ms · 데운 뒤 18~20 ms      block 2 : 21 ms · 6.5 ms      block 4 : 16 ms · 3 ms
//   한 번에 잡았다 놓는 메모리: block 1 ≈ 3.6 MB(Int32 × 3 + Uint8 × 2) · block 4 ≈ 0.6 MB.
//   키프레임(3시간 프레임)이 바뀔 때만 부른다 — mix 가 움직이는 동안에는 lerpCenter 만 돈다(중심 수십 개 · 삼각함수 몇 번).
//   ⚠️ 그래도 타임라인 재생 중에는 키프레임이 초 단위로 바뀐다. 폰은 이 3~4배로 보고(재지 못했다 — 이 작업은 화면 없이 합쳐진다):
//      결과를 프레임(h)별로 쥐고 있고(같은 장은 같은 결과다 — 시험이 잠근다), 다음 키프레임 것은 프레임을 받아 둔 김에
//      한가할 때 미리 찾아 둔다. 그래도 끊기면 block 4 — 잃는 것은 닫힌 등압선이 겨우 하나인 중심 몇 개다.
//
// ── 값은 눈금 그대로 ────────────────────────────────────────────────────────────────────────────────────────
//   hPa = byte × scale + offset. 이웃 칸과 보간해 소수 자리를 만들지 않는다 — 1 hPa 눈금에서 'L 984.6' 은 지어낸 값이다.
//   바이트가 0 이나 255 면 눈금의 끝에 **눌린** 값이다(실제는 그 너머일 수 있다 — 940 hPa 바닥에 354칸이 눌렸던 것이
//   눈금을 870 으로 넓힌 이유다 · 커밋 c90b0fd5). 그런 중심에는 saturated:true 를 달고 formatCenter 는 'L ≤940' 이라 적는다.
//
// ── 지형 ────────────────────────────────────────────────────────────────────────────────────────────────────
//   해면 경정 기압은 고지대(티베트 · 안데스 · 남극 · 그린란드 · 몽골)에서 믿기 어렵다 — 땅 밑의 없는 공기 기둥을 셈해 넣은 값이다.
//   opts.elevationAt(lat, lon) → m 이 주어지면 고도 ≥ HIGH_TERRAIN_M 인 중심에 overHighTerrain:true 를 단다(아니면 false).
//   **지우지 않는다** — 흐리게 그릴지 숨길지는 그리는 쪽이 정한다. 주어지지 않으면 그 키 자체가 없다(모르는 것을 '아니다'라고 하지 않는다).
//   ⚠️ 상한은 표시된 중심과 아닌 중심을 **따로** 센다(elevationAt 을 줬을 때 — 종류마다 최대 12 + 12). 한데 세면 고지대의
//      가짜 중심이 두드러짐 순으로 자리를 먼저 채울 수 있고, 그리는 쪽이 그것들을 숨기는 순간 그만큼 빈 채로 남는다
//      (시험 '고지대의 센 중심들이…'가 그 상황이다). 운영 프레임에서 가짜가 몇 개나 나오는지는 **재지 못했다** — 이 작업은
//      프레임을 내려받지 않았다. W1 이 운영 프레임에 물려 보고 상한을 다시 정한다.
//      솎기(최소 간격)는 표시를 보지 않는다 — 고지대 중심 8° 안의 더 약한 중심은 같은 경정 오차에 젖어 있기 쉽다.
//
// ── 시간 ────────────────────────────────────────────────────────────────────────────────────────────────────
//   두 프레임 사이(mix)에서는 **찾지 않는다.** 셰이더가 섞은 장에서 찾으면 제 폭보다 멀리 움직인 저기압(태풍이 그렇다)이
//   '얕은 저기압 둘'로 갈렸다가 다시 하나가 된다(교차 페이드의 함정) — 중심이 3시간마다 두 번 튄다. 대신 두 키프레임에서 각각 찾아 matchCenters 로 짝짓고
//   lerpCenter 로 대권을 따라 옮긴다. 짝이 없는 중심은 제자리에서 나타나거나(alpha = mix) 사라질(alpha = 1 − mix) 뿐이다 —
//   어디서 왔는지 모르는 것의 경로를 지어내지 않는다. 옮겨 가는 동안의 hPa 는 **가까운 쪽 키프레임의 값**이다(985 와 981 사이에
//   '983' 은 어느 프레임에도 없다). mix 0.5 에서 글자가 한 번 바뀐다.

const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

// 두드러짐 임계(hPa). 근거 = 등압선 간격 한 칸(field-scales.js pressure.isolines.interval = 4 · 기상청 지상일기도의 간격).
// 위 '두드러짐' 절의 증명대로, 이 값이 등압선 간격과 같을 때 '닫힌 등압선이 하나는 있다'가 성립한다 —
// 등압선 간격을 바꾸면 이 값도 같이 바꾼다(부르는 쪽이 opts.minProminenceL/H 로 isolineSpec().interval 을 넘겨도 된다).
export const PRESSURE_PROMINENCE_HPA = Object.freeze({ L: 4, H: 4 });

// 같은 종류끼리의 최소 간격(대권 °). 지시 기본값이다. 뜻: 전지구 뷰에서 'L 985' 글자 둘이 겹치지 않는 거리 —
// 화면에서 잰 값은 아니다(이 작업은 화면 없이 합쳐진다). 줌에 따라 더 솎는 것은 그리는 쪽 몫이다.
// H 와 L 사이에는 적용하지 않는다: 태풍 바로 옆의 능선은 날씨이지 중복이 아니다.
export const CENTER_MIN_SEPARATION_DEG = 8;

// 전지구 개수 상한(앞 반구 기준이 아니다 — 앞 반구 거르기는 카메라를 아는 쪽이 한다).
export const CENTER_MAX_PER_KIND = Object.freeze({ H: 12, L: 12 });

// 이 고도(m) 이상이면 해면 경정을 믿기 어렵다고 표시한다. 지시 기본값 1500 m ≈ 850 hPa 면의 표준 고도
// (국제표준대기 1,457 m): 땅이 850 hPa 면보다 높으면 '해면기압'은 150 hPa 어치가 넘는 없는 공기를 외삽한 값이다.
export const HIGH_TERRAIN_M = 1500;

// 짝짓기 반경 — 시간당 2°(= 62 m/s). 중심이 실제로 움직이는 빠르기만이 아니라 **찾은 자리의 흔들림**까지 담으려는 값이다:
// 빠른 온대저기압을 25~30 m/s 로 잡으면 3시간에 2.4~2.9° 이고, 바닥이 평평한 저기압은 고원(같은 바이트 칸들)의 모양이
// 프레임마다 바뀌어 무게중심이 그만큼 더 튈 수 있다. 3시간 프레임이면 6° — 최소 간격(8°)보다 작아 이웃 중심으로 건너뛰지 않는다.
// ⚠️ 운영 프레임 연속 두 장으로 잰 값이 아니다(이 작업은 프레임을 내려받지 않았다). 짝이 자주 끊기면 W1 이 이 값을 고친다.
// 스텝이 빠져 간격이 넓으면(gfs-frames bracket 의 gapH) 부르는 쪽이 CENTER_MATCH_DEG_PER_HOUR × gapH 를 넘긴다.
export const CENTER_MATCH_DEG_PER_HOUR = 2;
export const CENTER_MATCH_MAX_DEG = 6;

// 1단계를 묶음 격자에서 돌릴 때의 묶음 크기 상한(칸). 4칸 = 2°. 8칸에서는 두드러짐 16 hPa 짜리 중심도 잃었다(머리 주석의 실측).
const BLOCK_MAX = 4;
// 극 줄 칸의 무게(넓이 0 이지만 극만으로 된 고원의 무게중심이 0 벡터가 되지 않게).
const POLE_WEIGHT = 1e-9;

const normLon = (lon) => ((((lon + 180) % 360) + 360) % 360) - 180;   // [−180, 180)

/** 두 점 사이의 대권 거리(°). */
export function greatCircleDeg(lat1, lon1, lat2, lon2) {
  const p1 = lat1 * D2R;
  const p2 = lat2 * D2R;
  const c = Math.sin(p1) * Math.sin(p2) + Math.cos(p1) * Math.cos(p2) * Math.cos((lon1 - lon2) * D2R);
  return Math.acos(Math.max(-1, Math.min(1, c))) * R2D;
}

// ---------------------------------------------------------------- 입력 읽기

// 디코드 상수. **기본값이 없다** — 안 주면 던진다(조용히 870 을 가정하면 눈금이 바뀐 날 전부 틀린 값을 말한다).
// gfs-frames 의 채널 객체({transfer:'linear', scale, offset, …})를 그대로 넘겨도 된다.
function readDecode(decode) {
  const ok = decode && Number.isFinite(decode.scale) && Number.isFinite(decode.offset) && decode.scale > 0
    && (decode.transfer == null || decode.transfer === 'linear');
  if (!ok) throw new TypeError('PRESSURE_CENTERS_NEEDS_DECODE: { scale > 0, offset } 을 매니페스트 fields.mslp 에서 읽어 넘긴다');
  return { scale: decode.scale, offset: decode.offset };
}

// 프레임 → 1채널 바이트 + 격자. 읽을 수 없으면 null(= 중심 없음): 아직 안 받은 프레임 · 크기가 안 맞는 그림.
// 엉뚱한 곳의 값을 말하느니 없다고 한다(gfs-frames 의 규칙). 전지구 격자가 아니면 던진다 — 랩과 극이 성립하지 않는다.
function readField(field, opts) {
  if (!field || !field.data) return null;
  const w = field.w | 0;
  const h = field.h | 0;
  const stride = field.channels > 0 ? field.channels | 0 : 1;
  const channel = opts.channel > 0 ? opts.channel | 0 : 0;
  if (w < 4 || h < 3 || channel >= stride || field.data.length !== w * h * stride) return null;
  const gr = opts.grid || null;
  const dLon = gr && Number.isFinite(gr.dLon) ? gr.dLon : 360 / w;
  const dLat = gr && Number.isFinite(gr.dLat) ? Math.abs(gr.dLat) : 180 / (h - 1);
  const lon0 = gr && Number.isFinite(gr.lon0) ? gr.lon0 : -180;
  const lat0 = gr && Number.isFinite(gr.lat0) ? gr.lat0 : 90;
  if (Math.abs(w * dLon - 360) > 1e-6 || Math.abs(lat0 - 90) > 1e-6 || Math.abs((h - 1) * dLat - 180) > 1e-6) {
    throw new RangeError('PRESSURE_CENTERS_NEEDS_GLOBAL_GRID: 경도 360° · 두 극을 다 담은 점 격자만 읽는다');
  }
  let g = field.data;
  if (stride !== 1) {                                   // 여러 채널이면 쓰는 채널만 뽑는다
    g = new Uint8Array(w * h);
    for (let p = 0, s = channel; p < w * h; p += 1, s += stride) g[p] = field.data[s];
  }
  const cosLat = new Float64Array(h);
  const sinLat = new Float64Array(h);
  for (let j = 0; j < h; j += 1) {
    const la = (lat0 - j * dLat) * D2R;
    cosLat[j] = (j === 0 || j === h - 1) ? 0 : Math.max(0, Math.cos(la));   // cos(90°) 는 6e-17 이다 — 0 으로 못 박는다
    sinLat[j] = Math.sin(la);
  }
  const cosLon = new Float64Array(w);
  const sinLon = new Float64Array(w);
  for (let i = 0; i < w; i += 1) {
    const lo = (lon0 + i * dLon) * D2R;
    cosLon[i] = Math.cos(lo);
    sinLon[i] = Math.sin(lo);
  }
  // 극은 경도가 없다. 0° 로 적기로 하고 그 열을 찾아 둔다.
  const colOfLon0 = ((Math.round((0 - lon0) / dLon) % w) + w) % w;
  return { g, w, h, lon0, lat0, dLon, dLat, cosLat, sinLat, cosLon, sinLon, colOfLon0 };
}

// ---------------------------------------------------------------- 1단계: 후보와 두드러짐

// 묶음 격자: 묶음 안의 최저(invert 면 뒤집은 값의 최저 = 최고). arg 는 그 값을 낸 원격자 칸 — 2단계가 거기서 시작한다.
// 극 줄은 묶지 않는다(세로로는 그 줄 하나가 한 묶음 줄) — 극 줄을 아래 줄과 묶으면 극을 사이에 둔 두 저기압이
// 극보다 낮은 높이에서 이어진 것으로 읽힌다.
function poolExtreme(g, w, h, k, invert) {
  const wb = Math.ceil(w / k);
  const hb = 2 + Math.ceil((h - 2) / k);
  const vals = new Uint8Array(wb * hb);
  const arg = new Int32Array(wb * hb).fill(-1);
  for (let j = 0; j < h; j += 1) {
    const bj = j === 0 ? 0 : (j === h - 1 ? hb - 1 : 1 + (((j - 1) / k) | 0));
    for (let i = 0; i < w; i += 1) {
      const p = j * w + i;
      const v = invert ? 255 - g[p] : g[p];
      const b = bj * wb + ((i / k) | 0);
      if (arg[b] < 0 || v < vals[b]) { vals[b] = v; arg[b] = p; }
    }
  }
  return { vals, arg, wb, hb };
}

// 낮은 값부터 열며 웅덩이를 합친다. 돌려주는 것: [{ cell, prom(바이트) }] — prom ≥ minBytes 인 것과, 끝까지 남은 하나(prom = range).
//   나이 규칙: 바닥이 더 낮은 웅덩이가 산다. 바닥이 같으면 먼저 태어난(칸 번호가 작은) 쪽 — 난수 없이 늘 같은 답.
//   union-find 는 경로 반감만 한다. 뿌리는 나이 규칙이 정하므로(산 쪽이 뿌리여야 birth 가 맞다) rank 로 고르지 않는다.
function persistencePass(vals, wb, hb, minBytes, range, work) {
  const n = wb * hb;
  const { order, parent, birth } = work;
  const count = new Int32Array(257);
  for (let p = 0; p < n; p += 1) count[vals[p] + 1] += 1;
  for (let v = 0; v < 256; v += 1) count[v + 1] += count[v];
  for (let p = 0; p < n; p += 1) { order[count[vals[p]]] = p; count[vals[p]] += 1; }   // 안정 정렬 — 같은 값은 칸 번호순
  parent.fill(-1, 0, n);
  const found = [];
  const find = (x) => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };
  const join = (ra, rb, level) => {
    const ba = birth[ra];
    const bb = birth[rb];
    const bWins = vals[bb] < vals[ba] || (vals[bb] === vals[ba] && bb < ba);
    const young = bWins ? ra : rb;
    const old = bWins ? rb : ra;
    const prom = level - vals[birth[young]];
    if (prom >= minBytes) found.push({ cell: birth[young], prom });
    parent[young] = old;
    return old;
  };
  let poleN = -1;
  let poleS = -1;
  for (let k = 0; k < n; k += 1) {
    const p = order[k];
    const j = (p / wb) | 0;
    const i = p - j * wb;
    const level = vals[p];
    parent[p] = p;
    birth[p] = p;
    let root = p;
    const il = i === 0 ? wb - 1 : i - 1;                 // 경도 랩
    const ir = i === wb - 1 ? 0 : i + 1;
    for (let dj = -1; dj <= 1; dj += 1) {
      const jj = j + dj;
      if (jj < 0 || jj >= hb) continue;                  // 극 너머는 없다
      const base = jj * wb;
      for (let t = 0; t < 3; t += 1) {
        const q = base + (t === 0 ? il : (t === 1 ? i : ir));
        if (q === p || parent[q] === -1) continue;       // 아직 잠기지 않은 칸
        const rq = find(q);
        if (rq !== root) root = join(root, rq, level);
      }
    }
    // 극 줄은 한 점이다 — 그 줄에서 먼저 열린 칸과 이웃이다.
    if (j === 0) {
      if (poleN < 0) poleN = p; else { const r = find(poleN); if (r !== root) root = join(root, r, level); }
    }
    if (j === hb - 1) {
      if (poleS < 0) poleS = p; else { const r = find(poleS); if (r !== root) root = join(root, r, level); }
    }
  }
  // 끝까지 남은 웅덩이 = 전지구 극값. 넘어갈 더 깊은 곳이 없으니 장 전체의 폭을 두드러짐으로 둔다(머리 주석).
  if (range >= minBytes) found.push({ cell: birth[find(order[0])], prom: range });
  return found;
}

// ---------------------------------------------------------------- 2단계: 원격자 정밀화

// start 가 든 고원(같은 바이트 · 8방향으로 이어진 칸 · 경도 랩 · 극 줄은 한 점)을 모아 중심 칸을 고른다.
// seen 은 한 번의 찾기 동안 나눠 쓴다 — 이미 다른 후보가 가져간 고원이면 null.
function plateauCentre(f, start, seen) {
  const { g, w, h } = f;
  if (seen[start]) return null;
  const v = g[start];
  const cells = [start];
  seen[start] = 1;
  let poleDoneN = false;
  let poleDoneS = false;
  for (let q = 0; q < cells.length; q += 1) {
    const p = cells[q];
    const j = (p / w) | 0;
    const i = p - j * w;
    const il = i === 0 ? w - 1 : i - 1;
    const ir = i === w - 1 ? 0 : i + 1;
    for (let dj = -1; dj <= 1; dj += 1) {
      const jj = j + dj;
      if (jj < 0 || jj >= h) continue;
      const base = jj * w;
      for (let t = 0; t < 3; t += 1) {
        const c = base + (t === 0 ? il : (t === 1 ? i : ir));
        if (!seen[c] && g[c] === v) { seen[c] = 1; cells.push(c); }
      }
    }
    const isN = j === 0 && !poleDoneN;
    const isS = j === h - 1 && !poleDoneS;
    if (isN || isS) {                                    // 극에 닿았다 — 그 줄의 같은 값 칸은 전부 같은 점이다
      if (isN) poleDoneN = true; else poleDoneS = true;
      for (let c = j * w; c < (j + 1) * w; c += 1) if (!seen[c] && g[c] === v) { seen[c] = 1; cells.push(c); }
    }
  }
  // 넓이 가중 무게중심(단위 벡터의 합). 경도 랩과 극을 따로 다룰 필요가 없다.
  let sx = 0;
  let sy = 0;
  let sz = 0;
  for (let q = 0; q < cells.length; q += 1) {
    const p = cells[q];
    const j = (p / w) | 0;
    const i = p - j * w;
    const wt = Math.max(f.cosLat[j], POLE_WEIGHT);
    sx += wt * f.cosLat[j] * f.cosLon[i];
    sy += wt * f.cosLat[j] * f.sinLon[i];
    sz += wt * f.sinLat[j];
  }
  // 무게중심에서 가장 가까운 고원 칸. 같은 거리면 칸 번호가 작은 쪽(고리 모양 고원의 무게중심은 어느 칸과도 같은 거리일 수 있다).
  let best = -1;
  let bestDot = -Infinity;
  for (let q = 0; q < cells.length; q += 1) {
    const p = cells[q];
    const j = (p / w) | 0;
    const i = p - j * w;
    const dot = sx * f.cosLat[j] * f.cosLon[i] + sy * f.cosLat[j] * f.sinLon[i] + sz * f.sinLat[j];
    if (dot > bestDot + 1e-12 || (Math.abs(dot - bestDot) <= 1e-12 && p < best)) { bestDot = dot; best = p; }
  }
  const row = (best / w) | 0;
  let col = best - row * w;
  if (row === 0 || row === h - 1) col = f.colOfLon0;     // 극은 경도가 없다 — 0° 로 적는다
  // byte 는 고원의 값이다. 극에서는 col 을 바꿔 적었으므로 (row, col) 칸에서 다시 읽지 않는다 —
  // 극 줄의 값이 칸마다 다른 자료(있어서는 안 되지만)에서 그 칸은 고원 밖일 수 있다.
  return { row, col, byte: v };
}

// ---------------------------------------------------------------- 찾기

/**
 * 한 프레임에서 고기압·저기압 중심을 찾는다. → [{ kind:'H'|'L', lat, lon, hPa, prominence, row, col }] 센 것(두드러짐 큰 것)부터.
 *   field   { w, h, data(Uint8Array), channels? } — gfs-frames pixels()/pixelsNow() 가 주는 CPU 사본 그대로
 *   decode  { scale, offset } — 매니페스트 fields.mslp.channels.R. 기본값 없음(안 주면 TypeError)
 *   opts    minProminenceL · minProminenceH (hPa · 기본 4)   minSeparationDeg (기본 8 · 같은 종류끼리)   maxH · maxL (기본 12)
 *           elevationAt(lat, lon) → m   highTerrainM (기본 1500)   block (기본 1 · 2 나 4 면 1단계만 묶음 격자에서 — 머리 주석)
 *           grid { lon0, lat0, dLon, dLat } (기본: 크기에서 유도 · 서경 180 시작)   channel (여러 채널 그림일 때 · 기본 0)
 *   더 붙는 키: saturated:true(눈금 끝에 눌린 값일 때만) · overHighTerrain:true|false(elevationAt 을 줬을 때만)
 *   ⚠️ elevationAt 을 주면 maxH · maxL 은 표시된 것과 아닌 것을 따로 센다 — 한 종류가 최대 2배까지 나온다(머리 주석 '지형').
 * 읽을 수 없는 프레임(null · 크기 불일치) · 값이 하나뿐인 장은 빈 목록이다. 입력을 고치지 않는다. 같은 입력에 같은 출력이다.
 */
export function findPressureCenters(field, decode, opts = {}) {
  const dec = readDecode(decode);
  const f = readField(field, opts);
  if (!f) return [];
  const { g, w, h } = f;
  const n = w * h;
  let lo = 255;
  let hi = 0;
  for (let p = 0; p < n; p += 1) { const v = g[p]; if (v < lo) lo = v; if (v > hi) hi = v; }
  if (hi === lo) return [];                              // 평평한 장(디코드 못 한 그림 등) — 중심이 없다
  const range = hi - lo;

  const minProm = {
    L: Number.isFinite(opts.minProminenceL) ? opts.minProminenceL : PRESSURE_PROMINENCE_HPA.L,
    H: Number.isFinite(opts.minProminenceH) ? opts.minProminenceH : PRESSURE_PROMINENCE_HPA.H,
  };
  const cap = {
    L: Number.isFinite(opts.maxL) ? Math.max(0, opts.maxL | 0) : CENTER_MAX_PER_KIND.L,
    H: Number.isFinite(opts.maxH) ? Math.max(0, opts.maxH | 0) : CENTER_MAX_PER_KIND.H,
  };
  const minSep = Number.isFinite(opts.minSeparationDeg) ? Math.max(0, opts.minSeparationDeg) : CENTER_MIN_SEPARATION_DEG;
  const block = Number.isFinite(opts.block) ? Math.max(1, Math.min(BLOCK_MAX, opts.block | 0)) : 1;
  // 고지대인가. elevationAt 이 없으면 함수 자체가 없다 — 그때는 표시도, 따로 세는 상한도 없다.
  // 고도를 못 읽은 곳(NaN · null)은 고지대라고 하지 않는다 — 모르는 것에 표시를 달지 않는다.
  const highLimit = Number.isFinite(opts.highTerrainM) ? opts.highTerrainM : HIGH_TERRAIN_M;
  const isHigh = typeof opts.elevationAt === 'function'
    ? (c) => { const m = opts.elevationAt(c.lat, c.lon); return typeof m === 'number' && Number.isFinite(m) && m >= highLimit; }
    : null;

  const nb = block === 1 ? n : Math.ceil(w / block) * (2 + Math.ceil((h - 2) / block));
  const work = { order: new Int32Array(nb), parent: new Int32Array(nb), birth: new Int32Array(nb) };
  const seen = new Uint8Array(n);
  const out = [];

  for (const kind of ['L', 'H']) {
    if (!cap[kind]) continue;
    const invert = kind === 'H';
    // ── 1단계
    let stage;
    if (block === 1) {
      let vals = g;
      if (invert) { vals = new Uint8Array(n); for (let p = 0; p < n; p += 1) vals[p] = 255 - g[p]; }
      stage = { vals, arg: null, wb: w, hb: h };
    } else {
      stage = poolExtreme(g, w, h, block, invert);
    }
    // 임계는 **hPa 로** 견준다. 바이트로 견주면 0.5 hPa 눈금에서 2 hPa 짜리가 4 로 읽힌다. 0 이하를 줘도 1칸은 낮아야 중심이다.
    const minBytes = Math.max(1, Math.ceil(minProm[kind] / dec.scale - 1e-9));
    const raw = persistencePass(stage.vals, stage.wb, stage.hb, minBytes, range, work);

    // ── 2단계
    const cands = [];
    for (const c of raw) {
      const at = plateauCentre(f, stage.arg ? stage.arg[c.cell] : c.cell, seen);
      if (!at) continue;
      const { byte } = at;                               // 고원의 원래 바이트(뒤집기 전) — 2단계는 늘 원격자 g 를 읽는다
      const centre = {
        kind,
        lat: f.lat0 - at.row * f.dLat,
        lon: (at.row === 0 || at.row === h - 1) ? 0 : normLon(f.lon0 + at.col * f.dLon),
        hPa: byte * dec.scale + dec.offset,               // gfs-frames decodeByte 와 같은 식 — 클릭 값과 같은 숫자가 나온다
        prominence: c.prom * dec.scale,
        row: at.row,
        col: at.col,
      };
      if (byte === 0 || byte === 255) centre.saturated = true;
      cands.push(centre);
    }
    // 센 것부터. 같으면 더 극단인 값 → 북쪽 → 서쪽(난수 없는 순서).
    cands.sort((a, b) => (b.prominence - a.prominence)
      || (invert ? b.hPa - a.hPa : a.hPa - b.hPa) || (a.row - b.row) || (a.col - b.col));
    // 최소 간격으로 솎고 상한에서 자른다(센 것이 자리를 먼저 잡는다). 상한은 고지대 표시가 있는 것과 없는 것을 따로 센다 —
    // 머리 주석 '지형'. 간격을 먼저 보고 고도를 나중에 묻는다: elevationAt 이 얼마나 비싼지 이 파일은 모른다.
    const kept = [];
    const count = { plain: 0, high: 0 };
    for (const c of cands) {
      if (count.plain >= cap[kind] && (!isHigh || count.high >= cap[kind])) break;
      let clear = true;
      for (let q = 0; q < kept.length && clear; q += 1) {
        if (greatCircleDeg(c.lat, c.lon, kept[q].lat, kept[q].lon) < minSep) clear = false;
      }
      if (!clear) continue;
      const slot = isHigh && isHigh(c) ? 'high' : 'plain';
      if (count[slot] >= cap[kind]) continue;            // 제 몫의 자리가 찼다 — 남지 않으니 남을 밀어내지도 않는다
      if (isHigh) c.overHighTerrain = slot === 'high';
      count[slot] += 1;
      kept.push(c);
    }
    for (const c of kept) out.push(c);
  }

  out.sort((a, b) => (b.prominence - a.prominence) || (a.kind === b.kind ? 0 : (a.kind === 'L' ? -1 : 1))
    || (a.row - b.row) || (a.col - b.col));
  return out;
}

// ---------------------------------------------------------------- 글자

/**
 * 'L 985' · 'H 1032'. 단위는 적지 않는다 — 범례가 말한다(field-scales.js pressure.unit).
 * 숫자는 눈금 그대로다: 1 hPa 눈금이면 정수, 0.5 hPa 눈금이면 '985.5' 도 나온다(반올림해 986 이라 적으면 없는 값이다).
 * 눈금 끝에 눌린 값은 'L ≤870' · 'H ≥1125'. 기호 H·L 은 언어와 무관하다(기상청 일기도도 H·L 을 쓴다) — lang 은 자리만 있다.
 */
export function formatCenter(c, lang) {   // lang: 지금은 쓰이지 않는다(위 주석) — 부르는 쪽 시그니처를 언어가 생기는 날 바꾸지 않으려고 둔다
  if (!c || (c.kind !== 'H' && c.kind !== 'L') || typeof c.hPa !== 'number' || !Number.isFinite(c.hPa)) return '';
  const num = Number.isInteger(c.hPa) ? String(c.hPa) : c.hPa.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  const bound = c.saturated ? (c.kind === 'L' ? '≤' : '≥') : '';
  return `${c.kind} ${bound}${num}`;
}

// ---------------------------------------------------------------- 시간: 두 키프레임의 중심 잇기

/**
 * 키프레임 a 의 중심들과 키프레임 b 의 중심들을 짝짓는다. → [{ kind, a, b, distDeg }]
 *   같은 종류끼리 · 대권 거리 maxDeg 이하 · 가까운 짝부터 하나씩(한 중심은 한 번만 쓰인다).
 *   a 만 있는 줄(b:null) = 사라지는 중심 · b 만 있는 줄(a:null) = 생기는 중심. distDeg 는 짝일 때만 숫자다.
 *   순서: a 의 순서대로(짝 · 사라짐) 다음에 b 의 남은 것 — 같은 입력에 같은 순서라 그리는 쪽이 줄 번호를 키로 써도 된다.
 * maxDeg 기본은 3시간 프레임 기준 6° 다. 간격이 넓으면(gapH) CENTER_MATCH_DEG_PER_HOUR × gapH 를 넘긴다.
 */
export function matchCenters(a, b, maxDeg = CENTER_MATCH_MAX_DEG) {
  const A = Array.isArray(a) ? a : [];
  const B = Array.isArray(b) ? b : [];
  const limit = Number.isFinite(maxDeg) ? maxDeg : CENTER_MATCH_MAX_DEG;
  const links = [];
  for (let i = 0; i < A.length; i += 1) {
    for (let j = 0; j < B.length; j += 1) {
      if (A[i].kind !== B[j].kind) continue;
      const d = greatCircleDeg(A[i].lat, A[i].lon, B[j].lat, B[j].lon);
      if (d <= limit) links.push({ i, j, d });
    }
  }
  links.sort((x, y) => (x.d - y.d) || (x.i - y.i) || (x.j - y.j));
  const mateOfA = new Array(A.length).fill(-1);
  const distOfA = new Array(A.length).fill(null);
  const usedB = new Array(B.length).fill(false);
  for (const l of links) {
    if (mateOfA[l.i] >= 0 || usedB[l.j]) continue;
    mateOfA[l.i] = l.j;
    distOfA[l.i] = l.d;
    usedB[l.j] = true;
  }
  const pairs = [];
  for (let i = 0; i < A.length; i += 1) {
    pairs.push({ kind: A[i].kind, a: A[i], b: mateOfA[i] >= 0 ? B[mateOfA[i]] : null, distDeg: distOfA[i] });
  }
  for (let j = 0; j < B.length; j += 1) if (!usedB[j]) pairs.push({ kind: B[j].kind, a: null, b: B[j], distDeg: null });
  return pairs;
}

// 대권을 따라 t 만큼. 단위 벡터로 하므로 ±180° 를 짧은 쪽으로 건너고 극을 지나도 된다.
function slerpLatLon(a, b, t) {
  // 양 끝은 찾은 자리 그대로다 — 삼각함수를 돌아 나온 29.999999999999996 을 키프레임의 자리라고 하지 않는다.
  if (t <= 0) return { lat: a.lat, lon: a.lon };
  if (t >= 1) return { lat: b.lat, lon: b.lon };
  const v = (c) => {
    const p = c.lat * D2R;
    const l = c.lon * D2R;
    return [Math.cos(p) * Math.cos(l), Math.cos(p) * Math.sin(l), Math.sin(p)];
  };
  const va = v(a);
  const vb = v(b);
  const dot = Math.max(-1, Math.min(1, va[0] * vb[0] + va[1] * vb[1] + va[2] * vb[2]));
  const om = Math.acos(dot);
  // 같은 점이거나 정반대(대권이 정해지지 않는다 — 짝짓기 반경에서는 생기지 않는다)면 가까운 끝에 둔다.
  if (om < 1e-9 || Math.PI - om < 1e-9) return t < 0.5 ? { lat: a.lat, lon: a.lon } : { lat: b.lat, lon: b.lon };
  const s = Math.sin(om);
  const ka = Math.sin((1 - t) * om) / s;
  const kb = Math.sin(t * om) / s;
  const x = ka * va[0] + kb * vb[0];
  const y = ka * va[1] + kb * vb[1];
  const z = ka * va[2] + kb * vb[2];
  const lat = Math.asin(Math.max(-1, Math.min(1, z))) * R2D;
  return { lat, lon: Math.abs(lat) > 90 - 1e-9 ? 0 : normLon(Math.atan2(y, x) * R2D) };
}

/**
 * matchCenters 의 한 줄을 mix(0 = 키프레임 a · 1 = 키프레임 b)에서 읽는다.
 *   → { kind, lat, lon, hPa, alpha, phase:'moving'|'appearing'|'vanishing', nearest, saturated?, overHighTerrain? }
 *   짝: 대권을 따라 옮긴다 · alpha 1.   a 만: 제자리 · alpha 1 − mix.   b 만: 제자리 · alpha mix.
 *   hPa 와 표시들은 **가까운 쪽 키프레임**(mix < 0.5 면 a)의 것이다 — 두 값 사이를 보간해 없는 숫자를 만들지 않는다.
 *   nearest 는 그 키프레임의 중심 객체다(row · col · prominence 가 필요하면 거기서 읽는다).
 */
export function lerpCenter(pair, mix) {
  if (!pair || (!pair.a && !pair.b)) return null;
  const t = Number.isFinite(mix) ? Math.max(0, Math.min(1, mix)) : 0;
  const { a, b } = pair;
  const nearest = (a && b) ? (t < 0.5 ? a : b) : (a || b);
  const at = (a && b) ? slerpLatLon(a, b, t) : { lat: nearest.lat, lon: nearest.lon };
  const out = {
    kind: nearest.kind,
    lat: at.lat,
    lon: at.lon,
    hPa: nearest.hPa,
    alpha: (a && b) ? 1 : (a ? 1 - t : t),
    phase: (a && b) ? 'moving' : (a ? 'vanishing' : 'appearing'),
    nearest,
  };
  if (nearest.saturated) out.saturated = true;
  if ('overHighTerrain' in nearest) out.overHighTerrain = nearest.overHighTerrain;
  return out;
}
