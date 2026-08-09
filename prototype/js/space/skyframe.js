// 천구 좌표(RA/Dec) → Cesium 지구고정 좌표 변환
//
// 출처: CesiumJS Transforms 공식 문서
// https://cesium.com/learn/cesiumjs/ref-doc/Transforms.html
// ⚠️ computeIcrfToFixedMatrix()는 지구 자세 자료가 아직 안 왔으면 undefined다.
//    그때 근사 좌표를 만들어내지 않는다. 직전 60초 안의 정상 행렬만 잠깐 재사용하고,
//    그것도 없으면 자료를 기다린다고 명시한다.

const SKY_RADIUS_M = 300_000_000;
const LAST_MATRIX_MAX_AGE_S = 60;
let lastMatrix = null;
let lastMatrixDate = null;

export function radecToIcrf(raDeg, decDeg, radius = SKY_RADIUS_M) {
  if (!Number.isFinite(raDeg) || raDeg < 0 || raDeg >= 360) {
    throw new RangeError('RA_OUT_OF_RANGE');
  }
  if (!Number.isFinite(decDeg) || decDeg < -90 || decDeg > 90) {
    throw new RangeError('DEC_OUT_OF_RANGE');
  }
  const ra = Cesium.Math.toRadians(raDeg);
  const dec = Cesium.Math.toRadians(decDeg);
  const cosDec = Math.cos(dec);
  return new Cesium.Cartesian3(
    radius * cosDec * Math.cos(ra),
    radius * cosDec * Math.sin(ra),
    radius * Math.sin(dec),
  );
}

export function icrfToFixedPosition(icrf, date, options = {}) {
  const compute = options.computeMatrix
    || (d => Cesium.Transforms.computeIcrfToFixedMatrix(d));
  const matrix = compute(date);
  let mode = 'current';
  let usable = matrix;

  if (Cesium.defined(matrix)) {
    lastMatrix = Cesium.Matrix3.clone(matrix, lastMatrix || new Cesium.Matrix3());
    lastMatrixDate = Cesium.JulianDate.clone(date, lastMatrixDate || new Cesium.JulianDate());
  } else {
    const age = lastMatrixDate
      ? Math.abs(Cesium.JulianDate.secondsDifference(date, lastMatrixDate))
      : Number.POSITIVE_INFINITY;
    if (!lastMatrix || age > LAST_MATRIX_MAX_AGE_S) {
      return { position: null, mode: 'waiting' };
    }
    usable = lastMatrix;
    mode = 'last-valid';
  }

  return {
    position: Cesium.Matrix3.multiplyByVector(usable, icrf, new Cesium.Cartesian3()),
    mode,
  };
}

export async function preloadIcrf(date, hours = 12) {
  const start = Cesium.JulianDate.addHours(date, -hours, new Cesium.JulianDate());
  const stop = Cesium.JulianDate.addHours(date, hours, new Cesium.JulianDate());
  await Cesium.Transforms.preloadIcrfFixed(new Cesium.TimeInterval({ start, stop }));
}

function markerCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 80;
  canvas.height = 80;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#79d9ff';
  ctx.fillStyle = '#ffffff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(40, 40, 13, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(40, 2); ctx.lineTo(40, 22);
  ctx.moveTo(40, 58); ctx.lineTo(40, 78);
  ctx.moveTo(2, 40); ctx.lineTo(22, 40);
  ctx.moveTo(58, 40); ctx.lineTo(78, 40);
  ctx.stroke();
  return canvas;
}

function statusElement() {
  let el = document.getElementById('skyframeDiagnostic');
  if (el) return el;
  el = document.createElement('output');
  el.id = 'skyframeDiagnostic';
  el.className = 'skyframe-diagnostic';
  el.setAttribute('aria-live', 'polite');
  document.body.appendChild(el);
  return el;
}

/**
 * B0 전용 진단. 일반 방문에는 만들지 않고 URL에 ?skyframe=1이 있을 때만 실행한다.
 * 북극성 좌표는 개발 사양의 RA 2h31m(37.75°), Dec +89.26°를 그대로 쓴다.
 */
export async function initSkyframeDiagnostic(viewer) {
  if (new URLSearchParams(location.search).get('skyframe') !== '1') return null;
  const status = statusElement();
  const date = Cesium.JulianDate.now();
  const icrf = radecToIcrf(37.75, 89.26);
  status.textContent = 'B0 ICRF 자료를 불러오는 중…';

  try {
    await preloadIcrf(date);
  } catch (error) {
    status.textContent = `B0 ICRF 자료 로드 실패 · ${error?.message || 'unknown'}`;
    document.body.dataset.skyframe = 'load-failed';
    return { ok: false, reason: 'load-failed' };
  }

  const current = icrfToFixedPosition(icrf, date);
  if (!current.position) {
    status.textContent = 'B0 ICRF 자료 대기 중 · 북극성 마커를 그리지 않음';
    document.body.dataset.skyframe = 'waiting';
    return { ok: false, reason: 'waiting' };
  }

  // 정상 행렬을 저장한 직후 undefined를 강제로 넣어 폴백 경로도 같은 실행에서 검증한다.
  const fallback = icrfToFixedPosition(icrf, date, { computeMatrix: () => undefined });
  const cartographic = Cesium.Cartographic.fromCartesian(current.position);
  const fixedLatDeg = Cesium.Math.toDegrees(cartographic.latitude);
  const northAligned = fixedLatDeg >= 88 && fixedLatDeg <= 90;
  const fallbackOk = fallback.mode === 'last-valid' && Cesium.defined(fallback.position);

  const marker = viewer.entities.add({
    id: 'b0-polaris-diagnostic',
    position: current.position,
    billboard: {
      image: markerCanvas(), width: 40, height: 40,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: 'Polaris · B0 ICRF test',
      font: '13px system-ui', fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK, outlineWidth: 4,
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new Cesium.Cartesian2(0, 34),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
  const cameraPosition = Cesium.Cartesian3.fromDegrees(0, 65, 35_000_000);
  const direction = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.subtract(current.position, cameraPosition, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const right = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(direction, Cesium.Cartesian3.UNIT_Z, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  const up = Cesium.Cartesian3.normalize(
    Cesium.Cartesian3.cross(right, direction, new Cesium.Cartesian3()),
    new Cesium.Cartesian3(),
  );
  viewer.camera.setView({ destination: cameraPosition, orientation: { direction, up } });
  viewer.selectedEntity = marker;
  viewer.scene.requestRender();

  const result = { ok: northAligned && fallbackOk, fixedLatDeg, fallback: fallback.mode };
  status.textContent = `B0 ICRF ${result.ok ? 'PASS' : 'FAIL'} · 북극성 방향 위도 ${fixedLatDeg.toFixed(3)}° · 폴백 ${fallback.mode}`;
  document.body.dataset.skyframe = result.ok ? 'pass' : 'fail';
  window.__e = window.__e || {};
  window.__e.skyframe = result;
  return result;
}
