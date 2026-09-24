// EARTHUS v2 — 예보 값 옆에 붙는 고정 문구 하나 (2026-09-24 PD 결정 · docs/PAID-APP-LAUNCH-REVIEW-2026-09-24.md §00-2 (나))
//
// 무엇이 잘못돼 있었나:
//   기상법 제17조("기상청장 외의 자는 예보 및 특보를 할 수 없다")에는 유·무료 구분이 없다. v2 는 GFS 5일 예보 재생 ·
//   지점 카드 '앞으로 5일' · ECMWF 앙상블 개수(51개 중 N개)를 보여 주는데, 화면마다 말이 제각각이었다 —
//   'MODEL' 도장만 있는 곳(구름 줄 · 범례), '공식 예보가 아닙니다'(앙상블 카드), 아무 말도 없는 곳(지점 카드 5일 줄).
//   기상예보업 등록(2026-12) 전까지 PD 가 고른 길은 (나): 예보를 끄지 않고, **외국 수치모델 출력이며 기상청 예보가 아니라는 것을
//   화면마다 같은 말로** 분명히 한다(기상청 서면 질의는 PD 가 보낸다).
//
// 이 파일이 하는 일: 그 **한 문장**을 만든다. 화면마다 따로 쓰면 글자가 갈라진다 — 모든 자리가 이 함수를 부른다.
//   ko "수치모델 예측 · {모델} {실행 시각} — 기상청 예보 아님"
//   en "Model output · {model} {run} — not an official KMA forecast"
//   · 모델 이름과 실행 시각은 **화면에 보인 자료에서** 온다(매니페스트 model·run, 앙상블 파일 run …). 지어내지 않는다.
//     실행 시각을 모르면 그 자리를 뺀다 · 모델 이름을 모르면 그 자리도 뺀다('GFS' 로 채우지 않는다) — 나머지는 그대로.
//   · 기관 발표(기상청·JMA·NHC 태풍 공식 경로, 기상청 특보)에는 붙이지 않는다 — 그건 공식 예보다. 그 자리는 기관 이름을 그대로 둔다.
//     성질 도장으로 가르는 표가 isModelForecastKind 다.
//   · 관측('지금')에는 붙이지 않는다. 타임라인이 지금에서 한 눈금(60초) 넘게 앞일 때만 예보다 — isForecastAt.
//     ⚠️ 이 60초는 time-bus.js NOW_EPS_MS 와 같은 수다(시험이 둘을 대조한다). import 하지 않는 것은 이 파일이 아무것도 import 하지 않게
//        두려고다 — 새 import 하나가 ?v= 사슬을 하나 더 만든다.
//
// 이 파일은 DOM · THREE 를 모른다. 순수 함수뿐이다(tools/earthus-v53/forecast-notice.test.mjs 가 그대로 부른다).
// ⚠️ 이 머리말에 import 식을 글자 그대로 적지 마라 — tools/build-v2-bundle.sh 4/4 가 주석 속 import 도 읽는다(field-legend.js 머리말).

// '지금'의 폭(ms) — time-bus.js NOW_EPS_MS 와 같다.
export const FORECAST_EPS_MS = 60 * 1000;

const TEXT = Object.freeze({
  ko: Object.freeze({ head: '수치모델 예측', tail: '기상청 예보 아님' }),
  en: Object.freeze({ head: 'Model output', tail: 'not an official KMA forecast' }),
});

const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const p2 = (n) => String(n).padStart(2, '0');

// 'YYYYMMDDHH' — ECMWF 태풍 파일(aws/ecmwf-ingest)의 run 꼴. 자료가 실제로 그렇게 싣는다(시각은 UTC).
const COMPACT_RUN = /^(\d{4})(\d{2})(\d{2})(\d{2})$/;

/** 실행 시각 → 'MM/DD HHZ'(UTC · field-legend.js fmtRun 과 같은 꼴). ISO 글자 · Date · ms · 'YYYYMMDDHH' 아무거나. 못 읽으면 ''. */
export const fmtNoticeRun = (run) => {
  if (run == null || run === '') return '';
  const c = typeof run === 'string' ? COMPACT_RUN.exec(run.trim()) : null;
  if (c && (+c[2] < 1 || +c[2] > 12 || +c[3] < 1 || +c[3] > 31 || +c[4] > 23)) return '';   // 달력에 없는 글자는 시각으로 읽지 않는다
  const ms = c ? Date.UTC(+c[1], +c[2] - 1, +c[3], +c[4])
    : run instanceof Date ? run.getTime() : (typeof run === 'number' ? run : Date.parse(String(run)));
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return `${p2(d.getUTCMonth() + 1)}/${p2(d.getUTCDate())} ${p2(d.getUTCHours())}Z`;
};

/**
 * 고정 문구 (순수). { model, run, ko | lang }
 *   model  화면에 보인 자료가 말하는 모델 이름('GFS' · 'ECMWF IFS ENS' …). 없으면 뺀다.
 *   run    그 자료의 실행 시각. 없거나 못 읽으면 뺀다.
 */
export const forecastNotice = ({ model = '', run = null, ko, lang } = {}) => {
  const isKo = ko !== undefined ? !!ko : lang !== 'en';
  const T = TEXT[isKo ? 'ko' : 'en'];
  const id = [clean(model), fmtNoticeRun(run)].filter(Boolean).join(' ');
  return `${T.head}${id ? ` · ${id}` : ''} — ${T.tail}`;
};

const plainEsc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** 같은 문구를 HTML 조각으로 — 모든 자리가 같은 이름표(.fc-notice)를 쓴다(글자 크기 10px 이상은 index.html 한 곳이 정한다). */
export const forecastNoticeHtml = ({ model, run, ko, lang, esc = plainEsc, tag = 'span' } = {}) =>
  `<${tag} class="fc-notice" data-fc-notice>${esc(forecastNotice({ model, run, ko, lang }))}</${tag}>`;

/** 그 값이 예보인가 — 유효 시각이 지금보다 한 눈금(60초) 넘게 뒤다. 둘 중 하나라도 숫자가 아니면 거짓(모르는 것을 예보라 부르지 않는다). */
export const isForecastAt = (validMs, nowMs) => Number.isFinite(validMs) && Number.isFinite(nowMs) && (validMs - nowMs) >= FORECAST_EPS_MS;

// 성질 도장 → 이 문구를 붙이나. 기관 발표(OFFICIAL_*)와 관측은 붙이지 않는다 — 그 자리는 기관 이름이 말한다.
const MODEL_KINDS = new Set(['MODEL', 'MODEL_SIGNAL', 'PROVIDER_FORECAST', 'EARTHUS_FORECAST']);
export const isModelForecastKind = (kind) => MODEL_KINDS.has(String(kind || ''));
