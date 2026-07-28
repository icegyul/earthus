// 핀 꽂기 — "여기다" 를 몸으로 알려주는 연출
//
// 왜 만드나 (받은 요청)
//   "선택하면 지도로 위치가 보여지는데 그 정확한 위치에 핀이 꽂히는걸 표현해줘
//    점 말고 핀이 팍 하고 꼿히는 에니메이션"
//
//   카드를 눌러 날아가고 나면 "그래서 정확히 어디?" 가 남는다.
//   점은 그 자리에 이미 여러 개 있어서 묻힌다. 핀은 떨어지는 동안 눈이 따라간다.
//
// ⚠️⚠️ 발열 규칙을 그대로 지킨다. 이 앱은 화면에 변화가 없으면 안 그린다.
//    · 애니메이션은 **유한하다.** 1.5초 뒤 스스로 멎는다.
//    · 도는 동안만 power.animate() 로 렌더를 요청한다. 스스로 연장하지 않는다.
//    · 끝나면 CallbackProperty 를 **떼고 정적인 핀으로 바꾼다.**
//      (pointLayer.js 의 파문이 같은 이유로 정적 원으로 바뀐다 —
//       CallbackProperty 가 남아 있으면 프레임마다 지오메트리를 다시 만든다)
//
// ⚠️ 핀은 한 번에 하나만 둔다. 카드를 여러 번 누르면 이전 핀을 지운다.
//    지도에 핀이 쌓이면 "지금 어디를 보고 있는지" 가 오히려 흐려진다.

import { viewer } from './viewer.js';
import { power } from './power.js';

const FALL_MS   = 620;      // 떨어지는 시간 — 짧아야 '팍' 이 된다
const RING_MS   = 780;      // 착지 파문
const LIFE_MS   = FALL_MS + RING_MS;
const DROP_KM   = 900;      // 이 높이에서 떨어진다
const RING_KM   = 260;      // 파문이 퍼지는 반경

let _ds = null;             // 핀 전용 데이터소스
let _timer = 0;
let _seq = 0;               // 회차 번호 — 늦게 도착한 타이머가 새 핀을 지우지 못하게

/** 핀 그림을 한 번만 만들어 재사용한다 (canvas → dataURI).
 *  ⚠️ 외부 이미지 파일을 쓰지 않는다. 요청이 한 번 더 나가고, 실패하면 핀이 안 보인다. */
let _img = null;
function pinImage(color = '#ff4d4d') {
  if (_img) return _img;
  const W = 48, H = 64, dpr = 2;
  const c = document.createElement('canvas');
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d');
  g.scale(dpr, dpr);

  // 물방울 모양 — 위는 원, 아래는 뾰족하게
  g.beginPath();
  g.moveTo(W / 2, H - 2);                        // 끝점(지면에 닿는 곳)
  g.bezierCurveTo(W / 2 - 4, H - 18, 4, H - 30, 4, 20);
  g.arc(W / 2, 20, 20, Math.PI, 0);
  g.bezierCurveTo(W - 4, H - 30, W / 2 + 4, H - 18, W / 2, H - 2);
  g.closePath();

  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#ff8a8a');
  grad.addColorStop(1, color);
  g.fillStyle = grad;
  g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = 6; g.shadowOffsetY = 2;
  g.fill();
  g.shadowColor = 'transparent';
  g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke();

  // 가운데 구멍
  g.beginPath(); g.arc(W / 2, 20, 7.5, 0, Math.PI * 2);
  g.fillStyle = 'rgba(20,10,14,.92)'; g.fill();

  _img = c.toDataURL('image/png');
  return _img;
}

const easeIn  = p => p * p;                       // 떨어질수록 빨라진다 — 그래야 '팍'
const easeOut = p => 1 - Math.pow(1 - p, 3);

/** 지금 꽂혀 있는 핀을 치운다 */
export function clearPin() {
  clearTimeout(_timer);
  _seq++;
  if (_ds) _ds.entities.removeAll();
}

/**
 * 그 좌표에 핀을 꽂는다.
 * @param lon,lat  꽂을 자리
 * @param label    핀 아래 적을 짧은 글 (없으면 안 적는다)
 */
export function dropPin(lon, lat, label) {
  if (!viewer) return;
  if (!_ds) {
    _ds = new Cesium.CustomDataSource('pin');
    viewer.dataSources.add(_ds);
  }
  clearPin();
  const my = ++_seq;

  const t0 = performance.now();
  const fall = () => Math.min(1, (performance.now() - t0) / FALL_MS);

  // ── 핀 본체 ─────────────────────────────────────────────
  _ds.entities.add({
    id: 'pin:marker',
    position: new Cesium.CallbackProperty(() => {
      const h = DROP_KM * 1000 * (1 - easeIn(fall()));
      return Cesium.Cartesian3.fromDegrees(lon, lat, h);
    }, false),
    billboard: {
      image: pinImage(),
      width: 30, height: 40,
      // ⚠️ BOTTOM 이라야 **핀 끝**이 좌표에 닿는다. CENTER 면 20km 위를 가리킨다.
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      /* 착지 순간 살짝 커졌다 돌아온다 — 부딪힌 느낌을 준다.
         ⚠️ 과하면 유치해진다. 1.18 이상은 눈에 띄게 튄다. */
      scale: new Cesium.CallbackProperty(() => {
        const p = fall();
        if (p < 1) return 1;
        const q = Math.min(1, (performance.now() - t0 - FALL_MS) / 180);
        return 1 + 0.18 * Math.sin(q * Math.PI);
      }, false),
      // 지구 반대편에서 뚫려 보이지 않게 — 가까울 때만 깊이검사를 끈다
      disableDepthTestDistance: 600_000,
    },
    label: label ? {
      text: label,
      font: '500 13px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif',
      fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: new Cesium.Color(0, 0, 0, 0.55),
      backgroundPadding: new Cesium.Cartesian2(8, 5),
      verticalOrigin: Cesium.VerticalOrigin.TOP,
      pixelOffset: new Cesium.Cartesian2(0, 8),
      disableDepthTestDistance: 600_000,
      // 떨어지는 동안에는 글자를 감춘다 — 같이 날아다니면 산만하다
      show: new Cesium.CallbackProperty(() => fall() >= 1, false),
    } : undefined,
  });

  // ── 착지 파문 ───────────────────────────────────────────
  _ds.entities.add({
    id: 'pin:ring',
    position: Cesium.Cartesian3.fromDegrees(lon, lat),
    ellipse: {
      semiMajorAxis: new Cesium.CallbackProperty(() => {
        const q = (performance.now() - t0 - FALL_MS) / RING_MS;
        return q <= 0 ? 1 : 1 + easeOut(Math.min(1, q)) * RING_KM * 1000;
      }, false),
      semiMinorAxis: new Cesium.CallbackProperty(() => {
        const q = (performance.now() - t0 - FALL_MS) / RING_MS;
        return q <= 0 ? 1 : 1 + easeOut(Math.min(1, q)) * RING_KM * 1000;
      }, false),
      material: new Cesium.ColorMaterialProperty(new Cesium.CallbackProperty(() => {
        const q = (performance.now() - t0 - FALL_MS) / RING_MS;
        return Cesium.Color.fromCssColorString('#ff4d4d')
          .withAlpha(q <= 0 ? 0 : 0.18 * (1 - Math.min(1, q)));
      }, false)),
      outline: true,
      outlineColor: new Cesium.CallbackProperty(() => {
        const q = (performance.now() - t0 - FALL_MS) / RING_MS;
        return Cesium.Color.fromCssColorString('#ff8a8a')
          .withAlpha(q <= 0 ? 0 : 0.9 * (1 - Math.min(1, q)));
      }, false),
      outlineWidth: 2,
      height: 0,
    },
  });

  /* 도는 동안만 그린다. 스스로 연장하지 않는다 — 그게 requestRenderMode 를 켠 이유다. */
  power.animate(LIFE_MS);

  /* ⚠️ 끝나면 **반드시** CallbackProperty 를 떼고 정적 핀으로 바꾼다.
     안 그러면 핀 하나가 프레임마다 위치·크기·파문을 다시 계산해
     화면이 멈춰 있어도 GPU 가 계속 돈다 (예전 파문이 그랬다). */
  _timer = setTimeout(() => {
    if (my !== _seq || !_ds) return;              // 그 사이 새 핀이 꽂혔다
    _ds.entities.removeAll();
    _ds.entities.add({
      id: 'pin:marker',
      position: Cesium.Cartesian3.fromDegrees(lon, lat),
      billboard: {
        image: pinImage(), width: 30, height: 40,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        disableDepthTestDistance: 600_000,
      },
      label: label ? {
        text: label,
        font: '500 13px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", sans-serif',
        fillColor: Cesium.Color.WHITE,
        showBackground: true,
        backgroundColor: new Cesium.Color(0, 0, 0, 0.55),
        backgroundPadding: new Cesium.Cartesian2(8, 5),
        verticalOrigin: Cesium.VerticalOrigin.TOP,
        pixelOffset: new Cesium.Cartesian2(0, 8),
        disableDepthTestDistance: 600_000,
      } : undefined,
    });
    power.animate(120);        // 바뀐 모습을 한 번은 그려 줘야 한다
  }, LIFE_MS);
}
