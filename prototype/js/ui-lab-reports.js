// LAB 안의 보고서 입구. 상세와 권한 판정은 lab-reports.html이 담당한다.

import { REPORT_KINDS, kindInfo, loadLabReports, reportTime, statusLabel } from './lab-reports.js';

const el = (tag, className, html) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html != null) node.innerHTML = html;
  return node;
};
const esc = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const time = (value, ko) => {
  if (!value) return ko ? '시각 없음' : 'Time unavailable';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return esc(value);
  return new Intl.DateTimeFormat(ko ? 'ko-KR' : 'en', {
    timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
};

export const labReportsPanel = {
  data: null,
  loading: null,

  async load() {
    if (this.data) return this.data;
    if (!this.loading) this.loading = loadLabReports().then(data => (this.data = data));
    return this.loading;
  },

  render(body, ko) {
    if (!this.data) {
      body.appendChild(el('p', 'comm-load', ko ? '보고서 목록을 불러오는 중…' : 'Loading reports…'));
      return;
    }
    const { reports, failures } = this.data;
    body.appendChild(el('p', 'lab-report-lead', ko
      ? '<b>계산이 끝난 뒤에도 사라지지 않는 기록</b>입니다. 당시 입력·계산 회차·결측을 보존하고, 최종 관측이 확인된 경우에만 오차를 확정합니다.'
      : '<b>Records that remain after an event ends.</b> Inputs, runs and missing data are preserved; errors are final only after verified observations arrive.'));

    const counts = new Map(REPORT_KINDS.map(kind => [kind.id, 0]));
    reports.forEach(report => counts.set(report.kind, (counts.get(report.kind) || 0) + 1));
    const kinds = el('div', 'lab-report-kinds');
    REPORT_KINDS.forEach(kind => {
      kinds.appendChild(el('div', 'lab-report-kind',
        `<span>${esc(ko ? kind.ko : kind.en)}</span><b>${counts.get(kind.id) || 0}</b>`));
    });
    body.appendChild(kinds);

    const latest = el('div', 'lab-report-list');
    if (!reports.length) {
      latest.appendChild(el('p', 'sky-note', ko
        ? '아직 실제 자료로 생성된 보고서가 없습니다. 예시 보고서를 지어내지 않습니다.'
        : 'No report has been generated from real data yet. We do not invent samples.'));
    } else {
      reports.slice(0, 6).forEach(report => {
        const kind = kindInfo(report.kind);
        const link = el('a', 'lab-report-row');
        link.href = `./lab-reports.html?kind=${encodeURIComponent(report.kind)}&report=${encodeURIComponent(report.id)}`;
        link.target = '_blank'; link.rel = 'noopener';
        link.innerHTML = `<span><small>${esc(ko ? kind.ko : kind.en)} · ${esc(statusLabel(report.status, ko))}</small>`
          + `<b>${esc(report.title)}</b><em>${esc(time(reportTime(report), ko))}</em></span><i aria-hidden="true">↗</i>`;
        latest.appendChild(link);
      });
    }
    body.appendChild(latest);

    const all = el('a', 'lab-report-all', ko ? '전체 분석 보고서 보기 ↗' : 'Open all analysis reports ↗');
    all.href = './lab-reports.html'; all.target = '_blank'; all.rel = 'noopener';
    body.appendChild(all);

    body.appendChild(el('p', 'lab-report-rule', ko
      ? '현재 관측·기관 발표·출처·계산 방법은 무료입니다. 개인화 계산, 저장된 회차와 종료 검증 보고서는 구독·관리자 기능입니다. 안전 정보는 보고서와 관계없이 계속 무료입니다.'
      : 'Current observations, agency releases, sources and methods remain free. Personal calculations, archived runs and post-event verification are subscriber/admin features. Safety information stays free.'));
    if (failures.length) body.appendChild(el('p', 'lab-report-fail', ko
      ? `일부 목록을 받지 못했습니다 (${failures.map(item => item.source).join(' · ')}). 없는 보고서를 0건으로 확정하지 않습니다.`
      : `Some catalogues could not be loaded (${failures.map(item => item.source).join(' · ')}). Missing catalogues are not counted as zero.`));
  },
};
