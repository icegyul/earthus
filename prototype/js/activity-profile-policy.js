// Earthus Base Activity Profile Policy v1
//
// 이 파일의 수치 곡선은 활동 "적합도"를 재현 가능하게 계산하기 위한 제품 보정안이다.
// 안전 임계값이나 기관 발표를 대체하지 않는다. 공식 특보·폐쇄·낙뢰 같은 Hard Gate는
// Safety Engine에서 먼저 처리하며, 도메인 검토 전에는 긍정 추천을 공개하지 않는다.

export const ACTIVITY_PROFILE_POLICY_VERSION = 'earthus.activity-profile-policy.v1.0.0';
export const ACTIVITY_PROFILE_SCHEMA_VERSION = 'earthus.activity-profile-policy.v1';

const factor = ({ key, label, unit, weight, range, curve, aggregation, basis }) => ({
  key,
  label,
  unit,
  weight,
  range,
  curve,
  aggregation,
  required: true,
  decisionClass: 'FIT_CURVE_NOT_SAFETY_THRESHOLD',
  basis,
});

const policyBasis = 'EARTHUS_v2.3_section_13_15_product_calibration';

export const ACTIVITY_PROFILE_POLICY = {
  schemaVersion: ACTIVITY_PROFILE_SCHEMA_VERSION,
  version: ACTIVITY_PROFILE_POLICY_VERSION,
  releaseMode: 'CALIBRATION_SHADOW',
  approvalStatus: 'IMPLEMENTATION_APPROVED_DOMAIN_REVIEW_PENDING',
  effectiveAt: null,
  rollbackVersion: null,
  basisRefs: [
    'EARTHUS_Product_Development_Spec_v2.3_FINAL_CODEX_HANDOFF.docx#13-15',
    'docs/earthus-v23/DECISION_CORE.md',
  ],
  safetyPrecedence: true,
  objectiveBonuses: [],
  profiles: {
    BASEBALL_SPECTATOR: {
      id: 'BASEBALL_SPECTATOR',
      label: '야구 관람',
      defaultWindowMinutes: 180,
      requiredSafetyGates: [
        'OFFICIAL_LIGHTNING_WARNING',
        'OFFICIAL_EVENT_CANCELLATION',
        'OFFICIAL_TYPHOON_OR_HEAVY_RAIN_WARNING',
      ],
      factors: [
        factor({
          key: 'PRECIPITATION_AMOUNT', label: '시간 강수량', unit: 'mm/h', weight: 0.30,
          range: [0, 500], aggregation: 'MAX_IN_WINDOW', basis: policyBasis,
          curve: [[0, 100], [0.2, 92], [1, 68], [3, 35], [8, 5], [20, 0]],
        }),
        factor({
          key: 'PRECIPITATION_PROBABILITY', label: '강수확률', unit: '%', weight: 0.15,
          range: [0, 100], aggregation: 'MAX_IN_WINDOW', basis: policyBasis,
          curve: [[0, 100], [20, 92], [40, 70], [60, 40], [80, 15], [100, 0]],
        }),
        factor({
          key: 'APPARENT_TEMPERATURE', label: '체감온도', unit: '°C', weight: 0.25,
          range: [-80, 70], aggregation: 'MEAN_IN_WINDOW', basis: policyBasis,
          curve: [[-20, 0], [0, 35], [10, 75], [18, 100], [24, 100], [30, 70], [35, 25], [45, 0]],
        }),
        factor({
          key: 'WIND_SPEED', label: '풍속', unit: 'm/s', weight: 0.15,
          range: [0, 120], aggregation: 'MAX_IN_WINDOW', basis: policyBasis,
          curve: [[0, 95], [2, 100], [5, 88], [8, 58], [12, 20], [18, 0]],
        }),
        factor({
          key: 'RELATIVE_HUMIDITY', label: '상대습도', unit: '%', weight: 0.15,
          range: [0, 100], aggregation: 'MEAN_IN_WINDOW', basis: policyBasis,
          curve: [[0, 35], [30, 75], [45, 100], [60, 95], [75, 65], [90, 25], [100, 5]],
        }),
      ],
    },
    CAMPING: {
      id: 'CAMPING',
      label: '캠핑',
      defaultWindowMinutes: 720,
      requiredSafetyGates: [
        'OFFICIAL_TYPHOON_WARNING',
        'OFFICIAL_WILDFIRE_RESTRICTION',
        'OFFICIAL_CAMPGROUND_CLOSURE',
      ],
      factors: [
        factor({
          key: 'ACCUMULATED_PRECIPITATION', label: '누적 강수량', unit: 'mm', weight: 0.30,
          range: [0, 2000], aggregation: 'SUM_IN_WINDOW', basis: policyBasis,
          curve: [[0, 100], [1, 90], [5, 65], [15, 30], [30, 5], [80, 0]],
        }),
        factor({
          key: 'WIND_GUST', label: '최대 순간풍속', unit: 'm/s', weight: 0.20,
          range: [0, 150], aggregation: 'MAX_IN_WINDOW', basis: policyBasis,
          curve: [[0, 100], [5, 92], [8, 70], [12, 35], [18, 5], [25, 0]],
        }),
        factor({
          key: 'APPARENT_TEMPERATURE', label: '체감온도', unit: '°C', weight: 0.20,
          range: [-80, 70], aggregation: 'MEAN_IN_WINDOW', basis: policyBasis,
          curve: [[-25, 0], [-5, 25], [5, 70], [14, 100], [24, 100], [30, 70], [36, 20], [45, 0]],
        }),
        factor({
          key: 'SNOWFALL', label: '적설', unit: 'cm', weight: 0.15,
          range: [0, 1000], aggregation: 'SUM_IN_WINDOW', basis: policyBasis,
          curve: [[0, 100], [0.5, 88], [2, 60], [5, 25], [10, 5], [30, 0]],
        }),
        factor({
          key: 'RELATIVE_HUMIDITY', label: '상대습도', unit: '%', weight: 0.15,
          range: [0, 100], aggregation: 'MEAN_IN_WINDOW', basis: policyBasis,
          curve: [[0, 45], [30, 80], [45, 100], [65, 90], [80, 55], [95, 10], [100, 0]],
        }),
      ],
    },
    FUTSAL_OUTDOOR: {
      id: 'FUTSAL_OUTDOOR',
      label: '야외 풋살',
      defaultWindowMinutes: 120,
      requiredSafetyGates: [
        'OFFICIAL_LIGHTNING_WARNING',
        'OFFICIAL_FACILITY_CLOSURE',
        'OFFICIAL_EXTREME_HEAT_WARNING',
      ],
      factors: [
        factor({
          key: 'PRECIPITATION_AMOUNT', label: '시간 강수량', unit: 'mm/h', weight: 0.25,
          range: [0, 500], aggregation: 'MAX_IN_WINDOW', basis: policyBasis,
          curve: [[0, 100], [0.2, 90], [1, 55], [3, 20], [8, 0]],
        }),
        factor({
          key: 'PRECIPITATION_PROBABILITY', label: '강수확률', unit: '%', weight: 0.15,
          range: [0, 100], aggregation: 'MAX_IN_WINDOW', basis: policyBasis,
          curve: [[0, 100], [20, 90], [40, 65], [60, 35], [80, 10], [100, 0]],
        }),
        factor({
          key: 'APPARENT_TEMPERATURE', label: '체감온도', unit: '°C', weight: 0.25,
          range: [-80, 70], aggregation: 'MEAN_IN_WINDOW', basis: policyBasis,
          curve: [[-20, 0], [0, 30], [8, 70], [14, 95], [20, 100], [25, 85], [30, 50], [35, 10], [45, 0]],
        }),
        factor({
          key: 'AIR_QUALITY_INDEX', label: '대기질 지수', unit: 'index', weight: 0.20,
          range: [0, 1000], aggregation: 'MAX_IN_WINDOW', basis: policyBasis,
          curve: [[0, 100], [50, 90], [100, 65], [150, 35], [200, 10], [300, 0]],
        }),
        factor({
          key: 'WIND_SPEED', label: '풍속', unit: 'm/s', weight: 0.15,
          range: [0, 120], aggregation: 'MAX_IN_WINDOW', basis: policyBasis,
          curve: [[0, 80], [2, 100], [5, 85], [8, 45], [12, 10], [18, 0]],
        }),
      ],
    },
    HIKING: {
      id: 'HIKING',
      label: '등산',
      defaultWindowMinutes: 300,
      requiredSafetyGates: [
        'OFFICIAL_TRAIL_CLOSURE',
        'OFFICIAL_WILDFIRE_RESTRICTION',
        'OFFICIAL_LIGHTNING_WARNING',
        'INSUFFICIENT_DESCENT_MARGIN',
      ],
      factors: [
        factor({
          key: 'ACCUMULATED_PRECIPITATION', label: '누적 강수량', unit: 'mm', weight: 0.20,
          range: [0, 2000], aggregation: 'SUM_IN_WINDOW', basis: policyBasis,
          curve: [[0, 100], [1, 88], [5, 58], [15, 20], [30, 0]],
        }),
        factor({
          key: 'SNOWFALL', label: '적설', unit: 'cm', weight: 0.15,
          range: [0, 1000], aggregation: 'SUM_IN_WINDOW', basis: policyBasis,
          curve: [[0, 100], [0.2, 82], [1, 50], [3, 15], [8, 0]],
        }),
        factor({
          key: 'WIND_GUST', label: '최대 순간풍속', unit: 'm/s', weight: 0.20,
          range: [0, 150], aggregation: 'MAX_IN_WINDOW', basis: policyBasis,
          curve: [[0, 100], [5, 90], [8, 65], [12, 25], [18, 0]],
        }),
        factor({
          key: 'DESCENT_MARGIN', label: '일몰 전 하산 여유', unit: 'min', weight: 0.25,
          range: [-1440, 1440], aggregation: 'WINDOW_END_TO_SUNSET', basis: policyBasis,
          curve: [[-60, 0], [0, 10], [30, 50], [60, 85], [120, 100], [240, 100]],
        }),
        factor({
          key: 'AIR_QUALITY_INDEX', label: '대기질 지수', unit: 'index', weight: 0.20,
          range: [0, 1000], aggregation: 'MAX_IN_WINDOW', basis: policyBasis,
          curve: [[0, 100], [50, 90], [100, 65], [150, 35], [200, 10], [300, 0]],
        }),
      ],
    },
    STARGAZING: {
      id: 'STARGAZING',
      label: '별보기',
      defaultWindowMinutes: 180,
      requiredSafetyGates: [
        'OFFICIAL_FACILITY_OR_ROAD_CLOSURE',
        'OFFICIAL_STORM_WARNING',
        'OFFICIAL_LIGHTNING_WARNING',
      ],
      factors: [
        factor({
          key: 'CLOUD_COVER', label: '운량', unit: '%', weight: 0.30,
          range: [0, 100], aggregation: 'MEAN_IN_WINDOW', basis: policyBasis,
          curve: [[0, 100], [10, 90], [25, 70], [50, 35], [75, 10], [100, 0]],
        }),
        factor({
          key: 'VISIBILITY', label: '가시거리', unit: 'm', weight: 0.20,
          range: [0, 200000], aggregation: 'MIN_IN_WINDOW', basis: policyBasis,
          curve: [[0, 0], [2000, 20], [5000, 55], [10000, 85], [20000, 100], [50000, 100]],
        }),
        factor({
          key: 'RELATIVE_HUMIDITY', label: '상대습도', unit: '%', weight: 0.15,
          range: [0, 100], aggregation: 'MEAN_IN_WINDOW', basis: policyBasis,
          curve: [[0, 90], [20, 100], [45, 95], [65, 70], [80, 35], [95, 5], [100, 0]],
        }),
        factor({
          key: 'PRECIPITATION_PROBABILITY', label: '강수확률', unit: '%', weight: 0.10,
          range: [0, 100], aggregation: 'MAX_IN_WINDOW', basis: policyBasis,
          curve: [[0, 100], [20, 85], [40, 55], [60, 25], [80, 5], [100, 0]],
        }),
        factor({
          key: 'MOON_ILLUMINATION', label: '달 밝기', unit: '%', weight: 0.10,
          range: [0, 100], aggregation: 'MID_WINDOW', basis: policyBasis,
          curve: [[0, 100], [25, 90], [50, 65], [75, 35], [100, 10]],
        }),
        factor({
          key: 'DARKNESS_MARGIN', label: '일몰 후 경과', unit: 'min', weight: 0.15,
          range: [-1440, 1440], aggregation: 'WINDOW_START_FROM_SUNSET', basis: policyBasis,
          curve: [[-60, 0], [0, 20], [30, 70], [60, 100], [240, 100]],
        }),
      ],
    },
  },
};

export function getActivityProfile(profileId) {
  return ACTIVITY_PROFILE_POLICY.profiles[String(profileId || '')] || null;
}

/** 구간 선형보간. 범위 밖은 가장 가까운 공개 곡선 끝점으로 고정한다. */
export function normalizeActivityFactor(value, curve) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Array.isArray(curve) || curve.length < 2) return null;
  if (n <= curve[0][0]) return curve[0][1] / 100;
  for (let i = 1; i < curve.length; i += 1) {
    const [x1, y1] = curve[i - 1];
    const [x2, y2] = curve[i];
    if (n <= x2) {
      const ratio = x2 === x1 ? 0 : (n - x1) / (x2 - x1);
      return (y1 + (y2 - y1) * ratio) / 100;
    }
  }
  return curve[curve.length - 1][1] / 100;
}

export function validateActivityProfilePolicy(policy = ACTIVITY_PROFILE_POLICY) {
  const errors = [];
  const profiles = Object.values(policy?.profiles || {});
  if (profiles.length !== 5) errors.push('PROFILE_COUNT_MUST_BE_5');
  if (policy?.releaseMode !== 'CALIBRATION_SHADOW') errors.push('RELEASE_MODE_MUST_BE_SHADOW');
  if (!policy?.safetyPrecedence) errors.push('SAFETY_PRECEDENCE_REQUIRED');
  if (!Array.isArray(policy?.objectiveBonuses) || policy.objectiveBonuses.length) {
    errors.push('OBJECTIVE_BONUSES_FORBIDDEN');
  }
  for (const profile of profiles) {
    if (!profile?.id || profile.id !== Object.keys(policy.profiles).find(k => policy.profiles[k] === profile)) {
      errors.push(`PROFILE_ID_INVALID:${profile?.id || 'missing'}`);
    }
    if (!Array.isArray(profile?.requiredSafetyGates) || !profile.requiredSafetyGates.length) {
      errors.push(`SAFETY_GATES_MISSING:${profile?.id}`);
    }
    const factors = Array.isArray(profile?.factors) ? profile.factors : [];
    const sum = factors.reduce((total, item) => total + Number(item?.weight || 0), 0);
    if (Math.abs(sum - 1) > 1e-9) errors.push(`WEIGHT_SUM_INVALID:${profile?.id}:${sum}`);
    if (new Set(factors.map(item => item?.key)).size !== factors.length) {
      errors.push(`DUPLICATE_FACTOR:${profile?.id}`);
    }
    for (const item of factors) {
      if (!item.required) errors.push(`OPTIONAL_FACTOR_NOT_ALLOWED_V1:${profile?.id}:${item?.key}`);
      if (!item.unit || !item.aggregation || !item.basis) errors.push(`FACTOR_METADATA_MISSING:${profile?.id}:${item?.key}`);
      if (item.decisionClass !== 'FIT_CURVE_NOT_SAFETY_THRESHOLD') {
        errors.push(`FACTOR_CLASS_INVALID:${profile?.id}:${item?.key}`);
      }
      if (!Array.isArray(item.range) || item.range.length !== 2 || item.range[0] >= item.range[1]) {
        errors.push(`RANGE_INVALID:${profile?.id}:${item?.key}`);
      }
      if (!Array.isArray(item.curve) || item.curve.length < 2) {
        errors.push(`CURVE_MISSING:${profile?.id}:${item?.key}`);
      } else {
        for (let i = 1; i < item.curve.length; i += 1) {
          if (item.curve[i][0] <= item.curve[i - 1][0]) errors.push(`CURVE_X_NOT_ASCENDING:${profile?.id}:${item?.key}`);
        }
        if (item.curve.some(point => point[1] < 0 || point[1] > 100)) {
          errors.push(`CURVE_Y_OUT_OF_RANGE:${profile?.id}:${item?.key}`);
        }
      }
    }
  }
  return { valid: errors.length === 0, errors, profileCount: profiles.length };
}
