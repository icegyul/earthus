/* 발사 궤적 계산 — 그리기와 분리한 순수 함수 (2026-09-06)
 *
 * ⚠️ 여기 있는 것은 **근사**다. Launch Library 2 는 목표 궤도의 종류(LEO·SSO·MEO·GTO…)만 주고
 *    경사각을 주지 않는다. 실제 궤도 요소는 발사 뒤 공개 카탈로그(CelesTrak)에 올라와야 확정된다.
 *    그래서 경사각은 아래 네 가지 경우에만 정하고, 화면에 그 근거를 그대로 적는다.
 *
 * Cesium 을 쓰지 않는다 — 그려야 그림이 나오는 코드와 섞으면 검증할 수 없다.
 */
import { i18n } from '../i18n.js';

export const MU = 398600.4418;          // km³/s² 지구 중력상수
export const RE = 6378.137;             // km 적도반경
export const OMEGA = 360 / 86164.0905;  // deg/s 지구 자전(항성일 기준)
const D2R = Math.PI / 180, R2D = 180 / Math.PI;

/** 목표 궤도 → { inc, alt, why, minimum?, exact?, skip? }. 알 수 없으면 null. */
export function inclinationFor(m) {
  const d = m?.data || {};
  const ab = String(d._orbitAbbrev || '').toUpperCase();
  const type = String(d._missionType || '').toLowerCase();
  const text = `${m?.name || ''} ${d._mission || ''}`.toUpperCase();
  const ko = i18n.lang === 'ko';

  if (ab === 'GTO' || ab === 'GEO' || ab === 'GSO') {
    return { skip: true, why: ko
      ? '정지궤도 전이(GTO)는 타원 전이궤도라 원궤도 지상 궤적으로 그리지 않습니다'
      : 'Transfer orbits (GTO) are elliptical — no circular ground track is drawn' };
  }
  /* 정거장 궤도는 고정값이다 — 근사가 아니라 알려진 값 */
  if (/TIANZHOU|SHENZHOU|TIANGONG/.test(text)) {
    return { inc: 41.5, alt: 390, exact: true,
      why: ko ? '중국 톈궁 정거장 궤도(41.5°)' : 'Tiangong station orbit (41.5°)' };
  }
  if (/\b(ISS|PROGRESS|CREW-\d|CYGNUS|SOYUZ MS|CARGO DRAGON|STARLINER|HTV)\b/.test(text)
      || /resupply|human/.test(type)) {
    return { inc: 51.6, alt: 420, exact: true,
      why: ko ? '국제우주정거장 궤도(51.6°) — 정거장으로 가는 발사' : 'ISS orbit (51.6°)' };
  }
  if (ab === 'SSO') {
    return { inc: 97.8, alt: 700,
      why: ko ? '태양동기 궤도(SSO)의 실제 경사각 범위(약 97~99°)에서 잡은 값'
              : 'Sun-synchronous orbit — from its actual 97–99° range' };
  }
  if (ab === 'PO') {
    return { inc: 90, alt: 700, why: ko ? '극궤도(PO)' : 'Polar orbit' };
  }
  const lat = Math.abs(Number(m?.lat));
  if (!Number.isFinite(lat)) return null;
  return { inc: Math.max(lat, 0.1), alt: ab === 'MEO' ? 8000 : 500, minimum: true,
    why: ko ? `발사대 위도 ${lat.toFixed(1)}° — 이 발사대에서 직접 갈 수 있는 **가장 낮은** 경사각입니다. 실제 경사각은 이보다 높을 수 있습니다`
            : `Pad latitude ${lat.toFixed(1)}° — the lowest inclination reachable directly from this pad; the actual orbit may be higher` };
}

/** 발사 방위각(정북 0°, 시계 방향). cos i = sin A · cos φ. 불가능하면 null. */
export function azimuthFor(inc, lat) {
  const c = Math.cos(inc * D2R) / Math.cos(lat * D2R);
  if (!Number.isFinite(c) || Math.abs(c) > 1) return null;
  return ((Math.asin(c) * R2D) + 360) % 360;
}

/** 원궤도 주기(초) */
export function periodSec(altKm) {
  const a = RE + altKm;
  return 2 * Math.PI * Math.sqrt((a * a * a) / MU);
}

/** 발사대에서 시작하는 지상 궤적. { pts: [[lon,lat], …], T } */
export function groundTrack(lat0, lon0, inc, altKm, orbits = 1.6, stepSec = 45) {
  const T = periodSec(altKm);
  const i = inc * D2R;
  const sinI = Math.sin(i);
  if (Math.abs(sinI) < 1e-6) return { pts: [], T };
  // |위도| > 경사각인 발사대는 그 경사각에 못 간다 — 경계(±90°)로 잡는다
  const s = Math.max(-1, Math.min(1, Math.sin(lat0 * D2R) / sinI));
  const u0 = Math.asin(s);
  const rel = (u) => Math.atan2(Math.cos(i) * Math.sin(u), Math.cos(u));
  const rel0 = rel(u0);
  const pts = [];
  for (let t = 0; t <= T * orbits; t += stepSec) {
    const u = u0 + (2 * Math.PI * t) / T;
    const lat = Math.asin(sinI * Math.sin(u)) * R2D;
    let lon = lon0 + (rel(u) - rel0) * R2D - OMEGA * t;
    lon = ((((lon + 180) % 360) + 360) % 360) - 180;
    pts.push([lon, lat]);
  }
  return { pts, T };
}

/** 날짜변경선에서 끊는다 — 안 끊으면 지구를 가로지르는 가짜 직선이 생긴다. */
export function segments(pts) {
  const out = [];
  let cur = [];
  for (let k = 0; k < pts.length; k++) {
    if (k && Math.abs(pts[k][0] - pts[k - 1][0]) > 180) { if (cur.length > 1) out.push(cur); cur = []; }
    cur.push(pts[k]);
  }
  if (cur.length > 1) out.push(cur);
  return out;
}
