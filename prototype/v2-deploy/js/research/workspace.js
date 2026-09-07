import { api } from './api-client.js';
import { ResultLayer, visibleSample } from './result-layer.js';

const $ = id => document.getElementById(id);
const ID = item => item?.id || item?.projectId || item?.experimentId || item?.runId || item?.datasetId;
const unwrap = (value, key) => value?.[key] ?? value;
const EVIDENCE = { SYNTHETIC_TEST: '합성 수치시험', OBSERVATION: '관측', ANALYSIS: '모델 분석', REANALYSIS: '재분석', FORECAST: '예보' };
const STATES = { QUEUED: '대기 중', RUNNING: '계산 중', CANCEL_REQUESTED: '취소 처리 중', SUCCEEDED: '계산 완료', FAILED: '실패', CANCELLED: '취소됨' };
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'CANCELLED']);
const state = { projects: [], datasets: [], experiments: [], runs: [], projectId: '', datasetId: '', experimentId: '', runId: '', preflight: null, online: false, results: [], page: 'projects', documents: new Map(), submissionKeys: new Map() };
let pollTimer, playbackTimer, refreshing = false;
try { const saved = JSON.parse(localStorage.getItem('earthus-research-selection.v1') || '{}'); for (const key of ['projectId', 'datasetId', 'experimentId', 'runId']) if (typeof saved[key] === 'string') state[key] = saved[key]; } catch { /* Selection is optional, server records remain authoritative. */ }
const layer = new ResultLayer({ canvas: $('trajectory-canvas'), globeHost: $('globe-host'), empty: $('visual-empty'), note: $('render-note') });

function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = String(text); if (className) node.className = className; return node; }
function valueText(value) { if (value === undefined || value === null || value === '') return '미제공'; return typeof value === 'object' ? JSON.stringify(value) : String(value); }
function message(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); $('message').hidden = !text; }
function saveSelection() { try { localStorage.setItem('earthus-research-selection.v1', JSON.stringify({ projectId: state.projectId, datasetId: state.datasetId, experimentId: state.experimentId, runId: state.runId })); } catch { /* Storage disabled: API persistence still works. */ } }
function showPage(page) {
  if (!['projects', 'datasets', 'experiments', 'runs', 'results'].includes(page)) return;
  state.page = page;
  for (const section of document.querySelectorAll('.page')) section.hidden = section.id !== `page-${page}`;
  for (const button of document.querySelectorAll('[data-page]')) { if (button.dataset.page === page) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); }
  if (page !== 'results') stopPlayback();
  history.replaceState(null, '', `#${page}`); if (page === 'results') requestAnimationFrame(() => layer.render());
}
function details(container, pairs) {
  container.replaceChildren(); const dl = element('dl', undefined, 'details');
  for (const [key, value] of pairs) { dl.append(element('dt', key), element('dd', valueText(value))); }
  container.append(dl);
}
function list(container, items, selected, title, description, choose, badge) {
  container.replaceChildren();
  if (!items.length) { container.append(element('p', state.online ? '아직 저장된 항목이 없습니다.' : '계산 서비스 연결 후 확인할 수 있습니다.', 'empty')); return; }
  for (const item of items) {
    const button = element('button', undefined, `item${ID(item) === selected ? ' selected' : ''}`); button.type = 'button'; button.setAttribute('aria-pressed', ID(item) === selected ? 'true' : 'false');
    button.append(element('strong', title(item)), element('span', description(item)));
    if (badge) button.append(element('span', badge(item), 'badge'));
    button.addEventListener('click', () => act(() => choose(item))); container.append(button);
  }
}
function selectOptions(select, items, selected, title, empty = '선택하세요') {
  select.replaceChildren(new Option(empty, ''));
  for (const item of items) select.add(new Option(title(item), ID(item)));
  select.value = items.some(item => ID(item) === selected) ? selected : '';
}
function online(value) {
  state.online = value; $('backend-status').textContent = value ? '로컬 계산 서비스 연결됨' : '계산 서비스 연결 안 됨'; $('backend-status').classList.toggle('online', value);
  document.querySelectorAll('[data-online]').forEach(button => { button.disabled = !value; });
  updateActions();
}
async function act(fn, button) {
  if (button) button.disabled = true;
  try { await fn(); }
  catch (error) { message(`${error.message}${error.details?.errors ? ` · ${JSON.stringify(error.details.errors)}` : ''}`, true); }
  finally { if (button) button.disabled = button.hasAttribute('data-online') && !state.online; updateActions(); }
}
function updateActions() {
  $('preflight').disabled = !state.online || !state.experimentId;
  $('submit-run').disabled = !state.online || !state.experimentId || state.preflight?.ok !== true;
  $('use-dataset').disabled = !state.online || !state.datasetId;
  const run = state.runs.find(item => ID(item) === state.runId);
  $('cancel-run').disabled = !state.online || !run || TERMINAL.has(run.status) || run.status === 'CANCEL_REQUESTED';
  $('view-results').disabled = !run || run.status !== 'SUCCEEDED' || run.result?.qualityStatus === 'INVALID';
}
function render() {
  const project = state.projects.find(item => ID(item) === state.projectId);
  $('current-project').textContent = project?.name || project?.title || '프로젝트를 선택하세요'; $('project-question').textContent = project?.question || '질문에서 시작하는 재현 가능한 실험';
  $('project-count').textContent = `${state.projects.length}개`;
  list($('project-list'), state.projects, state.projectId, p => p.name || p.title || ID(p), p => p.question || p.createdAt || '', p => { state.projectId = ID(p); saveSelection(); render(); showPage('datasets'); });
  list($('dataset-list'), state.datasets, state.datasetId, d => d.manifest?.title || d.title || d.manifest?.datasetId || d.datasetId || ID(d), d => `${d.manifest?.provider || d.provider || '제공자 미제공'} · version ${d.manifest?.version || d.version || '미제공'}`, selectDataset, d => EVIDENCE[d.manifest?.evidenceKind || d.evidenceKind] || '자료 종류 미확인');
  selectOptions($('experiment-project'), state.projects, state.projectId, p => p.name || p.title || ID(p), '프로젝트 선택');
  const previousDataset = $('experiment-dataset').value || state.datasetId;
  selectOptions($('experiment-dataset'), state.datasets, previousDataset, d => `${d.manifest?.datasetId || d.datasetId || ID(d)} · ${EVIDENCE[d.manifest?.evidenceKind || d.evidenceKind] || '미확인'}`, '자료 선택');
  const projectExperiments = state.experiments.filter(e => !state.projectId || (e.projectId || e.spec?.projectId) === state.projectId);
  list($('experiment-list'), projectExperiments, state.experimentId, e => e.name || e.spec?.question || ID(e), e => `${e.spec?.startTimeUTC || ''} · ${(e.spec?.durationSeconds || 0) / 3600}시간 · ${e.spec?.particleCount ?? '?'}입자`, selectExperiment);
  list($('run-list'), state.runs, state.runId, r => `${STATES[r.status] || r.status} · ${ID(r)}`, r => `${r.createdAt || r.startedAt || ''}${r.result ? ` · ${r.result.qualityStatus}` : ''}`, selectRun);
  const completed = state.runs.filter(r => r.status === 'SUCCEEDED' && r.result?.qualityStatus !== 'INVALID');
  selectOptions($('result-run'), completed, $('result-run').value || state.runId, r => `${r.name || ID(r)} · ${r.result?.qualityStatus || r.status}`, '완료된 기준 실행 선택');
  selectOptions($('comparison-run'), completed, $('comparison-run').value, r => `${r.name || ID(r)}`, '비교 없이 보기');
  updateActions();
}
async function refresh({ silent = false } = {}) {
  if (refreshing) return; refreshing = true;
  try {
    const keys = ['datasets', 'projects', 'experiments', 'runs'];
    const results = await Promise.allSettled(keys.map(key => api[key]()));
    let success = 0, firstError;
    results.forEach((result, index) => { if (result.status === 'fulfilled') { state[keys[index]] = unwrap(result.value, keys[index]) || []; success++; } else firstError ||= result.reason; });
    online(success === keys.length); render();
    if (firstError && !silent) message(firstError.message, true);
    if (success === keys.length && !silent) message('저장된 프로젝트·자료·실험·실행을 불러왔습니다.');
    if (state.runId) { const run = state.runs.find(r => ID(r) === state.runId); if (run) renderRun(run); }
  } finally { refreshing = false; schedulePoll(); }
}
function schedulePoll() {
  clearTimeout(pollTimer);
  if (document.hidden || !state.runs.some(r => !TERMINAL.has(r.status))) return;
  pollTimer = setTimeout(() => act(async () => { await refresh({ silent: true }); if (state.runId) { const run = unwrap(await api.run(state.runId), 'run'); upsertRun(run); renderRun(run); } }), 1800);
}
function upsertRun(run) { const index = state.runs.findIndex(r => ID(r) === ID(run)); if (index < 0) state.runs.unshift(run); else state.runs[index] = run; render(); schedulePoll(); }
async function datasetDocument(id) {
  if (!state.documents.has(id)) { const item = unwrap(await api.dataset(id), 'dataset'); state.documents.set(id, item.document || item.dataset || item); }
  return state.documents.get(id);
}
async function selectDataset(dataset, fill = false) {
  state.datasetId = ID(dataset); saveSelection();
  const document = await datasetDocument(state.datasetId), manifest = document.manifest || dataset.manifest || dataset, grid = document.grid || {};
  details($('dataset-details'), [
    ['자료 ID', manifest.datasetId], ['종류', EVIDENCE[manifest.evidenceKind] || manifest.evidenceKind], ['버전', manifest.version], ['제공자', manifest.provider], ['인용', manifest.citation],
    ['유효 기간', grid.timeUTC?.length ? `${grid.timeUTC[0]} — ${grid.timeUTC.at(-1)}` : manifest.validTimeRange || manifest.temporalCoverage], ['격자', `${grid.lon?.length ?? '?'} × ${grid.lat?.length ?? '?'} · ${grid.timeUTC?.length ?? '?'}시각`],
    ['벡터·단위', manifest.velocityUnits ? `u: ${manifest.uDirection}, v: ${manifest.vDirection} · ${manifest.velocityUnits}` : manifest.variables || manifest.units], ['표층 깊이', manifest.surfaceDepthMeters !== undefined ? `${manifest.surfaceDepthMeters} m` : manifest.depth || manifest.vertical], ['육지 마스크', manifest.landMaskVersion], ['이용 조건', manifest.license || manifest.termsOfUse], ['SHA-256', dataset.sha256 || manifest.sha256],
  ]);
  render(); if (fill) fillDatasetDefaults(document);
}
function fillDatasetDefaults(document) {
  const manifest = document.manifest || {}, grid = document.grid || {};
  $('experiment-dataset').value = state.datasetId;
  $('experiment-evidence').textContent = manifest.evidenceKind === 'SYNTHETIC_TEST' ? '합성 수치시험 · 해석장 검사를 위한 입력입니다. 실제 해양 관측·예측 결과로 해석할 수 없습니다.' : `${EVIDENCE[manifest.evidenceKind] || '자료 종류 미확인'} · 실제 자료의 적격성과 모델 실행 가능 여부는 사전 검사에서 확인합니다. 관측 검증은 별도입니다.`;
  if (grid.timeUTC?.length) {
    $('start-time').value = new Date(grid.timeUTC[0]).toISOString().slice(0, 19);
    const duration = (Date.parse(grid.timeUTC.at(-1)) - Date.parse(grid.timeUTC[0])) / 3600000;
    $('duration').value = Math.min(72, duration);
  }
  if (grid.lon?.length) $('release-lon').value = grid.lon[Math.floor(grid.lon.length / 2)];
  if (grid.lat?.length) $('release-lat').value = grid.lat[Math.floor(grid.lat.length / 2)];
}
function clearPreflight() { state.preflight = null; $('preflight-summary').textContent = '실험을 선택하고 사전 검사를 실행하세요.'; $('preflight-json').hidden = true; updateActions(); }
function selectExperiment(experiment) {
  state.experimentId = ID(experiment); const spec = experiment.spec || experiment; state.projectId = experiment.projectId || spec.projectId || state.projectId; state.datasetId = experiment.datasetId || state.datasetId;
  clearPreflight(); saveSelection(); render();
  $('experiment-name').value = `${experiment.name || '실험'} · 대안`;
  $('experiment-project').value = state.projectId; $('experiment-dataset').value = state.datasetId;
  if (spec.startTimeUTC) $('start-time').value = new Date(spec.startTimeUTC).toISOString().slice(0, 19);
  if (spec.durationSeconds) $('duration').value = spec.durationSeconds / 3600;
  const point = spec.releaseDefinition?.points?.[0]; if (point) { $('release-lon').value = point.lon; $('release-lat').value = point.lat; }
  $('particle-count').value = spec.particleCount || 1; $('integration-step').value = spec.integrationStepSeconds || 300; $('output-step').value = spec.outputStepSeconds || 3600;
  const points = spec.releaseDefinition?.points || [];
  $('release-type').value = points.length > 1 ? 'line' : 'point'; $('release-width-label').hidden = points.length <= 1;
  if (points.length > 1) { $('release-width').value = points.at(-1).lon - points[0].lon; $('release-lon').value = (points.at(-1).lon + points[0].lon) / 2; }
  $('preflight-summary').textContent = `선택: ${experiment.name || ID(experiment)}. 사전 검사는 저장된 명세에 적용합니다. 왼쪽의 편집값은 새 실험으로 저장해야 적용됩니다.`;
}
async function buildSpec() {
  const doc = await datasetDocument($('experiment-dataset').value), manifest = doc.manifest || {}, grid = doc.grid || {};
  const lon = Number($('release-lon').value), lat = Number($('release-lat').value), count = Number($('particle-count').value), width = Number($('release-width').value);
  const points = $('release-type').value === 'line' && count > 1 ? Array.from({ length: count }, (_, i) => ({ lon: lon - width / 2 + width * i / (count - 1), lat, count: 1 })) : [{ lon, lat, count }];
  return {
    schemaVersion: '1.0', projectId: $('experiment-project').value, question: state.projects.find(p => ID(p) === $('experiment-project').value)?.question || '', modelId: 'surface-passive-advection.v1', modelVersion: '0.1.0',
    datasetVersions: [{ datasetId: manifest.datasetId, version: manifest.version }], area: { west: Math.min(...(grid.lon || [lon])), east: Math.max(...(grid.lon || [lon])), south: Math.min(...(grid.lat || [lat])), north: Math.max(...(grid.lat || [lat])) },
    startTimeUTC: `${$('start-time').value}Z`, durationSeconds: Math.round(Number($('duration').value) * 3600), releaseDefinition: { type: 'points', points }, particleCount: count,
    integrationMethod: 'RK4', integrationStepSeconds: Number($('integration-step').value), outputStepSeconds: Number($('output-step').value), boundaryPolicy: 'STOP_AT_FIRST_CROSSING', metrics: ['statusCounts', 'displacementMeters'],
  };
}
async function selectRun(item) { state.runId = ID(item); saveSelection(); const run = unwrap(await api.run(state.runId), 'run'); upsertRun(run); renderRun(run); }
function renderRun(run) {
  details($('run-details'), [['실행 ID', ID(run)], ['상태', STATES[run.status] || run.status], ['결과 품질', run.result?.qualityStatus || run.qualityStatus || '아직 결과 없음'], ['실험 ID', run.experimentId], ['생성 시각', run.createdAt], ['시작 시각', run.startedAt], ['완료 시각', run.finishedAt || run.completedAt], ['오류', run.error?.message || run.error || '없음']]);
  $('run-json').textContent = JSON.stringify({ ...run, result: run.result ? { ...run.result, trajectories: `[${run.result.trajectories?.length || 0}개 입자: 결과 묶음에서 원본 확인]` } : undefined }, null, 2);
  const rawProgress = typeof run.progress === 'number' ? run.progress : run.progress?.percent ?? run.progress?.fraction;
  $('run-progress').hidden = TERMINAL.has(run.status); if (Number.isFinite(rawProgress)) $('run-progress').value = rawProgress <= 1 ? rawProgress * 100 : rawProgress; else $('run-progress').removeAttribute('value');
  updateActions();
}
function flatten(object, prefix = '', rows = [], depth = 0) {
  if (!object || depth > 3) return rows;
  for (const [key, value] of Object.entries(object)) {
    if (Array.isArray(value)) { if (value.length <= 10 && !value.some(v => typeof v === 'object')) rows.push([prefix + key, value.join(', ')]); }
    else if (value && typeof value === 'object') flatten(value, `${prefix}${key}.`, rows, depth + 1);
    else rows.push([prefix + key, value]);
  } return rows;
}
function setTimeline(index) {
  const time = layer.times?.[index]; if (!Number.isFinite(time)) return;
  $('result-time').value = index; $('time-label').textContent = new Date(time).toISOString().replace('.000Z', ' UTC'); layer.setTime(time);
}
function stopPlayback() { clearInterval(playbackTimer); playbackTimer = null; $('play').textContent = '재생'; $('play').setAttribute('aria-label', '시간 재생'); }
function resultTable(results) {
  const table = element('table'), head = element('thead'), tr = element('tr');
  for (const label of ['UTC', '실행', '유효/전체', '경계·결측']) tr.append(element('th', label)); head.append(tr); table.append(head);
  const body = element('tbody');
  // Summary table is bounded independently from immutable full output.
  const stride = Math.max(1, Math.ceil(layer.times.length / 96));
  layer.times.filter((_, index) => index % stride === 0 || index === layer.times.length - 1).forEach(time => results.forEach((result, index) => {
    let valid = 0, invalid = 0, count = 0;
    result.trajectories.forEach(t => { const sample = visibleSample(t.samples, time); if (!sample) return; count++; if (['ACTIVE', 'COMPLETED'].includes(sample.status)) valid++; else invalid++; });
    const row = element('tr'); [new Date(time).toISOString().replace('.000Z', ''), index ? '비교' : '기준', `${valid}/${count}`, invalid].forEach(value => row.append(element('td', value))); body.append(row);
  })); table.append(body); $('result-series').replaceChildren(table);
}
async function loadResults() {
  stopPlayback();
  const baselineId = $('result-run').value; if (!baselineId) throw new Error('완료된 기준 실행을 선택하세요.');
  const comparisonId = $('comparison-run').value;
  if (comparisonId === baselineId) throw new Error('서로 다른 실행을 선택하세요.');
  const ids = [baselineId, comparisonId].filter(Boolean), runs = await Promise.all(ids.map(async id => unwrap(await api.run(id), 'run')));
  if (runs.some(run => run.status !== 'SUCCEEDED' || !run.result || run.result.qualityStatus === 'INVALID')) throw new Error('유효한 완료 결과가 있는 실행만 표시할 수 있습니다.');
  state.results = runs;
  const displayResults = await Promise.all(runs.map(async run => { const input = await datasetDocument(run.datasetId); return { ...run.result, displayContext: { area: run.spec?.area, grid: { lon: input.grid?.lon || [], lat: input.grid?.lat || [] } } }; }));
  const times = layer.setResults(displayResults);
  if (!times.length) throw new Error(runs.length > 1 ? '두 실행에 공통으로 저장된 기간이 없습니다. 시각 범위가 겹치는 실행을 선택하세요.' : '표시할 유효 궤적 좌표가 없습니다. 원본 결과와 실행 오류를 확인하세요.');
  $('result-time').max = Math.max(0, times.length - 1); $('result-time').disabled = times.length === 0; $('play').disabled = times.length < 2; setTimeline(times.length - 1);
  $('result-status').textContent = runs.map((run, i) => `${i ? '비교' : '기준'}: ${ID(run)} · ${run.result.qualityStatus}`).join(' / ');
  $('export-link').href = api.exportURL(baselineId); $('export-link').hidden = false; $('export-link').setAttribute('download', '');
  details($('result-metrics'), runs.flatMap((run, index) => {
    const summary = run.result.summary || {}, counts = summary.statusCounts || {}, prefix = `${index ? '비교' : '기준'} · `;
    const km = value => Number.isFinite(value) ? `${(value / 1000).toFixed(3)} km` : '미제공';
    return [[prefix + '전체 입자', `${summary.particleCount ?? run.result.trajectories.length}개`], [prefix + '계산 기간', `${(summary.durationSeconds || 0) / 3600}시간`], [prefix + '평균 변위', km(summary.meanDisplacementMeters)], [prefix + '최대 변위', km(summary.maxDisplacementMeters)], [prefix + '완료 / 이동 중', `${counts.COMPLETED ?? 0} / ${counts.ACTIVE ?? 0}개`], [prefix + '해안 정지', `${counts.STRANDED ?? 0}개`], [prefix + '영역 이탈', `${counts.OUT_OF_DOMAIN ?? 0}개`], [prefix + '구동 자료 결측', `${counts.MISSING_FORCING ?? 0}개`], [prefix + '경계 검출 시간 간격', `${summary.boundaryTimeResolutionSeconds ?? '미제공'}초`]];
  }));
  const provenance = runs[0].result.provenance || {};
  details($('provenance'), [['계산 모델', `${provenance.modelId || '미제공'} · ${provenance.modelVersion || ''}`], ['실행 엔진', `${provenance.backend || '미제공'} · ${provenance.engineVersion || ''}`], ['입력 자료', `${provenance.datasetId || '미제공'} · ${provenance.datasetVersion || ''}`], ['자료 종류', EVIDENCE[provenance.evidenceKind] || provenance.evidenceKind], ['관측 검증', '미수행'], ['계산 실측 시간', Number.isFinite(provenance.wallSeconds) ? `${provenance.wallSeconds.toFixed(3)}초` : '미제공'], ['공간·시간 보간', '쌍선형·선형 / 외삽 금지'], ['입력 해시', provenance.datasetSha256], ['설정 해시', provenance.specSha256], ['결과 배열 해시', provenance.resultArraySha256]]);
  $('provenance-json').textContent = JSON.stringify(runs.map(run => ({ runId: ID(run), spec: run.spec, summary: run.result.summary, validation: run.result.validation, provenance: run.result.provenance })), null, 2);
  $('validation-status').textContent = '관측 검증 없음. 합성 수치시험·내부 결과 검사와 실제 해양 정확도 검증은 별도입니다. 모델·자료 적격성과 제한은 계보 원문에서 확인하세요.';
  $('comparison-metrics').replaceChildren(); resultTable(layer.results); showPage('results');
}

$('navigation').addEventListener('click', event => { const button = event.target.closest('[data-page]'); if (button) showPage(button.dataset.page); });
$('refresh').addEventListener('click', () => act(() => refresh(), $('refresh')));
$('project-form').addEventListener('submit', event => { event.preventDefault(); act(async () => {
  const project = unwrap(await api.createProject({ name: $('project-name').value.trim(), question: $('project-question-input').value.trim() }), 'project');
  state.projectId = ID(project); saveSelection(); await refresh({ silent: true }); message('프로젝트를 저장했습니다. 실험에 사용할 자료를 선택하세요.'); showPage('datasets');
}, event.submitter); });
$('dataset-file').addEventListener('change', () => act(async () => { const file = $('dataset-file').files?.[0]; if (!file) return; if (file.size > 16 * 1024 * 1024) throw new Error('16 MiB 이하 JSON 파일을 선택하세요.'); $('dataset-json').value = await file.text(); $('dataset-validation').hidden = true; }));
function readDatasetJSON() { const text = $('dataset-json').value; if (new Blob([text]).size > 16 * 1024 * 1024) throw new Error('자료 JSON은 16 MiB 이하여야 합니다.'); try { return JSON.parse(text); } catch { throw new Error('자료 JSON의 문법을 확인하세요.'); } }
$('validate-dataset').addEventListener('click', () => act(async () => { const result = await api.validateDataset(readDatasetJSON()); $('dataset-validation').textContent = JSON.stringify(result, null, 2); $('dataset-validation').hidden = false; message('서버 적격성 검사 결과를 확인하세요.'); }, $('validate-dataset')));
$('dataset-form').addEventListener('submit', event => { event.preventDefault(); act(async () => { const result = unwrap(await api.registerDataset(readDatasetJSON()), 'dataset'); state.datasetId = ID(result); await refresh({ silent: true }); if (state.datasetId) await selectDataset(state.datasets.find(d => ID(d) === state.datasetId) || result); message('자료를 등록했습니다. 실행 가능 여부는 실험 조건을 포함한 사전 검사에서 확인합니다.'); }, event.submitter); });
$('use-dataset').addEventListener('click', () => act(async () => { fillDatasetDefaults(await datasetDocument(state.datasetId)); showPage('experiments'); }, $('use-dataset')));
$('experiment-dataset').addEventListener('change', () => act(async () => { state.datasetId = $('experiment-dataset').value; if (state.datasetId) fillDatasetDefaults(await datasetDocument(state.datasetId)); saveSelection(); }));
$('experiment-project').addEventListener('change', () => { state.projectId = $('experiment-project').value; state.experimentId = ''; clearPreflight(); saveSelection(); render(); });
$('release-type').addEventListener('change', () => { $('release-width-label').hidden = $('release-type').value !== 'line'; });
$('experiment-form').addEventListener('submit', event => { event.preventDefault(); act(async () => {
  const spec = await buildSpec(); const experiment = unwrap(await api.createExperiment({ projectId: spec.projectId, name: $('experiment-name').value.trim(), datasetId: $('experiment-dataset').value, spec }), 'experiment');
  state.experimentId = ID(experiment); state.projectId = spec.projectId; clearPreflight(); saveSelection(); await refresh({ silent: true }); $('preflight-summary').textContent = `${experiment.name || '실험'}을 저장했습니다. 사전 검사 후 실행할 수 있습니다.`; message('실험 명세를 새 항목으로 저장했습니다. 사전 검사를 진행하세요.');
}, event.submitter); });
$('preflight').addEventListener('click', () => act(async () => { const result = unwrap(await api.preflight(state.experimentId), 'preflight'); state.preflight = result; $('preflight-json').textContent = JSON.stringify(result, null, 2); $('preflight-json').hidden = false; $('preflight-summary').textContent = result.ok === true ? '사전 검사를 통과했습니다. 저장된 명세로 실행할 수 있습니다.' : '실행할 수 없습니다. 아래 오류와 자료·모델 조건을 확인하세요.'; updateActions(); }, $('preflight')));
$('submit-run').addEventListener('click', () => act(async () => {
  const experimentId = state.experimentId; if (!state.submissionKeys.has(experimentId)) state.submissionKeys.set(experimentId, crypto.randomUUID());
  const run = unwrap(await api.submit(experimentId, state.submissionKeys.get(experimentId)), 'run'); state.runId = ID(run); clearPreflight(); saveSelection(); upsertRun(run); renderRun(run); showPage('runs'); message('실행을 제출했습니다. 진행과 실패 상태를 서버에서 확인합니다.');
}, $('submit-run')));
$('cancel-run').addEventListener('click', () => act(async () => { const run = unwrap(await api.cancel(state.runId), 'run'); upsertRun(run); renderRun(run); message(run.status === 'CANCELLED' ? '실행이 취소되었습니다.' : '취소를 요청했습니다. 서버의 최종 상태를 기다립니다.'); }, $('cancel-run')));
$('view-results').addEventListener('click', () => act(async () => { $('result-run').value = state.runId; $('comparison-run').value = ''; await loadResults(); }));
$('load-result').addEventListener('click', () => act(loadResults, $('load-result')));
$('compare').addEventListener('click', () => act(async () => {
  if (!$('comparison-run').value) throw new Error('비교 실행을 선택하세요.');
  await loadResults(); const comparison = unwrap(await api.compare(state.results.map(ID)), 'comparison');
  const container = $('comparison-metrics'); container.append(element('h3', '두 실행의 비교'));
  container.append(element('p', comparison.note || '서버가 계산한 비교 결과입니다.', 'notice compact'));
  if (comparison.mode === 'PAIRED') {
    const distances = (comparison.differences || []).map(p => p.distanceMeters).filter(Number.isFinite), summary = element('div');
    const mean = distances.length ? distances.reduce((a, b) => a + b, 0) / distances.length : null;
    details(summary, [['비교 방식', '동일 방출 조건의 같은 입자·UTC 짝비교'], ['유효 입자·시각 쌍', `${distances.length}개`], ['평균 분리 거리', mean === null ? '비교 표본 없음' : `${mean.toFixed(3)} m`], ['집계 기준', '공통 저장 시각의 유효 쌍 전체. 특정 예측 시간의 오차가 아닙니다.']]); container.append(summary);
  } else container.append(element('p', '방출 조건이 다르므로 개별 입자끼리 차이를 계산하지 않습니다. 위의 상태 수·평균 변위·최대 변위를 집단별로 확인하세요.', 'muted'));
  const disclosure = element('details'), pre = element('pre', JSON.stringify(comparison, null, 2), 'json-output'); disclosure.append(element('summary', '비교 원문과 입자별 값'), pre); container.append(disclosure);
}, $('compare')));
$('result-time').addEventListener('input', () => { stopPlayback(); setTimeline(Number($('result-time').value)); });
$('play').addEventListener('click', () => { if (playbackTimer) { stopPlayback(); return; } if (Number($('result-time').value) >= Number($('result-time').max)) setTimeline(0); $('play').textContent = '정지'; $('play').setAttribute('aria-label', '시간 재생 정지'); playbackTimer = setInterval(() => { const next = Number($('result-time').value) + 1; if (next > Number($('result-time').max)) stopPlayback(); else setTimeline(next); }, 350); });
for (const mode of ['2d', '3d']) $(`view-${mode}`).addEventListener('click', () => act(async () => { await layer.setMode(mode); $('view-2d').setAttribute('aria-pressed', mode === '2d'); $('view-3d').setAttribute('aria-pressed', mode === '3d'); }));
for (const [id, mode] of [['fit-trajectory', 'trajectory'], ['fit-input', 'input']]) $(id).addEventListener('click', () => { layer.setExtent(mode); $('fit-trajectory').setAttribute('aria-pressed', mode === 'trajectory'); $('fit-input').setAttribute('aria-pressed', mode === 'input'); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopPlayback(); clearTimeout(pollTimer); } else { schedulePoll(); if (state.page === 'results') layer.render(); } });
window.addEventListener('pagehide', () => { stopPlayback(); clearTimeout(pollTimer); layer.dispose(); });
online(false); showPage(location.hash.slice(1) || 'projects'); await refresh();
if (state.datasetId && state.datasets.some(d => ID(d) === state.datasetId)) await act(async () => { await selectDataset(state.datasets.find(d => ID(d) === state.datasetId), !$('start-time').value); });
