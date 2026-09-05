// LAB 분석 보고서 공통 계약과 읽기 어댑터.
//
// 태풍은 이 계약보다 먼저 만들어져 ocean/cyclone-reports.json을 쓴다. 이 파일에서
// 태풍을 공통 형식으로 바꾸고, 이후 현상은 analysis/lab-reports.json에 같은 형식으로
// 발행한다. 화면마다 현상별 예외를 붙이지 않는 것이 목적이다.
//
// ⚠️ 보고서가 아직 없는 현상을 예시 데이터로 채우지 않는다. 0건은 0건이라고 보여준다.
// ⚠️ 이 목록은 발견 가능성을 위한 요약이다. 유료 원행·계산 회차를 공개 JSON에 넣지 않는다.

import { API } from './config.js';

export const REPORT_KINDS = Object.freeze([
  { id: 'cyclone', ko: '태풍', en: 'Cyclone' },
  { id: 'earthquake', ko: '지진', en: 'Earthquake' },
  { id: 'smoke-ash', ko: '산불 연기·화산재', en: 'Smoke & volcanic ash' },
  { id: 'air-pollution', ko: '황사·미세먼지', en: 'Dust & air pollution' },
  { id: 'ocean-drift', ko: '해류 표류', en: 'Ocean drift' },
  { id: 'bird-migration', ko: '철새 이동', en: 'Bird migration' },
  { id: 'marine-bloom', ko: '해파리·적조', en: 'Jellyfish & algal bloom' },
  { id: 'aurora', ko: '오로라 관측', en: 'Aurora visibility' },
  { id: 'space-reentry', ko: '위성·우주잔해 재진입', en: 'Satellite & debris re-entry' },
]);

const STATUS = Object.freeze({
  DETECTED: { ko: '최초 탐지', en: 'Detected' },
  ACTIVE: { ko: '계산 중', en: 'Active' },
  VERIFYING: { ko: '종료 확인 중', en: 'Verifying end' },
  PRELIMINARY_REPORT: { ko: '잠정 보고서', en: 'Preliminary report' },
  FINAL_REPORT: { ko: '최종 보고서', en: 'Final report' },
});

const clean = value => value == null ? null : String(value).trim() || null;

export function kindInfo(kind) {
  return REPORT_KINDS.find(item => item.id === kind) || { id: kind || 'unknown', ko: '기타', en: 'Other' };
}

export function statusLabel(status, ko = true) {
  const value = STATUS[status];
  return value ? value[ko ? 'ko' : 'en'] : (clean(status) || (ko ? '상태 없음' : 'No status'));
}

export function reportTime(report) {
  return report.endedAt || report.lastSeen || report.issuedAt || report.detectedAt || null;
}

function normalizeReport(report) {
  const kind = clean(report.kind || report.phenomenon) || 'unknown';
  return {
    id: clean(report.id),
    kind,
    title: clean(report.title || report.name || report.id),
    status: clean(report.status) || 'DETECTED',
    access: clean(report.access) || 'pro',
    detectedAt: clean(report.detectedAt),
    issuedAt: clean(report.issuedAt),
    lastSeen: clean(report.lastSeen),
    endedAt: clean(report.endedAt),
    snapshotCount: Number.isFinite(Number(report.snapshotCount)) ? Number(report.snapshotCount) : null,
    sourceCount: Number.isFinite(Number(report.sourceCount)) ? Number(report.sourceCount) : null,
    sampleCount: Number.isFinite(Number(report.sampleCount)) ? Number(report.sampleCount) : null,
    confidence: clean(report.confidence),
    summary: clean(report.summary || report.note),
    method: report.method && typeof report.method === 'object' ? report.method : null,
    scores: Array.isArray(report.scores) ? report.scores : [],
    // 카드를 열면 보여줄 본문(현상별 계산기의 public detail). 없으면 null — 예시로 채우지 않는다.
    detail: report.detail && typeof report.detail === 'object' ? report.detail : null,
    sourcePath: clean(report.sourcePath),
  };
}

function normalizeCyclone(report) {
  return normalizeReport({
    ...report,
    id: `cyclone:${report.id}`,
    kind: 'cyclone',
    title: report.name || report.id,
    access: 'pro',
    sourceCount: (report.scores || []).length || null,
    summary: report.status === 'FINAL_REPORT'
      ? 'IBTrACS 최종 경로와 당시 기관·EARTHUS 계산 회차를 같은 유효시각으로 대조한 결과입니다.'
      : '활동 중 계산 회차를 보존하고 있으며, 최종 관측 경로가 확인되기 전에는 오차를 확정하지 않습니다.',
    sourcePath: 'ocean/cyclone-reports.json',
  });
}

async function getJson(url) {
  const response = await fetch(url, { cache: 'no-cache' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  return response.json();
}

export async function loadLabReports() {
  const sources = [
    { id: 'common', url: `${API.ANALYSIS}/lab-reports.json` },
    { id: 'cyclone', url: `${API.OCEAN}/cyclone-reports.json` },
  ];
  const settled = await Promise.allSettled(sources.map(source => getJson(source.url)));
  const reports = [];
  const failures = [];
  let generatedAt = null;

  settled.forEach((result, index) => {
    const source = sources[index];
    if (result.status === 'rejected') {
      failures.push({ source: source.id, message: result.reason?.message || String(result.reason) });
      return;
    }
    const data = result.value;
    if (!data) return;
    generatedAt = data.generatedAt || data.generated || generatedAt;
    if (source.id === 'cyclone') reports.push(...(data.reports || []).map(normalizeCyclone));
    else reports.push(...(data.reports || []).map(normalizeReport));
  });

  const seen = new Set();
  const valid = reports.filter(report => {
    if (!report.id || !report.title || seen.has(report.id)) return false;
    seen.add(report.id);
    return true;
  });
  valid.sort((a, b) => String(reportTime(b) || '').localeCompare(String(reportTime(a) || '')));
  return { schemaVersion: 1, generatedAt, reports: valid, failures };
}
