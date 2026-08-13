/* N1 수집기 운영 관제 — 공개 health snapshot을 관리자 화면에서 읽기만 한다.
 * 비밀값·로그 본문·provider 응답은 받지 않고, UNKNOWN을 정상으로 바꾸지 않는다. */

const STATE_COPY = Object.freeze({
  HEALTHY: ['정상 주기', 'ok'],
  AGING: ['한 회차 지연', 'warn'],
  STALE: ['반복 지연', 'bad'],
  PARTIAL: ['부분 실패', 'warn'],
  FAILED: ['실행 실패', 'bad'],
  POLICY_BLOCKED: ['권리 차단', 'blocked'],
  UNKNOWN: ['확인 불가', 'unknown'],
});

const text = value => value == null || value === '' ? '확인할 자료 없음' : String(value);
const integer = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString('ko-KR') : '측정 안 됨';

function stateOf(item) {
  if (STATE_COPY[item?.operationalState]) return item.operationalState;
  return ({ ok: 'HEALTHY', late: 'AGING', dead: 'STALE', missing: 'UNKNOWN' })[item?.state] || 'UNKNOWN';
}

function time(value) {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toLocaleString('ko-KR') : '기록 없음';
}

export function normalizeCollectorHealth(doc) {
  const items = Array.isArray(doc?.items) ? doc.items.map(item => ({ ...item, operationalState: stateOf(item) })) : [];
  const counts = Object.fromEntries(Object.keys(STATE_COPY).map(key => [key, 0]));
  items.forEach(item => { counts[item.operationalState] += 1; });
  return {
    generated: doc?.generated || null,
    revision: doc?.revision || 'legacy health snapshot',
    operationalOverall: STATE_COPY[doc?.operationalOverall] ? doc.operationalOverall
      : (doc?.overall === 'ok' ? 'HEALTHY' : doc?.overall === 'critical' ? 'FAILED' : 'AGING'),
    summary: doc?.summary || '요약 기록 없음',
    items,
    counts,
    limitations: Array.isArray(doc?.limitations) ? doc.limitations : ['상세 CloudWatch 운영 지표는 아직 이 snapshot에 없습니다.'],
  };
}

function el(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value != null) node.textContent = value;
  return node;
}

export function renderCollectorHealth(doc, root) {
  const data = normalizeCollectorHealth(doc);
  root.replaceChildren();

  const head = el('div', 'health-head');
  const title = el('div');
  title.append(el('strong', null, data.summary), el('small', null, `자료 생성 ${time(data.generated)} · ${data.revision}`));
  const overall = el('span', `health-state health-state--${STATE_COPY[data.operationalOverall][1]}`,
    STATE_COPY[data.operationalOverall][0]);
  head.append(title, overall);
  root.append(head);

  const grid = el('div', 'health-counts');
  for (const [state, [label, tone]] of Object.entries(STATE_COPY)) {
    const card = el('div', `health-count health-count--${tone}`);
    card.append(el('b', null, integer(data.counts[state])), el('span', null, label));
    grid.append(card);
  }
  root.append(grid);

  const tableWrap = el('div', 'scroll');
  const table = el('table', 'health-table');
  const thead = el('thead');
  const header = el('tr');
  ['수집기·자료', '상태', '마지막 시도', '마지막 성공', '자료 시각', '표본·결측', '지연·비용'].forEach(label => header.append(el('th', null, label)));
  thead.append(header);
  const tbody = el('tbody');
  for (const item of data.items) {
    const row = el('tr');
    const state = STATE_COPY[item.operationalState];
    const name = el('td');
    name.append(el('b', null, text(item.ko)), el('small', null, text(item.key)));
    row.append(
      name,
      el('td', `health-label health-label--${state[1]}`, state[0]),
      el('td', null, time(item.lastAttemptAt || item.written)),
      el('td', null, time(item.lastSuccessAt)),
      el('td', null, time(item.sourceObservedAt || item.generated)),
      el('td', null, `n ${integer(item.count)} · 결측 ${integer(item.missing)} · 거절 ${integer(item.rejected)}`),
      el('td', null, `응답 ${integer(item.latency?.value)} ms · quota ${text(item.quota)} · 비용 ${text(item.estimatedCost)}`),
    );
    tbody.append(row);
  }
  table.append(thead, tbody);
  tableWrap.append(table);
  root.append(tableWrap);

  const limits = el('ul', 'health-limits');
  data.limitations.forEach(value => limits.append(el('li', null, value)));
  root.append(limits);
  return data;
}

export async function loadCollectorHealth(root, url = './wind/health.json') {
  root.replaceChildren(el('p', 'health-loading', '수집기 실행 상태를 확인하고 있습니다.'));
  try {
    const response = await fetch(`${url}?v=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return renderCollectorHealth(await response.json(), root);
  } catch (error) {
    root.replaceChildren(el('p', 'health-error', `관제 자료를 읽지 못했습니다 · ${error?.message || '원인 기록 없음'}`));
    return null;
  }
}
