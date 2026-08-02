/* 산 — 정상 예보와 실측을 나란히 놓는다
 *
 * 왜 이 기능인가
 *   등산객에게 필요한 건 "오늘 맑음"이 아니라 **정상이 몇 도인가**, 그리고
 *   **그 숫자를 얼마나 믿을 수 있나**다. 옷과 회귀 시각을 그걸로 정한다.
 *
 * ⚠️⚠️ 만들면서 발견한 것 (2026-08-02 실측)
 *   기상청 산악예보(getMountainWeather)와, **같은 산 고지대 AWS 관측소**의
 *   실측을 표준 감률로 정상까지 환산한 값을 비교했더니:
 *
 *       예보 − 실측환산 :  중앙 +1.4°C · 범위 −3.7 ~ **+7.7°C**
 *       (무등산 정상 1187m — 예보 36.0°C / 무등산 관측소 912m 실측 29.8°C → 환산 28.3°C)
 *
 *   짐작되는 원인은 격자다. 동네예보 격자는 5km 라 **모델 지형이 봉우리를 뭉갠다** —
 *   1,187m 봉우리가 모델에서는 수백 m 로 들어가 있으면 그 높이의 기온이 나온다.
 *
 *   여름에는 덜 위험하지만 **겨울에 같은 +7도 편의는 사람이 죽는다.**
 *   영하 2도로 알고 올라갔는데 영하 10도면 저체온증이다.
 *
 *   → 그래서 이 기능은 예보를 예쁘게 꾸미지 않는다. **둘 다 보여주고 차이를 적는다.**
 *     그게 우리가 할 수 있고 남들이 못 하는 일이다(둘 다 갖고 있으므로).
 *
 * ⚠️ 실측이 언제나 있는 것은 아니다. 85봉 중 고지대 관측소를 가진 것은 14개(16%)다.
 *    없으면 없다고 적는다 — 있는 척하지 않는다.
 *
 * ⚠️⚠️ **"안전합니다"라고 말하지 않는다.** 우리는 예보 기관이 아니고 산에서는
 *    사람이 죽는다. 사실을 나란히 놓고 차이를 강조할 뿐이다.
 *    판단과 책임은 등산하는 사람과 공식 발표에 있다.
 */

import { get, distKm, feelsLike } from './korea.js';

/* 기온 감률 — 고도 100m 오를 때 몇 도 떨어지는가.
   ⚠️ 흔히 쓰는 6.5°C/km 가 아니라 **5.5°C/km** 를 쓴다.
      ECMWF Forecast User Guide §9.2.1 이 2m 기온 보정에는 5.5 가 낫다고 명시한다.
      (docs/methodology-sources.md "확인 완료 ④" 참고 — 예보 검증에서 쓰는 값과 같다) */
const LAPSE_C_PER_KM = 5.5;

/* 같은 산의 고지대 관측소로 인정하는 조건 */
const LOCAL_KM = 8;          // 이보다 멀면 다른 산·다른 사면이다
const LOCAL_FRAC = 0.55;     // 정상 고도의 이 비율 이상이어야 "고지대"
/* ⚠️ 환산 거리 상한. 5.5°C/km 로 600m 를 끌어올리면 3.3도인데, 그보다 멀리
      끌면 감률 가정 자체의 오차가 값을 지배한다. 그럴 바엔 환산하지 않는다. */
const EXTRAPOLATE_MAX_M = 600;

/* 산 아래 짝 — 고도차를 실감시키는 용도 */
const BASE_MAX_KM = 35;
const BASE_MIN_DROP_M = 400;

/* 눈에 띄게 적을 기준.
   ⚠️ 기상청 특보 기준을 가져다 쓰지 않는다 — 확인하지 않은 수치를 공식 기준인 양
      적으면 그게 곧 거짓이다. 아래는 **우리가 정한 표시 기준**이고 화면에도 그렇게 적는다. */
const MARK = { dropC: 10, windMs: 10, popPct: 60, coldC: 5, gapC: 3 };

const SKY = { ko: { 1: '맑음', 3: '구름많음', 4: '흐림' },
              en: { 1: 'Clear', 3: 'Partly cloudy', 4: 'Overcast' } };

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };

/** 'YYYYMMDDHHmm' (KST 로 적힌 값) → Date */
function kst(s) {
  if (!s || s.length < 12) return null;
  return new Date(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
                + `T${s.slice(8, 10)}:${s.slice(10, 12)}:00+09:00`);
}

/** 관측 고도에서 목표 고도까지 감률로 끌어올린다 */
function lapseTo(obsC, obsAlt, targetAlt) {
  return obsC - LAPSE_C_PER_KM * (targetAlt - obsAlt) / 1000;
}

export const mountain = {
  peaks: [],
  meta: null,
  _built: 0,

  async build() {
    if (this.peaks.length && Date.now() - this._built < 5 * 60_000) return this.peaks;

    const [mt, aws] = await Promise.all([get('mountain'), get('aws')]);
    const st = (aws.stations || [])
      .filter(s => s.lat != null && s.lon != null && s.alt != null && s.ta != null);
    const obsAt = kst(aws.observedKst);

    const out = [];
    for (const p of (mt.peaks || [])) {
      const alt = num(p.alt);
      const tmp = num(p.TMP);
      const wsd = num(p.WSD);
      const reh = num(p.REH);
      if (alt == null || tmp == null) continue;

      /* ① 같은 산의 고지대 관측소 — 있으면 이게 주인공이다.
         정상 고도에 **가장 가까운** 것을 고른다. 가장 높은 것이 아니다 —
         환산 거리가 짧을수록 감률 가정의 영향이 작다. */
      let high = null;
      for (const s of st) {
        if (s.alt < alt * LOCAL_FRAC) continue;
        const km = distKm(p.lat, p.lon, s.lat, s.lon);
        if (km > LOCAL_KM) continue;
        const gap = Math.abs(alt - s.alt);
        if (!high || gap < high.gapM) high = { ...s, km, gapM: gap };
      }

      /* ② 산 아래 — 고도차를 실감시키는 용도. 가까운 것 우선.
         ⚠️ "가장 낮은 곳"을 고르면 멀리 있는 해안 관측소를 끌어와
            다른 지역 날씨를 비교하게 된다. */
      let base = null;
      for (const s of st) {
        if (alt - s.alt < BASE_MIN_DROP_M) continue;
        const km = distKm(p.lat, p.lon, s.lat, s.lon);
        if (km > BASE_MAX_KM) continue;
        if (!base || km < base.km) base = { ...s, km };
      }

      // 실측 기반 정상 추정 — 환산 거리가 짧을 때만 낸다
      let est = null;
      if (high && high.gapM <= EXTRAPOLATE_MAX_M) {
        est = Math.round(lapseTo(high.ta, high.alt, alt) * 10) / 10;
      }

      const feel = feelsLike(tmp, reh, wsd);

      out.push({
        name: p.name,
        lat: p.lat, lon: p.lon, alt,

        // ── 정상 (기상청 예보) ──
        temp: tmp,
        feel: feel && feel.kind !== 'plain' ? Math.round(feel.v * 10) / 10 : null,
        feelKind: feel ? feel.kind : null,
        wind: wsd, windDir: num(p.VEC), hum: reh,
        sky: num(p.SKY), pop: num(p.POP),
        pcp: p.PCP && p.PCP !== '강수없음' ? p.PCP : null,
        sno: p.SNO && p.SNO !== '적설없음' ? p.SNO : null,
        fcstAt: kst(p.tempFcstKst || p.fcstKst),

        // ── 같은 산 고지대 실측 (있을 때만) ──
        high: high ? {
          name: high.name, alt: high.alt, temp: high.ta,
          wind: num(high.ws10) ?? num(high.ws1), gust: num(high.wss),
          hum: num(high.hm), rain60: num(high.rn60),
          km: Math.round(high.km * 10) / 10,
          upM: Math.round(alt - high.alt),
        } : null,
        est,                                   // 실측을 정상 고도로 환산한 값
        gap: est != null ? Math.round((tmp - est) * 10) / 10 : null,  // 예보 − 실측환산

        // ── 산 아래 실측 ──
        base: base ? {
          name: base.name, alt: base.alt, temp: base.ta,
          km: Math.round(base.km),
        } : null,
        drop: base ? Math.round((base.ta - tmp) * 10) / 10 : null,
        riseM: base ? Math.round(alt - base.alt) : null,

        obsAt,
      });
    }

    out.sort((a, b) => b.alt - a.alt);
    this.peaks = out;
    this.meta = {
      count: out.length,
      withHigh: out.filter(p => p.high).length,
      withEst: out.filter(p => p.est != null).length,
      fcstBase: `${mt.baseDateKst || ''} ${mt.baseTimeKst || ''}`.trim(),
      obsKst: aws.observedKst,
      lapse: LAPSE_C_PER_KM,
      source: mt.source,
      obsSource: aws.source,
    };
    this._built = Date.now();
    return out;
  },

  /** 내 위치에서 가까운 순 */
  near(lat, lon, n = 10) {
    return this.peaks
      .map(p => ({ ...p, km: Math.round(distKm(lat, lon, p.lat, p.lon)) }))
      .sort((a, b) => a.km - b.km)
      .slice(0, n);
  },

  /** 실측을 가진 봉우리부터 (기능의 값어치가 여기 있다) */
  withObs() {
    return this.peaks.filter(p => p.high)
      .sort((a, b) => Math.abs(b.gap ?? 0) - Math.abs(a.gap ?? 0));
  },

  /**
   * 눈에 띄는 것들.
   * ⚠️ 위험도 점수를 만들지 않는다 — "위험 3단계" 같은 숫자는 근거 없이 권위를 갖는다.
   *    무엇이 얼마인지와, 그게 우리 기준인지를 같이 적는다.
   */
  marks(p, ko = true) {
    const m = [];
    if (p.gap != null && Math.abs(p.gap) >= MARK.gapC) {
      const warmer = p.gap > 0;
      m.push(ko
        // ⚠️ 형용사마다 어미가 다르다: 따뜻하다→따뜻합니다 / 차갑다→차갑습니다
        ? `예보가 실측보다 ${Math.abs(p.gap).toFixed(1)}도 ${warmer ? '더 따뜻합니다' : '더 차갑습니다'}`
        : `Forecast runs ${Math.abs(p.gap).toFixed(1)}°C ${warmer ? 'warmer' : 'colder'} than measured`);
    }
    if (p.drop != null && p.drop >= MARK.dropC) {
      m.push(ko ? `산 아래보다 ${p.drop.toFixed(1)}도 낮습니다`
                : `${p.drop.toFixed(1)}°C colder than the valley`);
    }
    if (p.wind != null && p.wind >= MARK.windMs) {
      m.push(ko ? `능선 바람 ${p.wind.toFixed(1)} m/s`
                : `Ridge wind ${p.wind.toFixed(1)} m/s`);
    }
    if (p.feel != null && p.feelKind === 'chill' && p.feel <= MARK.coldC) {
      m.push(ko ? `바람 때문에 체감 ${p.feel.toFixed(1)}도`
                : `Feels like ${p.feel.toFixed(1)}°C with wind`);
    }
    if (p.pop != null && p.pop >= MARK.popPct) {
      m.push(ko ? `강수확률 ${Math.round(p.pop)}%` : `${Math.round(p.pop)}% chance of rain`);
    }
    if (p.sno) m.push(ko ? `적설 ${p.sno}` : `Snow ${p.sno}`);
    return m;
  },

  skyText(v, ko = true) { return (ko ? SKY.ko : SKY.en)[Math.round(v)] || '—'; },

  LAPSE_C_PER_KM, MARK, EXTRAPOLATE_MAX_M,
};
