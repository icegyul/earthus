import { DEVICE, THERMAL } from './constants.js';
export function computeSceneBudget({deviceClass=DEVICE.DESKTOP, thermal=THERMAL.NORMAL, panelOpen=false}={}) {
  const safe = thermal === THERMAL.SAFE;
  const mobile = deviceClass === DEVICE.MOBILE;
  return Object.freeze({
    maxPrimary: 1,
    maxSecondary: safe ? 0 : 1,
    maxEventBeacons: safe ? (mobile ? 3 : 5) : (mobile ? 7 : 12),
    allowContinuousVolume: !safe && !mobile,
    allowContinuousFlow: !safe,
    qualityScale: safe ? 0.25 : thermal === THERMAL.ECO ? 0.5 : thermal === THERMAL.BALANCED ? 0.75 : (panelOpen ? 0.85 : 1),
  });
}
