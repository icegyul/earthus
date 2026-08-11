import { auth } from './auth.js';
import { REPORT_KINDS, kindInfo, loadLabReports, reportTime, statusLabel } from './lab-reports.js';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const params = new URLSearchParams(location.search);
let selectedKind = params.get('kind') || 'all';
let selectedId = params.get('report') || (params.get('storm') ? `cyclone:${params.get('storm')}` : null);
let data = { reports: [], failures: [] };

function allowed() { return auth.isPaid() || auth.isAdmin(); }
function formatTime(value) {
  if (!value) return '자료 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return esc(value);
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
function updateUrl() {
  const next = new URL(location.href);
  if (selectedKind === 'all') next.searchParams.delete('kind'); else next.searchParams.set('kind', selectedKind);
  if (selectedId) next.searchParams.set('report', selectedId); else next.searchParams.delete('report');
  next.searchParams.delete('storm');
  history.replaceState(null, '', next);
}

function renderFilters() {
  const filters = [{ id: 'all', ko: '전체' }, ...REPORT_KINDS];
  $('#filters').innerHTML = filters.map(kind => `<button data-kind="${esc(kind.id)}" class="${selectedKind === kind.id ? 'on' : ''}">${esc(kind.ko)}</button>`).join('');
  $('#filters').querySelectorAll('[data-kind]').forEach(button => {
    button.onclick = () => { selectedKind = button.dataset.kind; selectedId = null; updateUrl(); render(); };
  });
}

function renderGate() {
  const gate = $('#gate');
  if (!auth.user) {
    gate.className = 'notice';
    gate.innerHTML = '보고서 제목·상태와 방법론은 볼 수 있습니다. 저장 계산 회차와 종료 검증 결과를 보려면 <a href="./">EARTHUS에서 로그인</a>해 주세요.';
  } else if (!allowed()) {
    gate.className = 'notice';
    gate.textContent = '현재 일반회원입니다. 공식 발표와 현재 안전 정보는 EARTHUS에서 계속 무료로 볼 수 있습니다.';
  } else {
    gate.className = 'notice ok';
    gate.textContent = '구독·관리자 권한이 확인됐습니다. 생성된 보고서의 종료 검증 결과를 볼 수 있습니다.';
  }
}

function renderDetail(report) {
  if (!report) {
    $('#detail').innerHTML = '<p class="empty">보고서를 선택하면 자료 시각과 검증 상태를 확인할 수 있습니다.</p>';
    return;
  }
  const kind = kindInfo(report.kind);
  const common = `<span class="kind">${esc(kind.ko)}</span><h2>${esc(report.title)}</h2>`
    + `<p class="empty">${esc(statusLabel(report.status, true))} · ${esc(report.summary || '요약 없음')}</p>`
    + `<div class="meta"><div><small>최초 탐지</small><b>${esc(formatTime(report.detectedAt))}</b></div>`
    + `<div><small>마지막 자료</small><b>${esc(formatTime(reportTime(report)))}</b></div>`
    + `<div><small>저장 계산 회차</small><b>${report.snapshotCount == null ? '자료 없음' : `${report.snapshotCount}개`}</b></div>`
    + `<div><small>검증 상태</small><b>${esc(statusLabel(report.status, true))}</b></div></div>`;
  if (!allowed()) {
    $('#detail').innerHTML = common + '<div class="lock">저장된 계산 회차와 기관별 종료 오차는 구독·관리자에게 제공됩니다. 출처·방법·현재 안전 정보는 숨기지 않습니다.</div>';
    return;
  }
  let verification = '<p class="empty">최종 관측 자료가 아직 확인되지 않아 오차를 확정하지 않습니다.</p>';
  if (report.status === 'FINAL_REPORT' && report.scores.length) {
    verification = `<table class="score"><thead><tr><th>자료</th><th>검증점 n</th><th>평균 위치오차</th></tr></thead><tbody>${report.scores.map(score =>
      `<tr><td>${esc(score.agency)}</td><td>${esc(score.n)}</td><td>${esc(score.meanErrorKm)}km</td></tr>`).join('')}</tbody></table>`;
  }
  $('#detail').innerHTML = common + '<h3>종료 검증</h3>' + verification
    + '<p class="empty">한 사건의 결과로 기관의 장기 우열을 일반화하지 않습니다. FINAL만 확인된 최종 관측과의 대조입니다.</p>';
}

function render() {
  renderFilters(); renderGate();
  const reports = data.reports.filter(report => selectedKind === 'all' || report.kind === selectedKind);
  $('#count').textContent = `${reports.length}건`;
  $('#list').innerHTML = reports.length ? reports.map(report => {
    const kind = kindInfo(report.kind);
    return `<button class="report ${selectedId === report.id ? 'on' : ''}" data-id="${esc(report.id)}"><b>${esc(report.title)}</b>`
      + `<span class="state">${esc(statusLabel(report.status, true))}</span><small><span class="kind">${esc(kind.ko)}</span> · ${esc(formatTime(reportTime(report)))}</small></button>`;
  }).join('') : '<p class="empty">이 종류에서 실제 자료로 생성된 보고서가 없습니다. 예시를 지어내지 않습니다.</p>';
  $('#list').querySelectorAll('[data-id]').forEach(button => {
    button.onclick = () => { selectedId = button.dataset.id; updateUrl(); render(); };
  });
  let report = data.reports.find(item => item.id === selectedId);
  if (!report && reports.length && selectedId) selectedId = null;
  renderDetail(report || null);
}

await auth.init();
data = await loadLabReports();
auth.onChange(render);
render();
