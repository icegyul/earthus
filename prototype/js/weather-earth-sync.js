// Weather Card와 지구본의 좁은 연결 계약.
// 카드의 값 자체는 weather-contract-v7가 정본이고, 이 모듈은 장면·레이어·선택 시각만 전달한다.

const WEATHER_LAYERS = new Set(['rain', 'wind', 'pm25']);

function validLocation(location) {
  const lat = Number(location?.lat);
  const lon = Number(location?.lon);
  return Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

function customEvent(target, type, detail) {
  const CustomEventClass = target?.defaultView?.CustomEvent || globalThis.CustomEvent;
  return CustomEventClass ? new CustomEventClass(type, { detail }) : { type, detail };
}

export function createWeatherEarthSync(deps = {}) {
  const eventTarget = deps.eventTarget || document;
  let pending = Promise.resolve();
  let started = false;

  const sync = {
    async applyLayer(detail = {}) {
      const id = String(detail.id || '');
      if (!WEATHER_LAYERS.has(id)) return false;
      await deps.sceneMgr?.to?.('earth', { stage: 'surface' });
      deps.store?.setLayer?.(id, true);
      return true;
    },

    async applyTime(detail = {}) {
      const validAt = String(detail.validAt || '');
      const at = Date.parse(validAt);
      if (!Number.isFinite(at) || !validLocation(detail.location)) return false;
      const normalized = {
        validAt: new Date(at).toISOString(),
        location: {
          name: detail.location?.name || null,
          lat: Number(detail.location.lat),
          lon: Number(detail.location.lon),
          timezone: detail.location?.timezone || null,
        },
        hour: detail.hour || null,
      };
      await deps.sceneMgr?.to?.('earth', { stage: 'surface' });
      deps.renderMoment?.(normalized);
      deps.flyTo?.(normalized.location.lon, normalized.location.lat, 2_800_000, 0.9);
      eventTarget.dispatchEvent(customEvent(eventTarget, 'earthus:weather-time-applied', normalized));
      return true;
    },

    init() {
      if (started) return sync;
      started = true;
      eventTarget.addEventListener('earthus:weather-layer-request', onLayer);
      eventTarget.addEventListener('earthus:weather-time', onTime);
      return sync;
    },

    flush() { return pending; },

    destroy() {
      if (!started) return;
      started = false;
      eventTarget.removeEventListener('earthus:weather-layer-request', onLayer);
      eventTarget.removeEventListener('earthus:weather-time', onTime);
    },
  };

  function enqueue(work) {
    pending = pending.then(work).catch(error => {
      console.warn('[weather-earth-sync] 연결 실패:', error?.message || error);
      return false;
    });
  }
  function onLayer(event) { enqueue(() => sync.applyLayer(event.detail)); }
  function onTime(event) { enqueue(() => sync.applyTime(event.detail)); }

  return sync;
}
