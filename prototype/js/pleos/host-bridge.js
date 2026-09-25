// EARTHUS Pleos — 차량(host) 연결
//
// 운전 상태·차량 위치·길안내 연결은 차량 쪽 네이티브 껍데기가 window.EarthusPleosHost 로 넣어 준다.
// 기대하는 모양 (네이티브 쪽 구현은 이 저장소에 아직 없다 — docs/pleos/VERIFIED_POLICY.md §1):
//
//   window.EarthusPleosHost = {
//     getDrivingState(): 'PARKED' | 'DRIVING' | 'RESTRICTED' | 'UNKNOWN',   // CarUxRestrictions 등에서 온 값
//     onDrivingStateChange?(callback): unsubscribe,
//     getLocation?(): { lat, lon, accuracyM?, observedAt? } | null,
//     openDirections?({ lat, lon, name }): boolean,                        // 차량 내비로 넘김
//   }
//
// ⚠️ host 가 없거나, 값을 모르거나, 던지면 UNKNOWN 이다. UNKNOWN 은 운전 중과 같이 취급한다.
//    URL 파라미터나 localStorage 로 PARKED 를 켜는 우회로는 두지 않는다 (시험은 host 를 주입한다).

import { DRIVING_STATE, normalizeDrivingState } from './safety-gate.js';

function host(win) {
  const h = win?.EarthusPleosHost;
  return h && typeof h === 'object' ? h : null;
}

export function createHostBridge(win = globalThis) {
  return {
    connected: () => !!host(win),
    drivingState() {
      const h = host(win);
      if (!h || typeof h.getDrivingState !== 'function') return DRIVING_STATE.UNKNOWN;
      try { return normalizeDrivingState(h.getDrivingState()); } catch { return DRIVING_STATE.UNKNOWN; }
    },
    onDrivingStateChange(callback) {
      const h = host(win);
      if (!h || typeof h.onDrivingStateChange !== 'function') return () => {};
      try {
        const off = h.onDrivingStateChange(value => callback(normalizeDrivingState(value)));
        return typeof off === 'function' ? off : () => {};
      } catch { return () => {}; }
    },
    location() {
      const h = host(win);
      if (!h || typeof h.getLocation !== 'function') return null;
      try {
        const loc = h.getLocation();
        const lat = Number(loc?.lat); const lon = Number(loc?.lon);
        if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
        return { lat, lon, accuracyM: Number.isFinite(Number(loc?.accuracyM)) ? Number(loc.accuracyM) : null, observedAt: loc?.observedAt ?? null, source: 'VEHICLE_HOST' };
      } catch { return null; }
    },
    canOpenDirections() {
      const h = host(win);
      return !!(h && typeof h.openDirections === 'function');
    },
    openDirections(target) {
      const h = host(win);
      if (!h || typeof h.openDirections !== 'function') return false;
      try { return h.openDirections(target) === true; } catch { return false; }
    },
  };
}
