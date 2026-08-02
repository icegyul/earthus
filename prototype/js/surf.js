/* 서핑 — 스웰이 이 해변에 들어오는가
 *
 * 대부분의 날씨 앱은 **파고만** 보여준다. 그런데 서퍼에게 파고 하나는 아무 말도 안 한다:
 *     파고 1.5m · 주기 6초   → 잡파. 못 탄다
 *     파고 1.5m · 주기 14초  → 좋은 그라운드스웰. 최고다
 * 우리는 주기(wave_period·swell_period)를 이미 받고 있으면서 쓰지 않고 있었다.
 *
 * 그리고 파고·주기가 좋아도 **그 해변에 들어오지 않으면** 소용없다.
 * 북향 해변에 남쪽 스웰은 안 들어온다. 그래서 세 가지가 맞아떨어져야 한다:
 *
 *     스웰 높이·주기  ×  해변이 보는 방향  ×  바람 방향
 *
 * ⚠️ **점수를 만들지 않는다.** "서핑 지수 7.2점" 같은 숫자는 근거 없이 권위를 갖고,
 *    무엇 때문에 7.2인지 아무도 모른다. 대신 **세 가지를 각각 말한다** —
 *    스웰이 들어오는가, 바람이 파면을 깎는가, 주기가 어떤가.
 *    합치는 판단은 타는 사람이 한다.
 *
 * ⚠️ **"타기 좋습니다"라고 말하지 않는다.** 바다에서는 사람이 죽는다.
 *    이안류·조류·수심은 우리가 모르는 값이고, 그걸 모르면서 권할 수 없다.
 */

/* ── 방위 규약 (틀리면 전부 뒤집힌다) ────────────────────────────
   · facing      : 해변에서 **바다 쪽**을 보는 방위. 90°면 동쪽에 바다.
   · swellDir    : 스웰이 **오는 쪽**(기상 관례). 90°면 동쪽에서 온다.
   · windDir     : 바람이 **불어오는 쪽**(기상 관례). 90°면 동풍.

   → 스웰은 **오는 쪽이 바다 쪽과 같을 때** 정면으로 들어온다 (swellDir ≈ facing).
   → 바람은 **오는 쪽이 바다 쪽과 같으면 해풍**(onshore, 파면을 뭉갠다),
     **반대면 육풍**(offshore, 파면을 세운다). */

/** 두 방위의 최소 사이각 (0~180) */
export function angleGap(a, b) {
  if (a == null || b == null) return null;
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

/* 스웰 노출 구간.
   ⚠️ 이 경계는 **우리가 정한 표시 기준**이다. 화면에도 그렇게 적는다.
      물리적으로 확실한 것은 "90°를 넘으면 육지가 막는다" 하나뿐이고,
      그 안을 어떻게 나눌지는 판단이다. */
const EXPOSURE = [
  { max: 30,  key: 'direct',  ko: '정면으로 들어옴', en: 'Straight in' },
  { max: 60,  key: 'angled',  ko: '비스듬히 들어옴', en: 'Angled' },
  { max: 85,  key: 'glancing', ko: '스치듯 들어옴', en: 'Glancing' },
  { max: 181, key: 'blocked', ko: '육지에 막힘',     en: 'Blocked by land' },
];

/* 바람 구간 — 해변 기준.
   육풍(offshore)이 파면을 세워 깔끔하게 만든다는 것은 서핑의 기본이다. */
const WIND = [
  { max: 45,  key: 'onshore',  ko: '해풍 — 파면이 뭉개짐', en: 'Onshore — choppy' },
  { max: 135, key: 'cross',    ko: '옆바람',               en: 'Cross-shore' },
  { max: 181, key: 'offshore', ko: '육풍 — 파면이 깔끔',   en: 'Offshore — clean' },
];

/* 주기 구간.
   ⚠️ 서핑에서 널리 쓰는 구분이지만 **공인된 표준은 아니다.** 우리 기준이라고 적는다.
      주기가 길수록 먼 바다에서 정리돼 온 너울(ground swell)이고,
      짧으면 근처 바람이 만든 잡파(wind swell)다. */
const PERIOD = [
  { max: 8,  key: 'wind',   ko: '짧음 — 바람이 만든 잡파', en: 'Short — wind chop' },
  { max: 11, key: 'mid',    ko: '보통',                    en: 'Moderate' },
  { max: 14, key: 'ground', ko: '긺 — 정리된 너울',        en: 'Long — groundswell' },
  { max: 99, key: 'long',   ko: '매우 긺 — 먼 바다 너울',  en: 'Very long — distant groundswell' },
];

const pick = (table, v) => table.find(t => v <= t.max) || table[table.length - 1];

/**
 * 한 해변의 지금 상태를 **말로** 만든다. 점수는 만들지 않는다.
 *
 * @param {{facing:number}} beach              해변 (facing 없으면 판단 불가)
 * @param {{swellH,swellDir,swellPeriod,waveH,wavePeriod}} sea  해양값
 * @param {{speed,dir}} wind                   바람 (없어도 된다)
 */
export function judge(beach, sea, wind, ko = true) {
  const out = { ok: false, why: null, parts: [] };

  if (beach?.facing == null) {
    /* ⚠️ 방위를 모르면 스웰이 들어오는지 **말할 수 없다.**
       모른 채 파고만 보여주면 다른 앱과 같아지고, 더 나쁘게는
       "이 해변 파고 1.5m" 가 "여기 1.5m 파도가 친다"로 읽힌다. */
    out.why = ko ? '이 해변은 바다 방향을 내지 못해 스웰 판단을 할 수 없습니다'
                 : 'No shore orientation for this beach — swell judgement unavailable';
    return out;
  }

  const sH = sea?.swellH ?? sea?.waveH;
  const sP = sea?.swellPeriod ?? sea?.wavePeriod;
  const sD = sea?.swellDir ?? sea?.waveDir;

  if (sH == null || sD == null) {
    out.why = ko ? '이 지점의 파랑 자료가 없습니다 (육지 좌표일 수 있습니다)'
                 : 'No wave data at this point';
    return out;
  }

  // ① 스웰이 들어오는가
  const gap = angleGap(sD, beach.facing);
  const ex = pick(EXPOSURE, gap);
  out.exposure = { key: ex.key, text: ko ? ex.ko : ex.en, gapDeg: Math.round(gap) };
  out.parts.push(ko
    ? `스웰 ${sD.toFixed(0)}° / 해변 ${beach.facing}° → ${ex.ko} (${Math.round(gap)}° 차이)`
    : `Swell ${sD.toFixed(0)}° vs shore ${beach.facing}° → ${ex.en} (${Math.round(gap)}°)`);

  // ② 주기
  if (sP != null) {
    const pd = pick(PERIOD, sP);
    out.period = { key: pd.key, text: ko ? pd.ko : pd.en, s: sP };
    out.parts.push(ko ? `주기 ${sP.toFixed(1)}초 — ${pd.ko}`
                      : `Period ${sP.toFixed(1)} s — ${pd.en}`);
  }

  // ③ 바람 — 없으면 없다고 둔다 (지어내지 않는다)
  if (wind?.dir != null) {
    const wg = angleGap(wind.dir, beach.facing);
    const wd = pick(WIND, wg);
    out.wind = { key: wd.key, text: ko ? wd.ko : wd.en,
                 speed: wind.speed ?? null, gapDeg: Math.round(wg) };
    out.parts.push(ko
      ? `바람 ${wind.dir.toFixed(0)}°${wind.speed != null ? ` ${wind.speed.toFixed(1)}m/s` : ''} — ${wd.ko}`
      : `Wind ${wind.dir.toFixed(0)}°${wind.speed != null ? ` ${wind.speed.toFixed(1)} m/s` : ''} — ${wd.en}`);
  }

  out.height = sH;
  out.ok = true;
  return out;
}

export const SURF_RULES = { EXPOSURE, WIND, PERIOD };
