// 정보 접근성 보고서(docs/information-access-20260905)의 부속 파일 3종을 만든다.
//   menu-inventory.json  구조화 목록 (v2는 ui-shell.js SCENES에서, v1·AETHERUS는 dom-snapshot.json에서)
//   menu-review.md       서비스별 표
//   review.html          필터·검색 가능한 단일 HTML
// 자료 값이나 상태를 생성하지 않는다 — 메뉴 명세와 DOM 스냅샷을 옮겨 적을 뿐이다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'docs', 'information-access-20260905');
const snap = JSON.parse(fs.readFileSync(path.join(outDir, 'dom-snapshot.json'), 'utf8'));
const { SCENES } = await import('../prototype/v2-three/js/ui-shell.js');
const { MENU_QUESTIONS } = await import('../prototype/v2-three/js/menu-guide.js');
const { menuCoverage, menuTime } = await import('../prototype/v2-three/js/information-contract.js');

// 자료 종류 배지 → 사용자 언어. 보고서 4절의 "관측·공식 예보·모델·과거 기록·시뮬레이션" 구분을 따른다.
const KIND = {
  LIVE: '실시간 수집', OBSERVED: '관측', MODEL: '모델', MODEL_SIGNAL: '모델', DERIVED: '파생(계산)',
  OFFICIAL_FORECAST: '공식 예보', OFFICIAL_WARNING: '공식 발표', OFFICIAL_INFORMATION: '공식 정보',
  OFFICIAL_OBSERVATION: '공식 자료', HISTORY: '과거 기록', SIMULATION_ONLY: '시뮬레이션', LOCKED: '준비 중·잠김',
};

// 보고서 3절 F01~F16을 개별 메뉴 id에 붙인다. 여기 없는 행은 우선순위 없음(—).
const FINDINGS = {
  v2: {
    marine: ['F03', 'P0', '해상 모델 조회로 명칭·배지·설명 통일, 부이 관측과 나란히 비교'],
    wavefield: ['F03', 'P0', 'Open-Meteo Marine은 모델 — 실측으로 읽히지 않게 배지 유지'],
    tsunami: ['F04', 'P0', '발표·유효·해제·수집 시각 분리, 유효 경보와 과거 발표 분리'],
    bf: ['F09', 'P1', '무장애 여행지 실제 목록을 첫 결과로, 시군구 점수는 보조'],
    wl: ['F09', 'P1', '웰니스 관광지 실제 목록을 첫 결과로'],
    en: ['F09', 'P1', '영문 관광정보 실제 목록을 첫 결과로'],
    khoasl126: ['F10', 'P1', '시나리오 비교 시 공통 cm 눈금'], khoasl245: ['F10', 'P1', '시나리오 비교 시 공통 cm 눈금'],
    khoasl370: ['F10', 'P1', '시나리오 비교 시 공통 cm 눈금'], khoasl585: ['F10', 'P1', '시나리오 비교 시 공통 cm 눈금'],
    khoaflood: ['F12', 'P1', '침수 예상도는 공식 자료이되 관측이 아님 — 자료 종류 배지 분리'],
    sculpt: ['F12', 'P1', 'WorldPop은 추정 — OBSERVED가 아니라 모델/추정 배지'],
    oceanfocus: ['F13', 'P1', '장소를 옮기면 이전 포커스 설명 정리, 현재 주제·장소·켜진 자료 고정 표시'],
    'cloud-gfs': ['F14', 'P1', '재생 시간이 적용되는 레이어임을 배지로, 다른 관측은 "현재 고정" 표시'],
    tyoff: ['F14', 'P1', '재생 시간 적용 대상 배지'],
    'cloud-vol': ['F11', 'P1', '복셀·런타임 설명은 진단으로 접고 첫 결과엔 값·시각·출처만'],
    'cloud-obs': ['F15', 'P1', '전지구 명칭이어도 실제 자료 시각 표시'],
    radar: ['F15', 'P1', '한국 한정 — 범위 밖이면 지원 지역 이동 버튼'],
    news: ['F07', 'P1', '뉴스와 사건 분리, 재시도·마지막 성공 제공'],
    launch: ['F08', 'P1', '발사 자료 공통 캐시·마지막 성공 시각(launch-schedule.js)'],
  },
  v1: {
    news: ['F07', 'P1', '뉴스 메뉴 제목·데이터 소스 일치, 이벤트 실패해도 뉴스 유지'],
    인공위성: ['F08', 'P1', 'Launch Library 호출 한도 → 공통 캐시·백오프·마지막 성공 시각'],
    gk2aIR: ['F15', 'P2', '위성 이름 반복 대신 범위/영상/자료 시각으로 정리(5절 v1 제안)'],
    gk2aVIS: ['F15', 'P2', '낮에만 — 밤에 누르면 빈 화면이 아니라 조건 안내'], gk2aVISfd: ['F15', 'P2', '낮에만 조건 사전 표시'],
    gk2aVISea: ['F15', 'P2', '낮에만 조건 사전 표시'], gk2aNightLow: ['F15', 'P2', '밤에만 조건 사전 표시'],
    synop: ['F15', 'P2', 'blocked 상태의 이유를 사용자 언어로'],
  },
  aetherus: {
    SATELLITE_PASS: ['F01', 'P0', '주제 필터가 저장 배치의 숨김보다 우선 — 수정됨'],
    COUNTDOWN: ['F02', 'P0', 'To Be Confirmed → 일정 미확정, READY 제거 — 수정됨'],
    LIVE: ['F02', 'P0', '중계 대기·중계 중·자료 미수신 구분 — 수정됨'],
    MISSION_TIMELINE: ['F02', 'P0', '일정만 확인 표기 — 수정됨'],
    EARTH_WEATHER: ['F16', 'P2', 'EARTHUS 장소별 날씨로 가는 실제 경로 안내 — 수정됨'],
    TONIGHT: ['F16', 'P2', '태양계·관측 사진 실제 버튼 — 수정됨'],
    JWST: ['F06', 'P1', '장식 궤도 도식 제거 — 수정됨. 사진 카드 유지'],
    UPCOMING_LAUNCHES: ['F08', 'P1', 'v1과 같은 캐시(launch-schedule.js) 공유 — 수정됨'],
  },
};

// 이번 세션(2026-09-05 로컬 미리보기)에서 실제로 눌러 응답을 본 항목. 나머지는 목록·소스.
const UI_CHECKED = new Set([
  'aetherus:filter:all', 'aetherus:filter:satellites', 'aetherus:filter:astronomy',
  'aetherus:widget:SATELLITE_PASS', 'aetherus:widget:TONIGHT', 'aetherus:widget:JWST', 'aetherus:widget:COUNTDOWN',
  'aetherus:widget:LIVE', 'aetherus:widget:MISSION_TIMELINE', 'aetherus:widget:UPCOMING_LAUNCHES',
  'v2:tool:brand-tab-e', 'v2:tool:menu-search', 'v2:tool:active-only', 'v2:scene:land', 'v1:top:앱 전환 · EARTHUS(v1)',
]);

const rows = [];
let no = 0;
const push = (r) => { rows.push({ no: ++no, ...r }); };
const check = (key) => (UI_CHECKED.has(key) ? 'UI' : '목록·소스');
const finding = (svc, id) => {
  const f = FINDINGS[svc]?.[id];
  return f ? { finding: f[0], priority: f[1], proposal: f[2] } : { finding: '', priority: '—', proposal: '' };
};

// ---- v2 (소스에서) ----
push({ service: 'v2', group: '상단 도구', id: 'brand-tab-e', label: 'EARTHUS 탭 (주제 메뉴 열기)', question: '', source: '', kind: '', coverage: '', time: '', check: check('v2:tool:brand-tab-e'), ...finding('v2', 'brand-tab-e') });
push({ service: 'v2', group: '상단 도구', id: 'brand-tab-a', label: 'AETHERUS 탭 (우주 메뉴 열기)', question: '', source: '', kind: '', coverage: '', time: '', check: '목록·소스', ...finding('v2', 'brand-tab-a') });
for (const [id, label, q] of [
  ['btn-search', '검색', '나라·시군구·도시·공항'], ['btn-ask', '지구에 묻기', '지금 켜 놓은 자료만 근거로 답합니다'], ['btn-share', '이 화면 공유', '링크 복사 · 그림 저장'],
  ['btn-help', '사용법 다시 보기', ''], ['btn-settings', '설정', ''], ['btn-login', '로그인 / 계정', 'EARTHUS 계정 화면'], ['map-3d', '3D 지형', '지역 지형 모드'], ['map-exit', '3D 지구로', '지형 모드 종료'],
  ['hud-more', '진단 정보', '상태를 텍스트로 복사'], ['ts-now', '지금', '시간 막대 현재로'], ['ts-play', '5일 예보 재생', '예보 시간축 연결 레이어에만 적용'], ['intel-tab', 'EARTH INTELLIGENCE', '결과 패널 열기'],
]) push({ service: 'v2', group: '상단 도구', id, label, question: q, source: '', kind: '', coverage: '', time: '', check: '목록·소스', ...finding('v2', id) });
push({ service: 'v2', group: '메뉴 도구', id: 'menu-search', label: '메뉴·질문 검색', question: '메뉴 이름·질문·출처·지원 범위로 찾기', source: '', kind: '', coverage: '', time: '', check: check('v2:tool:menu-search'), finding: 'F15', priority: 'P1', proposal: '5절 v2 제안 — 구현됨' });
push({ service: 'v2', group: '메뉴 도구', id: 'active-only', label: '켜진 자료만', question: '', source: '', kind: '', coverage: '', time: '', check: check('v2:tool:active-only'), finding: 'F13', priority: 'P1', proposal: '5절 v2 제안 — 구현됨' });
for (const r of ['한반도', '전 지구', '동북아시아', '동남아시아', '남아시아', '오세아니아', '유럽', '중동', '아프리카', '북미', '남미', '북극', '남극'])
  push({ service: 'v2', group: '권역 이동', id: `region:${r}`, label: r, question: '3D 지구를 유지한 채 그 구도로 날아갑니다', source: '', kind: '', coverage: r, time: '', check: '목록·소스', finding: '', priority: '—', proposal: '' });
for (const [id, label] of [['events', '사건'], ['places', '내 장소'], ['selected', '선택 자료'], ['why', '자료의 근거'], ['next', '예보·예정'], ['whatif', '가정 실험']])
  push({ service: 'v2', group: '결과 패널 탭', id: `panel:${id}`, label, question: '', source: '', kind: '', coverage: '', time: '', check: '목록·소스', finding: id === 'why' || id === 'next' || id === 'whatif' ? 'F11' : '', priority: id === 'why' || id === 'next' || id === 'whatif' ? 'P1' : '—', proposal: id === 'why' || id === 'next' || id === 'whatif' ? 'NOW/WHY/NEXT/WHAT IF 풀어쓰기 — 구현됨' : '' });
for (const s of SCENES) {
  for (const l of s.layers) {
    push({
      service: 'v2', group: `${s.label} 메뉴`, id: l.id, label: l.name, question: MENU_QUESTIONS[l.id] || '',
      source: l.src || '', kind: KIND[l.state] || l.state || '', coverage: menuCoverage(l.id), time: menuTime(l.id),
      check: check(`v2:scene:${s.id}`), ...finding('v2', l.id),
    });
  }
}

// ---- v1 (DOM 스냅샷) ----
for (const [label, q] of snap.v1.top) push({ service: 'v1', group: '상단 도구', id: `top:${label}`, label, question: q, source: '', kind: '', coverage: '', time: '', check: check(`v1:top:${q}`), finding: '', priority: '—', proposal: '' });
for (const [label, q] of snap.v1.questions) push({ service: 'v1', group: '질문 진입점', id: `q:${label}`, label, question: q, source: '', kind: '', coverage: '', time: '', check: '목록·소스', finding: 'F15', priority: 'P1', proposal: '5절 v1 제안(생활 질문 진입점) — 구현됨(menu-information.js)' });
for (const [label, group, q] of snap.v1.menu) push({ service: 'v1', group: `큰 메뉴 · ${group}`, id: `menu:${label}`, label, question: q, source: '', kind: '', coverage: '', time: '', check: '목록·소스', ...finding('v1', label) });
for (const [label, q] of snap.v1.kma) push({ service: 'v1', group: '기상청 라이브', id: `kma:${label}`, label, question: q, source: '기상청', kind: label === '기상청 라이브' ? '관측·공식 예보' : (label === '지금' ? '관측' : '공식 예보'), coverage: '한국', time: '', check: '목록·소스', finding: '', priority: '—', proposal: '' });
for (const [label, q] of snap.v1.presets) push({ service: 'v1', group: '보기 프리셋', id: `preset:${label}`, label, question: q, source: '', kind: '조합', coverage: '', time: '', check: '목록·소스', finding: '', priority: '—', proposal: '' });
for (const [id, label, q, kindTag] of snap.v1.layers) push({ service: 'v1', group: kindTag === 'quick' ? '구름 빠른 선택' : '전체레이어', id, label, question: q, source: '', kind: '', coverage: '', time: '', check: '목록·소스', ...finding('v1', id) });

// ---- AETHERUS (DOM 스냅샷) ----
for (const [label, q] of snap.aetherus.nav) push({ service: 'aetherus', group: '우주 내비게이션', id: `nav:${label}`, label, question: q, source: '', kind: '', coverage: '', time: '', check: label === '미션 컨트롤' ? 'UI' : '목록·소스', finding: '', priority: '—', proposal: '' });
for (const b of snap.aetherus.solarBodies) push({ service: 'aetherus', group: '태양계 천체', id: `body:${b}`, label: b, question: '', source: 'NASA/JPL 근사 궤도요소', kind: '파생(계산)', coverage: '', time: '', check: '목록·소스', finding: '', priority: '—', proposal: '' });
for (const [label, q] of snap.aetherus.photoFilters) push({ service: 'aetherus', group: '우주 사진관', id: `photo:${label}`, label, question: q, source: 'HST·JWST 공식 공개', kind: '관측', coverage: '', time: '', check: '목록·소스', finding: '', priority: '—', proposal: '' });
for (const [id, label] of snap.aetherus.filters) push({ service: 'aetherus', group: '미션 컨트롤 필터', id: `filter:${id}`, label, question: '', source: '', kind: '', coverage: '', time: '', check: check(`aetherus:filter:${id}`), finding: id === 'satellites' ? 'F01' : '', priority: id === 'satellites' ? 'P0' : '—', proposal: id === 'satellites' ? '위성·ISS 탭 통합, 숨김 위젯 임시 표시 — 수정됨' : '' });
for (const [id, label, state] of snap.aetherus.widgets) push({ service: 'aetherus', group: '미션 컨트롤 위젯', id, label, question: '', source: state, kind: '', coverage: '', time: '', check: check(`aetherus:widget:${id}`), ...finding('aetherus', id) });
for (const [id, label] of snap.aetherus.routes) push({ service: 'aetherus', group: '이동 버튼', id: `route:${id}:${label}`, label, question: '', source: '', kind: '', coverage: '', time: '', check: '목록·소스', finding: '', priority: '—', proposal: '' });
for (const [label, q] of snap.aetherus.tools) push({ service: 'aetherus', group: '미션 컨트롤 도구', id: `tool:${label}`, label, question: q, source: '', kind: '', coverage: '', time: '', check: '목록·소스', finding: label === 'ISS 수동 위치 입력' ? 'F16' : '', priority: label === 'ISS 수동 위치 입력' ? 'P2' : '—', proposal: label === 'ISS 수동 위치 입력' ? '6절 "추가로 필요"에 적혔지만 이미 구현됨(mission-observer.js)' : '' });

// ---- 출력 ----
const counts = { total: rows.length };
for (const r of rows) counts[r.service] = (counts[r.service] || 0) + 1;
const inventory = {
  generatedAt: new Date().toISOString(), baseCommit: '4d164263', branch: 'earthus-v2/real-living-earth-render',
  note: '행 수는 로컬 소스·DOM에서 추출된 실제 수. 원 보고서의 325개는 운영 화면 기준 집계였다. check=UI는 2026-09-05 로컬 미리보기에서 눌러 응답을 본 항목, 목록·소스는 메뉴 노출과 코드 연결만 본 항목.',
  counts, fields: ['no', 'service', 'group', 'id', 'label', 'question', 'source', 'kind', 'coverage', 'time', 'check', 'finding', 'priority', 'proposal'], rows,
};
fs.writeFileSync(path.join(outDir, 'menu-inventory.json'), JSON.stringify(inventory, null, 2) + '\n');

const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
let md = `# 메뉴별 결과 표 — EARTHUS v1 · v2 · AETHERUS\n\n생성 ${inventory.generatedAt.slice(0, 10)} · 기준 ${inventory.branch} @ ${inventory.baseCommit} + 미커밋 작업 · 총 ${counts.total}행 (v1 ${counts.v1} · v2 ${counts.v2} · AETHERUS ${counts.aetherus})\n\n${inventory.note}\n\n우선순위 P0 오해·기능 단절 / P1 핵심 정보 접근 / P2 탐색·학습 편의 / — 이번 보고서의 지적 없음.\n`;
for (const svc of ['v1', 'v2', 'aetherus']) {
  md += `\n## ${svc === 'aetherus' ? 'AETHERUS' : svc} (${counts[svc]}행)\n\n| # | 그룹 | id | 이름 | 질문 | 출처 | 자료 종류 | 범위 | 시각 | 확인 | 지적 | 우선 | 개선안 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n`;
  for (const r of rows.filter((x) => x.service === svc)) md += `| ${r.no} | ${esc(r.group)} | \`${esc(r.id)}\` | ${esc(r.label)} | ${esc(r.question)} | ${esc(r.source)} | ${esc(r.kind)} | ${esc(r.coverage)} | ${esc(r.time)} | ${r.check} | ${r.finding} | ${r.priority} | ${esc(r.proposal)} |\n`;
}
fs.writeFileSync(path.join(outDir, 'menu-review.md'), md);

const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>정보 접근성 리뷰 — 메뉴 ${counts.total}행</title>
<style>
:root{color-scheme:light dark;--line:#8883;--dim:#777}body{margin:0;padding:20px;font:15px/1.5 system-ui,-apple-system,"Malgun Gothic",sans-serif;max-width:1500px;margin-inline:auto}
h1{font-size:20px;margin:0 0 6px}p.note{color:var(--dim);margin:0 0 14px;font-size:13px}
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:12px}.bar input{flex:1 1 260px;min-height:40px;padding:6px 10px;font:inherit}
.bar select,.bar label{min-height:40px;display:inline-flex;align-items:center;gap:4px;font:inherit;padding:4px 8px}
.stat{color:var(--dim);font-size:13px}.wrap{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:13px}th,td{border-bottom:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}
th{position:sticky;top:0;background:Canvas;cursor:pointer}td.p0{color:#c0392b;font-weight:700}td.p1{color:#b7770d;font-weight:600}code{font-size:12px}
.hint{white-space:nowrap}
</style></head><body>
<h1>EARTHUS v1 · v2 · AETHERUS 메뉴·도구·재진입점 ${counts.total}행</h1>
<p class="note">${esc(inventory.note)} — 생성 ${inventory.generatedAt.slice(0, 16).replace('T', ' ')}Z · ${inventory.branch} @ ${inventory.baseCommit}</p>
<div class="bar">
<input id="q" placeholder="이름·질문·출처·id 검색" aria-label="검색">
<select id="svc" aria-label="서비스"><option value="">서비스 전체</option><option value="v1">v1 (${counts.v1})</option><option value="v2">v2 (${counts.v2})</option><option value="aetherus">AETHERUS (${counts.aetherus})</option></select>
<select id="pri" aria-label="우선순위"><option value="">우선순위 전체</option><option>P0</option><option>P1</option><option>P2</option><option value="—">지적 없음</option></select>
<select id="chk" aria-label="확인 수준"><option value="">확인 수준 전체</option><option>UI</option><option>목록·소스</option></select>
<span class="stat" id="stat"></span>
</div>
<div class="wrap"><table id="t"><thead><tr>${['#', '서비스', '그룹', 'id', '이름', '질문', '출처', '자료 종류', '범위', '시각', '확인', '지적', '우선', '개선안'].map((h, i) => `<th data-i="${i}">${h}</th>`).join('')}</tr></thead><tbody></tbody></table></div>
<script>
const ROWS=${JSON.stringify(rows)};
const F=['no','service','group','id','label','question','source','kind','coverage','time','check','finding','priority','proposal'];
const tb=document.querySelector('#t tbody'),q=document.getElementById('q'),svc=document.getElementById('svc'),pri=document.getElementById('pri'),chk=document.getElementById('chk'),stat=document.getElementById('stat');
let sortI=0,sortD=1;const esc=s=>String(s??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function render(){const s=q.value.trim().toLowerCase();let rs=ROWS.filter(r=>(!svc.value||r.service===svc.value)&&(!pri.value||r.priority===pri.value)&&(!chk.value||r.check===chk.value)&&(!s||[r.label,r.question,r.source,r.id,r.group,r.proposal].join(' ').toLowerCase().includes(s)));
rs.sort((a,b)=>{const k=F[sortI];const x=a[k],y=b[k];return (typeof x==='number'?x-y:String(x).localeCompare(String(y),'ko'))*sortD});
tb.innerHTML=rs.map(r=>'<tr>'+F.map(k=>{const v=r[k];const cls=(k==='priority'?(v==='P0'?'p0':v==='P1'?'p1':''):'')+(k==='check'||k==='finding'||k==='priority'||k==='no'?' hint':'');return '<td class="'+cls+'">'+(k==='id'?'<code>'+esc(v)+'</code>':esc(v))+'</td>'}).join('')+'</tr>').join('');
stat.textContent=rs.length+' / '+ROWS.length+'행';}
for(const el of [q,svc,pri,chk])el.addEventListener('input',render);
document.querySelectorAll('th').forEach(th=>th.addEventListener('click',()=>{const i=+th.dataset.i;sortD=sortI===i?-sortD:1;sortI=i;render()}));
render();
</script></body></html>
`;
fs.writeFileSync(path.join(outDir, 'review.html'), html);
console.log('information inventory:', counts);
