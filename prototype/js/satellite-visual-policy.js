/* 제공자/채널별 시각 효과 허용 정책.
 * 본체 threshold와 alpha는 imagery.js의 관측 표시 계약이며 여기서 변경하지 않는다. */

export const SATELLITE_VISUAL_POLICY = Object.freeze({
  'NOAA_GMGSI/global': Object.freeze({ mask: 'source-alpha', effect: 'sun-shadow', enabled: true }),
  'GK2A/vi006fd': Object.freeze({ mask: 'source-alpha', effect: 'sun-shadow', enabled: true }),
  'GK2A/vi006ea': Object.freeze({ mask: 'source-alpha', effect: 'sun-shadow', enabled: true }),
  'GK2A/vi006': Object.freeze({ mask: 'source-alpha', effect: 'sun-shadow', enabled: true }),
  'GK2A/ir112': Object.freeze({ mask: 'source-alpha', effect: 'relief', enabled: true }),
  'GK2A/ir112ea': Object.freeze({ mask: 'source-alpha', effect: 'relief', enabled: true }),
  'GK2A/nightlow': Object.freeze({ mask: 'source-alpha', effect: 'relief', enabled: true }),
  'GK2A/wv063': Object.freeze({ mask: 'none', effect: 'none', enabled: false,
    reason: '수증기는 구름층이나 구름 높이 관측이 아니다' }),
  'HIMAWARI_GIBS/Band3': Object.freeze({ mask: 'conservative-visible', effect: 'sun-shadow', enabled: true }),
  'HIMAWARI_GIBS/Band13': Object.freeze({ mask: 'infrared-luma', effect: 'relief', enabled: true,
    limit: '색은 강수량이 아니라 구름 꼭대기 온도다' }),
});

export function satelliteVisualPolicy(provider, channel) {
  const policy = SATELLITE_VISUAL_POLICY[`${provider}/${channel}`];
  if (!policy) throw new RangeError('SATELLITE_VISUAL_POLICY_MISSING');
  return policy;
}
