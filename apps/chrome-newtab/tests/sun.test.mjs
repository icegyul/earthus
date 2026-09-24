// sun.js — 태양 직하점이 알려진 값과 맞는가(허용 오차 안에서)
//   기준값: 지점 적위 ±23.44°(하지·동지), 추분(2026-09-23 00:05 UTC 무렵) 적위 ≈ 0, 균시차(9월 말 약 +8분, 6월 말 약 −2분).
import test from 'node:test';
import assert from 'node:assert/strict';
import { subsolarPoint, sunElevationDeg } from '../sun.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} ${a} vs ${b} (±${eps})`);

test('하지 정오(UTC): 적위 +23.44° · 경도 0° 근처', () => {
  const s = subsolarPoint(new Date('2026-06-21T12:00:00Z'));
  near(s.declDeg, 23.44, 0.1, '적위');
  near(s.lonDeg, 0, 1.0, '경도(균시차 약 −1.5분 → 약 +0.4°)');
});

test('동지: 적위 −23.44°', () => {
  near(subsolarPoint(new Date('2026-12-21T12:00:00Z')).declDeg, -23.44, 0.1);
});

test('2026-09-24 06:00 UTC(운영 구름 자료 시각): 적위 약 −0.5° · 경도 약 88°E', () => {
  const s = subsolarPoint(new Date('2026-09-24T06:00:00Z'));
  near(s.declDeg, -0.5, 0.25, '적위(추분 약 30시간 뒤)');
  near(s.lonDeg, 88.0, 0.4, '경도 = 15 × (12 − 6 − 균시차 7.9분/60)');
});

test('자정(UTC) 직하점은 날짜변경선 근처 · 직하점에서 태양 고도는 90°', () => {
  const s = subsolarPoint(new Date('2026-03-20T00:00:00Z'));
  assert.ok(Math.abs(Math.abs(s.lonDeg) - 180) < 3);
  near(sunElevationDeg(s.declDeg, s.lonDeg, s), 90, 1e-6);
  near(sunElevationDeg(-s.declDeg, s.lonDeg + 180, s), -90, 1e-6);
});
