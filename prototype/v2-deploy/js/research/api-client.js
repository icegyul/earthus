// Separate research transport: does not change Earth/AETHERUS navigation or data APIs.
const BASE = '/api/research';
export class ResearchApiError extends Error {
  constructor(message, status, details) { super(message); this.name = 'ResearchApiError'; this.status = status; this.details = details; }
}
export async function request(path, { method = 'GET', body, idempotencyKey, signal } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  let response;
  try { response = await fetch(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal, credentials: 'same-origin', cache: 'no-store' }); }
  catch (error) { if (error.name === 'AbortError') throw error; throw new ResearchApiError('계산 서비스에 연결할 수 없습니다. 로컬 research-runtime 서버를 실행하고 같은 주소에서 이 페이지를 열어 주세요.', 0); }
  let data;
  try { data = await response.json(); }
  catch { throw new ResearchApiError('연구 API가 JSON을 반환하지 않았습니다. 현재 주소에 research-runtime이 연결되어 있는지 확인하세요.', response.status); }
  if (!response.ok) {
    const message = data.message || data.error?.message || (typeof data.error === 'string' ? data.error : '') || `요청 실패 (${response.status})`;
    throw new ResearchApiError(message, response.status, data);
  }
  return data;
}
export const api = {
  datasets: () => request('/datasets'),
  dataset: id => request(`/datasets/${encodeURIComponent(id)}`),
  validateDataset: dataset => request('/datasets/validate', { method: 'POST', body: dataset }),
  registerDataset: dataset => request('/datasets', { method: 'POST', body: dataset }),
  projects: () => request('/projects'),
  createProject: data => request('/projects', { method: 'POST', body: data }),
  experiments: () => request('/experiments'),
  createExperiment: data => request('/experiments', { method: 'POST', body: data }),
  preflight: id => request(`/experiments/${encodeURIComponent(id)}/preflight`, { method: 'POST', body: {} }),
  runs: () => request('/runs'),
  run: id => request(`/runs/${encodeURIComponent(id)}`),
  submit: (experimentId, key) => request('/runs', { method: 'POST', body: { experimentId }, idempotencyKey: key }),
  cancel: id => request(`/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST', body: {} }),
  compare: runIds => request('/comparisons', { method: 'POST', body: { runIds } }),
  exportURL: id => `${BASE}/runs/${encodeURIComponent(id)}/export`,
};
