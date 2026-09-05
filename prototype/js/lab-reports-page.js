import { auth } from './auth.js';
import { REPORT_KINDS, kindInfo, loadLabReports, reportTime, statusLabel } from './lab-reports.js';
import { renderCycloneDetail, renderEventDetail } from './lab-report-detail.js';

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
  /* 본문은 현상별 계산기가 만든 detail 을 그린다 (lab-report-detail.js). 태풍은 위치·기관 진로·
     강도 분류·상륙 문구·잠정 검증, 그 밖의 현상은 사건 이력·근거·검증. 권한은 검증 표에만 건다. */
  const body = report.kind === 'cyclone' ? renderCycloneDetail(report, allowed()) : renderEventDetail(report, allowed());
  $('#detail').innerHTML = common + body;
}

/* 폰에서는 목록이 길어 상세가 화면 두 장 아래에 있었다("눌러도 위나 아래로 보고서가 안 나와").
   좁은 화면이면 상세를 누른 카드 바로 아래로 옮기고 보이게 스크롤한다. 넓은 화면은 옆 칸 그대로. */
function placeDetail(button) {
  const detail = $('#detail');
  const narrow = window.matchMedia('(max-width: 760px)').matches;
  if (narrow && button) {
    button.insertAdjacentElement('afterend', detail);
    detail.classList.add('inline');
    requestAnimationFrame(() => detail.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  } else if (!narrow && detail.classList.contains('inline')) {
    $('.layout').appendChild(detail);
    detail.classList.remove('inline');
  }
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
  placeDetail(report ? $('#list').querySelector(`[data-id="${CSS.escape(report.id)}"]`) : null);
}

await auth.init();
data = await loadLabReports();
auth.onChange(render);
render();
