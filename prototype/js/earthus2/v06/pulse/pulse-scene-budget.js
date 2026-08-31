const DEFAULTS = Object.freeze({ mobile: { global: 7, country: 12, regional: 18 }, desktop: { global: 12, country: 20, regional: 30 } });

export function pulseBudget({ device = 'desktop', scope = 'global', thermal = 'NORMAL' } = {}) {
  const base = DEFAULTS[device]?.[scope] ?? DEFAULTS.desktop.global;
  const factor = thermal === 'SAFE' ? 0.45 : thermal === 'ECO' ? 0.6 : thermal === 'BALANCED' ? 0.8 : 1;
  return Math.max(3, Math.floor(base * factor));
}

export function selectPulseBeacons(events = [], context = {}) {
  const limit = pulseBudget(context);
  return [...events].sort((a,b) => (b.priorityScore || 0) - (a.priorityScore || 0) || String(a.id).localeCompare(String(b.id))).slice(0, limit);
}
