// EARTHUS — ScenarioCompare: 기준(baseline) 실행 vs 가지(branch) 실행 비교 (계약 §I S-A · §K)
//
// 표류(research-runtime)가 첫 비교 대상이다 — 같은 해류 자료·같은 방출 조건에서 바람 끌림(windage α) 같은
// 조건 하나를 바꾼 가지를 기준과 나란히 본다(계약 §K-3 "SCENARIO 는 허용된 조건만").
//
// ⚠️⚠️ 비교할 수 없는 것을 비교하지 않는다. research_runtime/comparison_v2.py 의 태도 그대로다 —
//    그쪽은 관측 궤적 해시가 다르면 예외를 던진다. 여기서는 다음 중 하나라도 다르면 비교표를 만들지 않고 이유를 말한다:
//      · 런타임 · 입력 자료(datasetId·version·sha256) · 공간 범위 · 시간 범위 · 둘 중 하나가 SIMULATION 이 아님
// ⚠️ 차이가 0 이면 '같음'이다 — '나아짐'이라고 부르지 않는다. 방향(좋다/나쁘다)을 이 파일이 판정하지 않는다
//    — 오차가 줄었는지는 검증(validation)이 말할 일이고, 여기는 '무엇이 얼마나 달라졌나'만 적는다.
// ⚠️ 값은 기록(SimulationRunRecord)과 그 결과 요약에서만 온다. 새로 계산하지 않는다(뺄셈만 한다).

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const datasets = (r) => (r.datasetVersions || []).map((d) => `${d.datasetId}@${d.version}#${d.sha256 || '-'}`).sort();

// 비교할 수 있나 — 다르면 이유 목록
export const comparability = (base, branch) => {
  const reasons = [];
  if (!base || !branch) return ['기준과 가지 기록이 둘 다 있어야 합니다'];
  if (base.truthStatus !== 'SIMULATION' || branch.truthStatus !== 'SIMULATION') reasons.push('둘 다 기록 남는 계산(SIMULATION)이어야 합니다');
  if (base.runtime !== branch.runtime) reasons.push(`런타임이 다릅니다 (${base.runtime} ≠ ${branch.runtime})`);
  if (!same(datasets(base), datasets(branch))) reasons.push('입력 자료(판·해시)가 다릅니다 — 같은 바다를 본 실행이 아닙니다');
  if (!same(base.spatialExtent, branch.spatialExtent)) reasons.push('공간 범위가 다릅니다');
  if (!same(base.temporalRange, branch.temporalRange)) reasons.push('시간 범위가 다릅니다');
  if (base.runRef === branch.runRef) reasons.push('같은 실행입니다');
  return reasons;
};

const flat = (o, pre = '') => Object.entries(o || {}).reduce((acc, [k, v]) => {
  const key = pre ? `${pre}.${k}` : k;
  if (v && typeof v === 'object' && !Array.isArray(v)) Object.assign(acc, flat(v, key));
  else acc[key] = v;
  return acc;
}, {});

// 비교 — base/branch: { record, summary } (summary = 결과 요약 숫자, 예: meanDisplacementMeters)
export const compareRuns = (base, branch) => {
  const reasons = comparability(base && base.record, branch && branch.record);
  if (reasons.length) return { comparable: false, reasons, changed: [], metrics: [] };
  const rb = base.record; const rr = branch.record;
  const changed = [];
  if (rb.modelId !== rr.modelId || rb.modelVersion !== rr.modelVersion) {
    changed.push({ key: 'model', base: `${rb.modelId} ${rb.modelVersion}`, branch: `${rr.modelId} ${rr.modelVersion}` });
  }
  const fb = flat((rb.forcing || {}).params); const fr = flat((rr.forcing || {}).params);
  for (const k of [...new Set([...Object.keys(fb), ...Object.keys(fr)])].sort()) {
    if (!same(fb[k], fr[k])) changed.push({ key: `forcing.${k}`, base: fb[k] ?? null, branch: fr[k] ?? null });
  }
  if ((rb.forcing || {}).kind !== (rr.forcing || {}).kind) changed.push({ key: 'forcing.kind', base: (rb.forcing || {}).kind, branch: (rr.forcing || {}).kind });
  const metrics = [];
  const sb = base.summary || {}; const sr = branch.summary || {};
  for (const k of Object.keys(sb).sort()) {
    const a = sb[k]; const b = sr[k];
    if (typeof a !== 'number' || typeof b !== 'number') continue;
    const d = b - a;
    metrics.push({ key: k, base: a, branch: b, delta: d, same: d === 0 });   // 방향 판정 없음
  }
  return { comparable: true, reasons: [], changed, metrics };
};

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const scenarioCompareHtml = (cmp, { ko = true, badge = () => '' } = {}) => {
  if (!cmp) return '';
  if (!cmp.comparable) {
    return `<div class="card"><div class="card-h">${ko ? '기준 vs 가지 — 비교할 수 없음' : 'Baseline vs branch — not comparable'}</div>`
      + `<div class="card-b">${cmp.reasons.map((r) => `· ${esc(r)}`).join('<br/>')}</div></div>`;
  }
  const rows = cmp.changed.map((c) => `<div class="stat"><span class="k">${esc(c.key)}</span><span class="v">${esc(c.base)} → ${esc(c.branch)}</span></div>`).join('');
  const mets = cmp.metrics.map((m) => `<div class="stat"><span class="k">${esc(m.key)}</span><span class="v">${esc(Math.round(m.base))} → ${esc(Math.round(m.branch))} (${m.same ? (ko ? '같음' : 'same') : `${m.delta > 0 ? '+' : ''}${esc(Math.round(m.delta))}`})</span></div>`).join('');
  return `<div class="card"><div class="card-h">${ko ? '기준 vs 가지' : 'Baseline vs branch'} ${badge('SIMULATION')}</div><div class="card-b">`
    + `<b>${ko ? '바꾼 조건' : 'Changed conditions'}</b>${rows || `<div>${ko ? '없음' : 'none'}</div>`}`
    + `<b>${ko ? '결과 차이' : 'Result difference'}</b>${mets || `<div>${ko ? '비교할 숫자 없음' : 'no numbers to compare'}</div>`}`
    + `<div class="paysub">${ko ? '차이만 적습니다 — 어느 쪽이 맞는지는 검증 기록이 말합니다. 공식 예보가 아닙니다.' : 'Differences only — which is right is for validation to say. Not an official forecast.'}</div></div></div>`;
};
