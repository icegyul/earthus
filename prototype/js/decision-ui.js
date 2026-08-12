// Earthus Decision UI v1 — source adapter가 검증된 결과를 보낼 때만 여는 표시 모듈.
// 이 파일은 fetch·예약 실행·개인화 저장을 하지 않는다.

import { compareDecisionViewModels, createDecisionViewModel } from './decision-ui-model.js';

export const DECISION_UI_VERSION = 'earthus.decision-ui.v1.0.0';

const esc = value => String(value ?? '')
  .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

function score(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(Number(value) % 1 ? 1 : 0) : '—';
}

function evidenceMarkup(evidence, lang) {
  if (!evidence) return '';
  const parts = [evidence.source, evidence.observedAt, evidence.revision && `rev ${evidence.revision}`]
    .filter(Boolean).map(esc);
  if (evidence.n !== null && evidence.n !== undefined) parts.push(`n=${esc(evidence.n)}`);
  return parts.length ? `<p class="du-evidence">${parts.join(' · ')}</p>` : '';
}

function reasonMarkup(reasons) {
  if (!Array.isArray(reasons) || !reasons.length) return '';
  return `<ul class="du-reasons">${reasons.slice(0, 4).map(reason => `<li>${esc(reason)}</li>`).join('')}</ul>`;
}

function personalMarkup(axis, lang, visible) {
  if (!visible || axis.personalizedScore == null) return '';
  const sign = axis.boundedDelta > 0 ? '+' : '';
  const label = lang === 'en' ? 'With my preferences' : '내 취향 반영';
  const reasons = (axis.personalContributions || []).map(item => {
    const name = lang === 'en' ? item.labelEn : item.labelKo;
    const itemSign = item.points > 0 ? '+' : '';
    return `${name} ${itemSign}${score(item.points)}`;
  });
  return `<div class="du-personal" data-personal-score>
    <span>${esc(label)}</span>
    <strong>${score(axis.personalizedScore)}</strong>
    <em>${sign}${score(axis.boundedDelta)}</em>
    ${reasonMarkup(reasons)}
  </div>`;
}

function axisMarkup(axis, lang, personalVisible) {
  const classes = `du-axis du-axis--${axis.key.toLowerCase()} du-tone--${axis.tone}`;
  return `<article class="${classes}" data-axis="${axis.key}" ${axis.unknown ? 'data-unknown="true"' : ''}>
    <header><span>${esc(axis.label)}</span>${axis.blocker ? `<b>${lang === 'en' ? 'CHECK' : '확인 필요'}</b>` : ''}</header>
    <div class="du-axis-value">${esc(axis.primary)}</div>
    ${axis.secondary ? `<p class="du-axis-note">${esc(axis.secondary)}</p>` : ''}
    ${personalMarkup(axis, lang, personalVisible)}
    ${reasonMarkup(axis.reasons)}
    ${evidenceMarkup(axis.evidence, lang)}
  </article>`;
}

function contributionMarkup(model) {
  const fit = model.axes.find(axis => axis.key === 'ACTIVITY_FIT');
  if (!fit?.contributions?.length) return '';
  const title = model.lang === 'en' ? 'Why this base score?' : '공용 점수는 어떻게 계산됐나요?';
  return `<details class="du-ledger">
    <summary>${esc(title)}</summary>
    <ol>${fit.contributions.map(item => `<li>
      <span>${esc(item.label || item.factor)}</span>
      <strong>${esc(item.rawValue)} ${esc(item.unit)}</strong>
      <em>${score(item.points)}pt · ${score(item.weight * 100)}%</em>
    </li>`).join('')}</ol>
  </details>`;
}

export function decisionPanelMarkup(model, { personalVisible = true, synthetic = false } = {}) {
  const lang = model.lang;
  const title = lang === 'en' ? 'Activity decision evidence' : '활동 판단 근거';
  const close = lang === 'en' ? 'Close decision panel' : '활동 판단 닫기';
  const personal = lang === 'en' ? 'Turn personalization off' : '개인화 끄기';
  const restore = lang === 'en' ? 'Show personalization' : '개인화 다시 보기';
  return `<section class="decision-ui" role="region" aria-labelledby="decisionUiTitle" data-decision-id="${esc(model.decisionId)}">
    <div class="du-head">
      <div>
        <span class="du-kicker">DECISION · ${esc(model.releaseMode || 'UNKNOWN')}</span>
        <h2 id="decisionUiTitle" tabindex="-1">${esc(title)}</h2>
        <p>${esc(model.profileLabel)} · ${esc(model.label)}</p>
      </div>
      <button type="button" class="du-close" data-decision-close aria-label="${esc(close)}">×</button>
    </div>
    ${synthetic ? `<p class="du-synthetic" role="note">${lang === 'en' ? 'Synthetic development data — never an observation or recommendation.' : '합성 개발 자료 · 실제 관측·안전·예약·추천이 아닙니다.'}</p>` : ''}
    <p class="du-recommendation" data-state="${esc(model.recommendation.state)}">
      <strong>${esc(model.recommendation.label)}</strong>
      <span>${esc(model.recommendation.reason)}</span>
    </p>
    <div class="du-axis-list" aria-label="${lang === 'en' ? 'Five decision axes, safety first' : '안전이 첫 번째인 5축 판단'}">
      ${model.axes.map(axis => axisMarkup(axis, lang, personalVisible)).join('')}
    </div>
    ${model.personal ? `<button type="button" class="du-personal-toggle" data-personal-toggle aria-pressed="${personalVisible}">${personalVisible ? esc(personal) : esc(restore)}</button>` : ''}
    ${contributionMarkup(model)}
    <p class="du-foot">${lang === 'en'
      ? 'Safety, official closure, availability and confidence are never changed by personalization.'
      : '개인화는 안전·공식 폐쇄·예약 사실·예보 자료 신뢰도를 바꾸지 않습니다.'}</p>
  </section>`;
}

function compareCell(axis) {
  const personal = axis.personalizedScore == null ? ''
    : `<span>${axis.boundedDelta > 0 ? '+' : ''}${score(axis.boundedDelta)} → ${score(axis.personalizedScore)}</span>`;
  return `<div class="du-compare-value du-tone--${axis.tone}" ${axis.unknown ? 'data-unknown="true"' : ''}>
    <strong>${esc(axis.primary)}</strong>${axis.secondary ? `<span>${esc(axis.secondary)}</span>` : ''}${personal}${evidenceMarkup(axis.evidence)}
  </div>`;
}

export function decisionCompareMarkup(compare) {
  const lang = compare.left?.lang || 'ko';
  const title = lang === 'en' ? 'Decision comparison' : '5축 판단 비교';
  const close = lang === 'en' ? 'Close comparison' : '비교 닫기';
  if (compare.status !== 'COMPARABLE') {
    return `<section class="decision-ui decision-ui--compare" role="region" aria-labelledby="decisionUiTitle">
      <div class="du-head"><h2 id="decisionUiTitle" tabindex="-1">${esc(title)}</h2><button type="button" class="du-close" data-decision-close aria-label="${esc(close)}">×</button></div>
      <p class="du-synthetic" role="alert">${lang === 'en' ? 'Comparison requires the same activity profile and time window.' : '같은 활동 프로필·시간창만 비교할 수 있습니다.'}</p>
    </section>`;
  }
  return `<section class="decision-ui decision-ui--compare" role="region" aria-labelledby="decisionUiTitle">
    <div class="du-head"><div><span class="du-kicker">COMPARE · NO SINGLE WINNER</span><h2 id="decisionUiTitle" tabindex="-1">${esc(title)}</h2></div><button type="button" class="du-close" data-decision-close aria-label="${esc(close)}">×</button></div>
    <div class="du-compare-head"><strong>${esc(compare.left.label)}</strong><strong>${esc(compare.right.label)}</strong></div>
    <div class="du-compare-grid">${compare.rows.map(row => `<article data-axis="${row.key}">
      <h3>${esc(row.label)}</h3>${compareCell(row.left)}${compareCell(row.right)}
    </article>`).join('')}</div>
    <p class="du-foot">${lang === 'en' ? 'No winner is calculated. Compare each axis and its evidence.' : '단일 승자를 계산하지 않습니다. 축별 상태와 근거를 따로 비교하세요.'}</p>
  </section>`;
}

function ensureHost() {
  let host = document.getElementById('decisionUiHost');
  if (!host) {
    host = document.createElement('aside');
    host.id = 'decisionUiHost';
    host.hidden = true;
    host.setAttribute('aria-live', 'polite');
    document.body.appendChild(host);
  }
  return host;
}

function ensureStyles() {
  if (document.querySelector('link[data-decision-ui-style]')) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('../css/decision-ui.css?v=20260812-personal1', import.meta.url).href;
  link.dataset.decisionUiStyle = '';
  document.head.appendChild(link);
}

export const decisionUI = {
  _started: false,
  _model: null,
  _personalVisible: true,
  _returnFocus: null,

  init() {
    if (this._started) return this;
    this._started = true;
    ensureStyles();
    document.addEventListener('earthus:decision-result', event => this.present(event.detail || {}));
    document.addEventListener('earthus:decision-compare-result', event => this.presentCompare(event.detail || {}));
    document.addEventListener('earthus:restore-decision', event => {
      document.dispatchEvent(new CustomEvent('earthus:decision-result-request', { detail: event.detail || {} }));
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !ensureHost().hidden) this.close();
    });
    return this;
  },

  present({ baseDecision, personalResult = null, lang = 'ko', label = null, synthetic = false } = {}) {
    this._model = createDecisionViewModel({ baseDecision, personalResult, lang, label });
    this._personalVisible = true;
    this._returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const host = ensureHost();
    host.classList.remove('decision-ui-host--compare');
    host.hidden = false;
    host.innerHTML = decisionPanelMarkup(this._model, { personalVisible: true, synthetic });
    this._bind(host, synthetic);
    host.querySelector('#decisionUiTitle')?.focus({ preventScroll: true });
    document.body.dataset.decisionUi = 'open';
    return this._model;
  },

  presentCompare({ left, right, lang = 'ko' } = {}) {
    const leftModel = left?.schemaVersion === 'earthus.decision-ui-model.v1' ? left : createDecisionViewModel({ ...left, lang });
    const rightModel = right?.schemaVersion === 'earthus.decision-ui-model.v1' ? right : createDecisionViewModel({ ...right, lang });
    const compare = compareDecisionViewModels(leftModel, rightModel);
    const host = ensureHost();
    host.classList.add('decision-ui-host--compare');
    host.hidden = false;
    host.innerHTML = decisionCompareMarkup(compare);
    this._bind(host, false);
    host.querySelector('#decisionUiTitle')?.focus({ preventScroll: true });
    document.body.dataset.decisionUi = 'open';
    return compare;
  },

  _bind(host, synthetic) {
    host.querySelector('[data-decision-close]')?.addEventListener('click', () => this.close());
    host.querySelector('[data-personal-toggle]')?.addEventListener('click', event => {
      this._personalVisible = !this._personalVisible;
      host.innerHTML = decisionPanelMarkup(this._model, { personalVisible: this._personalVisible, synthetic });
      this._bind(host, synthetic);
      const button = host.querySelector('[data-personal-toggle]');
      button?.focus({ preventScroll: true });
      document.dispatchEvent(new CustomEvent('earthus:personalization-toggle-request', {
        detail: { enabled: this._personalVisible, decisionId: this._model.decisionId },
      }));
    });
  },

  close() {
    const host = ensureHost();
    host.hidden = true;
    host.classList.remove('decision-ui-host--compare');
    host.replaceChildren();
    delete document.body.dataset.decisionUi;
    this._returnFocus?.focus?.({ preventScroll: true });
    this._returnFocus = null;
  },
};
