// EARTHUS v2-three — 리포트 센터 (PHASE 8 §13 · §14 · §19)
//
// 엔진이 낸 보고서를 읽는 화면. 값을 여기서 만들지 않는다 — 보고서 JSON 이 정본이다.
//
// ⚠️ 이 파일은 숫자를 계산하지 않는다. 스토리 제목·요약도 엔진이 만든 것을 그대로 쓴다.
//    화면에서 문장을 만들면 서술 검증기를 통과하지 않은 문장이 사용자에게 간다.
//
// ⚠️ FREE/PRO 는 **표시 구분**이지 보안 경계가 아니다(§14).
//    진짜 차단은 서버가 두 판을 따로 내려 줄 때 생긴다. 클라이언트에서 감추는 것은
//    돈을 받는 근거가 될 수 없다 — 그 사실을 여기 적어 둔다.
//
// ⚠️ '준비 중' 을 쓰지 않는다. 없으면 왜 없는지 보고서가 말한 사유를 그대로 보여 준다.

import { i18n } from './i18n.js?v=11';
import { representativeLayerFor, PHENOMENA } from './phenomenon-registry.js?v=4';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// §4 — 숫자 자리에는 **진짜 숫자만** 넣는다.
//   참/거짓을 숫자로 캐스팅하지 않는다(true→1, false→0 이 되면 없는 값이 0점으로 보인다).
//   NaN·Infinity 도 값이 아니다. 값이 아니면 '—' 로 남긴다 — 0 으로 채우지 않는다.
const num = (v, dash = '—') => (
  typeof v === 'number' && Number.isFinite(v) ? String(v) : dash);

// 평가하지 못한 것을 0 으로 바꾸지 않기 위한 표식.
const isMissing = (v) => v === null || v === undefined || typeof v === 'boolean'
  || (typeof v === 'number' && !Number.isFinite(v));

// §13 — reportId ↔ 정본 주소. 파이썬 report_contract.report_url 과 같은 규칙이다.
// 두 곳에 있는 규칙이라 어긋나면 링크가 죽는다. 시험이 양쪽을 같이 본다.
export const reportUrl = (reportId) => {
  if (typeof reportId !== 'string' || !reportId.includes(':')) return null;
  const [kind, period] = [reportId.slice(0, reportId.indexOf(':')), reportId.slice(reportId.indexOf(':') + 1)];
  if (!period) return null;
  if (kind === 'report') return `/reports/${period.toLowerCase()}`;
  if (kind === 'outlook') return `/reports/outlook/${period.toLowerCase()}`;
  return null;
};

export const reportIdFromUrl = (path) => {
  if (typeof path !== 'string') return null;
  const p = path.trim().replace(/\/+$/, '');
  const up = (s) => (s.length === 7 && s[5].toLowerCase() === 'q' ? s.slice(0, 5) + s.slice(5).toUpperCase() : s);
  if (p.startsWith('/reports/outlook/')) return 'outlook:' + up(p.slice('/reports/outlook/'.length));
  if (p.startsWith('/reports/')) {
    const rest = p.slice('/reports/'.length);
    if (!rest || rest.includes('/')) return null;
    return 'report:' + up(rest);
  }
  return null;
};

// 발행 키. publisher.report_key 와 같은 규칙 — 판이 키에 들어가므로 v1 은 덮이지 않는다.
// S3 키. 앱 주소(reportUrl)와 다른 것이다 — 위 reportUrl 은 브라우저 경로,
// 이것은 저장소 키다. 발행본은 `reports/published/` 아래에만 있고 버킷 정책도
// 그 접두사만 연다 (INTEGRATION-9 §1). 여기를 `reports/` 로 되돌리면 403 이 된다.
export const PUBLIC_REPORT_PREFIX = 'reports/published/';
export const reportKey = (reportId, version = 1) => `${PUBLIC_REPORT_PREFIX}${String(reportId).replace(':', '/')}/v${version}.json`;
export const reportIndexKey = () => `${PUBLIC_REPORT_PREFIX}index.json`;

// §11 자료 라벨 → 사람이 읽는 말
export const DATA_LABEL_TEXT = {
  DATA_COMPLETE: { ko: '자료 충분', en: 'Data complete' },
  DATA_PARTIAL: { ko: '일부 자료', en: 'Partial data' },
  INSUFFICIENT_DATA: { ko: '자료 부족', en: 'Insufficient data' },
  NOT_EVALUABLE: { ko: '평가 불가', en: 'Not evaluable' },
};

// §1 스토리 종류 → 사람이 읽는 말. 중요도를 '위험'이라 부르지 않는다(§2).
export const STORY_TYPE_TEXT = {
  EXTREME: { ko: '기록급', en: 'Record' },
  PERSISTENT: { ko: '오래 이어짐', en: 'Persistent' },
  FAST_CHANGE: { ko: '빠른 변화', en: 'Fast change' },
  WIDESPREAD: { ko: '넓은 범위', en: 'Widespread' },
  UNEXPECTED: { ko: '예상 밖', en: 'Unexpected' },
  HIGH_IMPACT: { ko: '영향 큼', en: 'High impact' },
  CROSS_DOMAIN: { ko: '분야 연결', en: 'Cross-domain' },
  FORECAST_MISS: { ko: '예보 빗나감', en: 'Forecast miss' },
  FORECAST_HIT: { ko: '예보 적중', en: 'Forecast hit' },
};

const EVIDENCE_TEXT = {
  COINCIDING: { ko: '같은 기간', en: 'Coinciding' },
  ASSOCIATED: { ko: '함께 움직임', en: 'Associated' },
  CONSISTENT_WITH: { ko: '알려진 관계와 일치', en: 'Consistent with' },
  CONNECTED: { ko: '연결', en: 'Connected' },
  POSSIBLE_INFLUENCE: { ko: '영향 가능성', en: 'Possible influence' },
};

// §14 — 무료로 여는 것. 의도적으로 빈약하게 만들지 않는다: 이야기와 핵심 숫자는 다 준다.
export const FREE_SECTIONS = new Set([
  'cover', 'this_month', 'quarter_in_one_page', 'the_year',
  'top_stories', 'top_changes', 'snapshot',
  'what_surprised_us', 'forecast_review', 'forecast_performance', 'explore',
]);

// 현재 등급. 서버가 알려 주기 전까지는 free 다 — 모르면서 pro 라고 하지 않는다.
export const currentTier = () => {
  try {
    return (window.EARTHUS_TIER || localStorage.getItem('earthus.tier') || 'free').toLowerCase();
  } catch (_) {
    return 'free';
  }
};

// ── 스토리 카드 ─────────────────────────────────────────────────────────────
// §19-C — 무슨 일 / 왜 중요한지 / 근거 가 한 카드 안에서 이어져야 한다.
const whyText = (story, ko) => {
  const f = (story.factors && story.factors.factorsUsed) || {};
  const c = story.comparison || {};
  const bits = [];
  if (c.rankHigh && c.ofYears) {
    bits.push(ko ? `${c.ofYears}년 중 ${c.rankHigh}번째` : `${c.rankHigh} of ${c.ofYears} years`);
  }
  const t = story.temporalExtent || {};
  if (t.longestRun) bits.push(ko ? `${t.longestRun}일 연속` : `${t.longestRun} days in a row`);
  const share = (story.spatialExtent || {}).sameDirectionShare;
  if (typeof share === 'number') {
    bits.push(ko ? `같은 방향 지역 ${Math.round(share * 100)}%` : `${Math.round(share * 100)}% of regions`);
  }
  if (!bits.length && typeof f.cross_domain === 'number') {
    bits.push(ko ? '다른 분야와 함께 움직임' : 'moves with another domain');
  }
  return bits.join(' · ');
};

export const storyCardHtml = (story, ko) => {
  const type = STORY_TYPE_TEXT[story.storyType] || { ko: story.storyType, en: story.storyType };
  const why = whyText(story, ko);
  const refs = (story.sourceRefs || []).slice(0, 2).join(' · ');
  const nFacts = (story.factIds || []).length;
  const phen = (story.phenomenonIds || [])[0];
  const layerKey = phen ? representativeLayerFor(phen) : null;
  const ev = story.evidenceLevel ? (EVIDENCE_TEXT[story.evidenceLevel] || {})[ko ? 'ko' : 'en'] : null;
  return `<article class="rc-story" data-testid="report-story" data-story-id="${esc(story.storyId)}" data-story-type="${esc(story.storyType)}">
    <div class="rc-story-h">
      <span class="rc-badge" data-testid="story-type">${esc(ko ? type.ko : type.en)}</span>
      ${ev ? `<span class="rc-badge rc-badge-ev">${esc(ev)}</span>` : ''}
    </div>
    <h4 class="rc-story-t">${esc(ko ? story.title : (story.titleEn || story.title))}</h4>
    <p class="rc-story-s">${esc(ko ? story.summary : (story.summaryEn || story.summary))}</p>
    ${why ? `<p class="rc-why"><b>${ko ? '왜 중요한가' : 'Why it matters'}</b> ${esc(why)}</p>` : ''}
    <p class="rc-evi" data-testid="story-evidence"><b>${ko ? '근거' : 'Evidence'}</b> ${esc(refs || (ko ? '보고서 팩트' : 'report facts'))} · ${ko ? `팩트 ${nFacts}건` : `${nFacts} facts`}</p>
    ${storyActionsHtml(story, phen, layerKey, ko)}
  </article>`;
};

// §12 — 보고서에서 나갈 수 있는 곳. **능력이 있는 것만 보여 준다.**
// ⚠️ 없는 기능을 버튼으로 만들지 않는다. 시뮬레이션 능력은 레지스트리에서 정확히 2개다
//    (hazards.tsunami · ocean.wave). 나머지 현상에 '조건을 바꿔보기'를 달면
//    눌러도 아무 일이 없거나 엉뚱한 화면이 뜬다 — 그건 거짓 약속이다.
export const storyActionsHtml = (story, phenomenonId, layerKey, ko) => {
  if (!layerKey) return '';
  const cap = ((PHENOMENA[phenomenonId] || {}).capabilities) || {};
  const btn = (action, testid, labelKo, labelEn) =>
    `<button class="rp-phen" data-story-action="${action}" data-story-phenomenon="${esc(layerKey)}"`
    + ` data-story-id="${esc(story.storyId)}" data-testid="${testid}">`
    + `${ko ? labelKo : labelEn}</button>`;
  const out = [btn('phenomenon', 'story-to-phenomenon', '자세히 보기', 'Open phenomenon')];
  if (cap.intelligence) {
    out.push(btn('intelligence', 'story-to-intelligence', '분석', 'Analysis'));
  }
  if (cap.simulation) {
    out.push(btn('simulation', 'story-to-simulation', '조건을 바꿔보기', 'Change the conditions'));
  }
  return `<div class="rc-actions">${out.join('')}</div>`;
};

// ── 절 ──────────────────────────────────────────────────────────────────────
const sectionHtml = (sec, report, ko, tier) => {
  const label = DATA_LABEL_TEXT[sec.dataLabel];
  const free = FREE_SECTIONS.has(sec.id);
  const gated = tier !== 'pro' && !free;
  const title = ko ? sec.titleKo : (sec.titleEn || sec.titleKo);
  const stories = (report.stories || []).filter((s) => (sec.storyRefs || []).includes(s.storyId));

  let body = '';
  if (gated) {
    // §14 — 결과 일부를 보여 준 뒤 잠근다. 빈 배너를 세우지 않는다.
    const peek = stories[0];
    body = (peek ? storyCardHtml(peek, ko) : '')
      + `<p class="rc-lock" data-testid="pro-gate">${ko
        ? '이 절의 상세(지역별 값 · 불확실성 · 전체 출처)는 PRO 에서 이어집니다.'
        : 'Regional values, uncertainty and full provenance continue in PRO.'}</p>`;
  } else if (sec.empty) {
    const why = ko ? (sec.reasonKo || sec.reasonEn) : (sec.reasonEn || sec.reasonKo);
    body = `<p class="rc-empty" data-testid="section-empty">${esc(why || (ko ? '이 기간에는 내용이 없습니다.' : 'Nothing for this period.'))}</p>`;
  } else if (stories.length) {
    body = stories.map((s) => storyCardHtml(s, ko)).join('');
  } else if ((sec.factRefs || []).length) {
    body = factTableHtml(sec.factRefs, report, ko);
  } else if (sec.id === 'what_surprised_us') {
    body = surpriseHtml(sec, ko);
  } else if (sec.status) {
    body = `<p class="rc-empty">${esc(ko ? (sec.reasonKo || '') : (sec.reasonEn || ''))}</p>`;
  }

  return `<section class="rc-sec" data-testid="report-section" data-section-id="${esc(sec.id)}" data-data-label="${esc(sec.dataLabel || '')}">
    <h3 class="rc-sec-h">${esc(title)}
      ${label ? `<span class="rc-label" data-testid="data-label">${esc(ko ? label.ko : label.en)}</span>` : ''}</h3>
    ${body}
  </section>`;
};

const factTableHtml = (refs, report, ko) => {
  const by = new Map((report.facts || []).map((f) => [f.factId, f]));
  const rows = refs.map((id) => by.get(id)).filter(Boolean).slice(0, 40);
  if (!rows.length) return '';
  return `<div class="rc-scroll"><table class="rc-table" data-testid="fact-table">
    <thead><tr><th>${ko ? '항목' : 'Item'}</th><th>${ko ? '값' : 'Value'}</th><th>${ko ? '평년 대비' : 'vs normal'}</th><th>${ko ? '표본' : 'Sample'}</th><th>${ko ? '출처' : 'Source'}</th></tr></thead>
    <tbody>${rows.map((f) => {
    const c = f.comparison || {};
    const anom = (typeof c.anomaly === 'number' && Number.isFinite(c.anomaly))
      ? `${c.anomaly > 0 ? '+' : ''}${c.anomaly}` : '—';
    const val = isMissing(f.value) ? '—' : `${esc(f.value)}${f.unit ? ' ' + esc(f.unit) : ''}`;
    return `<tr><td>${esc(f.metric)}</td><td>${val}</td>`
      + `<td>${esc(anom)}</td><td>${num(f.sampleCount)}</td><td>${esc(f.source || '')}</td></tr>`;
  }).join('')}</tbody></table></div>`;
};

const surpriseHtml = (sec, ko) => {
  const items = sec.items || [];
  const gaps = sec.coverageGaps || [];
  const nc = sec.notComputable || [];
  const parts = [];
  if (items.length) {
    // ⚠️ 변수 이름을 빼면 "GFS 24시간이 낮게 봤다"와 "GFS 24시간이 높게 봤다"가
    //    나란히 서서 서로를 반박하는 것처럼 읽힌다. 하나는 기온, 하나는 바람인데도.
    parts.push(`<ul class="rc-list" data-testid="surprise-items">${items.map((x) => {
      const p = PHENOMENA[x.phenomenonId];
      const what = p ? (ko ? p.label.ko : p.label.en) : x.phenomenonId;
      return `<li data-model="${esc(x.modelId)}" data-phenomenon="${esc(x.phenomenonId)}">${esc(
        ko ? `${x.modelId} ${what} ${x.leadHours}시간 예보가 실측보다 ${x.directionKo} 봤습니다 — 평균오차 ${x.bias}, 오차의 ${Math.round(x.systematicRatio * 100)}%가 한쪽 방향`
          : `${x.modelId} ${what} ${x.leadHours}h ran ${x.bias > 0 ? 'high' : 'low'} — bias ${x.bias}, ${Math.round(x.systematicRatio * 100)}% one-directional`)}</li>`;
    }).join('')}</ul>`);
  }
  if (gaps.length) {
    // §3 의 핵심 — 예보가 없던 현상은 '빗나갔다'가 아니라 '볼 수 없었다'다.
    parts.push(`<p class="rc-gap" data-testid="coverage-gaps">${ko
      ? `예보가 없어 맞다·틀리다를 말할 수 없는 현상 ${gaps.length}개`
      : `${gaps.length} phenomena had no forecast to be right or wrong about`}: `
      + gaps.slice(0, 8).map((g) => esc(g.phenomenonId) + (g.wasExtreme ? (ko ? '(기록급)' : ' (record)') : '')).join(', ') + '</p>');
  }
  if (nc.length) {
    parts.push(`<p class="rc-note-sm" data-testid="not-computable">${ko ? '아직 판정할 수 없는 것' : 'Not yet computable'}: `
      + nc.map((x) => esc(ko ? x.reasonKo : x.type)).join(' · ') + '</p>');
  }
  return parts.join('') || `<p class="rc-empty">${ko ? '평가할 예보가 없었습니다.' : 'No forecast to evaluate.'}</p>`;
};

// ── 예보 성적표 (§10) ───────────────────────────────────────────────────────
// 모델 · 변수 · 리드 · 지표 · 표본 · 기간을 **전부** 같이 보여 준다. 하나라도 빠지면
// 두 줄이 그냥 상충하는 값으로 읽힌다.
export const scorecardHtml = (report, ko) => {
  // ⚠️⚠️ 화면이 성적표를 **다시 만들지 않는다.** 엔진이 낸 report.forecastScorecard 를 그대로 그린다.
  //    전에는 팩트에서 mae 행만 골라 표를 만들었다. 그러면 '평가하지 못한 영역'이
  //    구조적으로 사라진다 — 강수·파고처럼 채점할 수 없는 분야가 표에서 빠지면
  //    "못 한 것"이 "잘한 것"처럼 읽힌다. 엔진은 그걸 막으려고 일부러 행을 남긴다
  //    (aws/report-engine/generator.py build_forecast_scorecard).
  const card = report.forecastScorecard;
  if (!card || !(card.rows || []).length) return '';
  const rows = card.rows;
  return `<section class="rc-sec" data-testid="report-scorecard">
    <h3 class="rc-sec-h">${ko ? '예보 성적표' : 'Forecast scorecard'} <span class="rc-label">${esc(card.period)}</span></h3>
    <div class="rc-scroll"><table class="rc-table">
      <thead><tr><th>${ko ? '현상' : 'Phenomenon'}</th><th>${ko ? '모델' : 'Model'}</th><th>${ko ? '리드' : 'Lead'}</th><th>${ko ? '지표' : 'Metric'}</th><th>${ko ? '값' : 'Value'}</th><th>${ko ? '표본' : 'Sample'}</th></tr></thead>
      <tbody>${rows.map((r) => {
    if (!r.evaluated) {
      // 평가하지 못한 행. 숫자 대신 **사유**를 적는다. 빈칸으로 두지 않는다.
      return `<tr data-evaluated="false"><td>${esc(r.phenomenonId)}</td>`
        + `<td colspan="5" class="rc-na">${esc(ko ? (r.reasonText || r.reason) : r.reason)}</td></tr>`;
    }
    const sc = r.scores || {};
    return `<tr data-evaluated="true"><td>${esc(r.phenomenonId)}</td><td>${esc(r.modelId ?? '—')}</td>`
      + `<td>${num(r.leadHours)}h</td><td>MAE</td>`
      + `<td>${num(sc.mae)}</td><td>${num(r.sampleCount)}</td></tr>`;
  }).join('')}</tbody></table></div>
    <p class="rc-note-sm">${ko
    ? `채점 ${card.evaluatedCount}건 · 평가 불가 ${card.notEvaluatedCount}건. 리드타임을 합치지 않고 모델을 섞지 않습니다. 평가하지 못한 분야도 사유와 함께 남깁니다.`
    : `${card.evaluatedCount} scored · ${card.notEvaluatedCount} not evaluable. Lead times are never merged and models never blended; what we could not score is listed with its reason.`}</p>
  </section>`;
};

// ── 보고서 한 편 ────────────────────────────────────────────────────────────
export const reportDocHtml = (report, { ko = true, tier = 'free' } = {}) => {
  const label = DATA_LABEL_TEXT[report.dataLabel];
  const url = report.canonicalUrl || reportUrl(report.reportId);
  const secs = (report.sections || []).map((s) => sectionHtml(s, report, ko, tier)).join('');
  const links = report.crossDomainLinks || [];
  return `<article class="rc-doc" data-testid="report-doc" data-report-id="${esc(report.reportId)}" data-tier="${esc(tier)}">
    <header class="rc-doc-h">
      <button class="rp-phen" data-report-back="1" data-testid="report-back">${ko ? '← 목록' : '← Back'}</button>
      <div>
        <b>${esc(report.reportId.split(':')[1] || '')}</b>
        ${label ? `<span class="rc-label" data-testid="report-data-label">${esc(ko ? label.ko : label.en)}</span>` : ''}
      </div>
      ${url ? `<code class="rc-url" data-testid="canonical-url">${esc(url)}</code>` : ''}
    </header>
    ${secs}
    ${scorecardHtml(report, ko)}
    ${links.length ? `<section class="rc-sec" data-testid="report-links">
      <h3 class="rc-sec-h">${ko ? '분야를 가로지른 관계' : 'Cross-domain relations'}</h3>
      <ul class="rc-list">${links.map((L) => `<li data-relation="${esc(L.relationType)}" data-evidence="${esc(L.evidenceLevel)}">${esc(ko ? L.explanation.ko : (L.explanation.en || L.explanation.ko))}</li>`).join('')}</ul>
      <p class="rc-note-sm">${ko
    ? '상관은 원인을 말하지 않습니다. 공통 추세를 뺀 뒤의 값으로 판정했습니다.'
    : 'Correlation does not imply cause. Judged after removing the shared linear trend.'}</p>
    </section>` : ''}
    <footer class="rc-foot">
      <span>${ko ? '스냅샷' : 'Snapshot'} ${esc(report.dataSnapshotId || '')}</span>
      <span>${esc(report.algorithmVersion || '')}</span>
    </footer>
  </article>`;
};
