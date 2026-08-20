// 카드에서 고른 한 시각을 지구 위 한 지점 표식으로 보여준다.
// ⚠️ 전지구 격자가 그 시각 자료인 것처럼 바꾸지 않는다. 카드가 가진 지점 예보만 표시한다.

const SOURCE_LABELS = Object.freeze({
  OBSERVED: { ko: '관측', en: 'Observed' },
  OFFICIAL_FORECAST: { ko: '공식 예보', en: 'Official forecast' },
  MODEL_FORECAST: { ko: '모델 예보', en: 'Model forecast' },
});

const finite = value => value !== null && value !== '' && Number.isFinite(Number(value));

function metric(point, digits = 0) {
  if (!finite(point?.value)) return '—';
  const number = Number(point.value).toFixed(digits).replace(/\.0$/, '');
  const unit = point.unit || '';
  return unit && !['°C', '%', '°'].includes(unit) ? `${number} ${unit}` : `${number}${unit}`;
}

function timeLabel(value, timezone, ko) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return ko ? '시각 오류' : 'Invalid time';
  try {
    return new Intl.DateTimeFormat(ko ? 'ko-KR' : 'en-US', {
      timeZone: timezone || 'UTC', month: 'numeric', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: !ko,
    }).format(date);
  } catch (_) { return date.toISOString().slice(5, 16).replace('T', ' '); }
}

export function createWeatherMomentLayer(deps = {}) {
  let entity = null;
  return {
    show(detail = {}) {
      const Cesium = deps.Cesium;
      const viewer = deps.viewer;
      const lat = Number(detail.location?.lat);
      const lon = Number(detail.location?.lon);
      if (!Cesium || !viewer?.entities || !Number.isFinite(lat) || !Number.isFinite(lon)
        || !Number.isFinite(Date.parse(detail.validAt || ''))) return false;
      if (entity) viewer.entities.remove(entity);
      const ko = (deps.language?.() || 'ko') === 'ko';
      const sourceType = detail.hour?.temperature?.sourceType || 'MODEL_FORECAST';
      const source = SOURCE_LABELS[sourceType]?.[ko ? 'ko' : 'en'] || (ko ? '출처 미확인' : 'Source unknown');
      const text = `${detail.location.name || (ko ? '선택 위치' : 'Selected location')} · ${source}`
        + `\n${timeLabel(detail.validAt, detail.location.timezone, ko)} · ${metric(detail.hour?.temperature)}`
        + ` · ${ko ? '강수' : 'Rain'} ${metric(detail.hour?.precipitationProbability)}`;
      const cyan = Cesium.Color.fromCssColorString('#5bc4ff');
      const dark = Cesium.Color.fromCssColorString('#07111d');
      entity = viewer.entities.add({
        id: 'earthus-weather-moment',
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 60_000),
        point: {
          pixelSize: 13,
          color: cyan,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text,
          font: '600 13px system-ui, sans-serif',
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: dark.withAlpha(.88),
          backgroundPadding: new Cesium.Cartesian2(11, 8),
          pixelOffset: new Cesium.Cartesian2(0, -22),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      deps.power?.animate?.(900);
      return true;
    },

    clear() {
      if (entity) deps.viewer?.entities?.remove?.(entity);
      entity = null;
    },
  };
}
