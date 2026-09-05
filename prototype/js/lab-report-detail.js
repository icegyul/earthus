// LAB 보고서 본문 — 카드 하나가 답해야 할 네 가지를 그린다.
//
// 받은 지적(2026-09-05): "태풍 보고서가 없어. 태풍 위치와 실제 진행방향이 어느 기상청 자료와
// 맞는지, 우리가 계산한 진행방향도 얼마나 맞았는지, 언제 커지거나 작아지고 상륙하는지,
// 기상청이 어떻게 분류했는지 — 이런 보고서가 없어."
//
// 본문 자료는 cyclone-reports.json 의 report.detail(cyclone-analog public_detail)이다.
// 여기서는 값을 계산하지 않는다 — 있는 것을 사용자 말로 옮기고, 없는 것은 없다고 적는다.
// ⚠️ 기관 실황·발표·강도 분류는 무료(기관 공개 자료). 우리 계산의 오차·기관 순위 표는 구독·관리자.

const esc = value => String(value ?? '').replace(/[&<>"']/g, char =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

const AGENCY_KO = {
  KMA: '한국 기상청', JMA: '일본 기상청', NHC: '미국 허리케인센터', ECMWF: 'ECMWF 모델',
  EARTHUS_MULTI_SOURCE: 'EARTHUS 계산', EARTHUS_ANALOG_MEDIAN: 'EARTHUS 유사사례',
};
const agencyKo = id => AGENCY_KO[id] || id || '자료 없음';
const isOurs = id => String(id || '').startsWith('EARTHUS');

export function kst(value, withDate = true) {
  if (!value) return '시각 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return esc(value);
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', ...(withDate ? { month: 'numeric', day: 'numeric' } : {}), hour: '2-digit', minute: '2-digit',
  }).format(date);
}
const num = (value, digits = 0, unit = '') => (value == null || Number.isNaN(Number(value))
  ? '—' : `${Number(value).toFixed(digits)}${unit}`);
const coord = p => (p && p.lat != null && p.lon != null
  ? `${Math.abs(p.lat).toFixed(1)}°${p.lat >= 0 ? 'N' : 'S'} ${Math.abs(p.lon).toFixed(1)}°${p.lon >= 0 ? 'E' : 'W'}` : '좌표 없음');
const grade = p => (p?.categoryKo ? esc(p.categoryKo) : p?.gradeKo ? `${esc(p.gradeKo)}<small>풍속 환산</small>` : '—');

function section(title, body, note) {
  return `<section class="rd-sec"><h3>${esc(title)}</h3>${body}${note ? `<p class="rd-note">${esc(note)}</p>` : ''}</section>`;
}

/* 1. 지금 어디에 있고 어디로 가나 */
function renderNow(detail) {
  const p = detail.latestObserved;
  if (!p) return section('현재 위치', '<p class="empty">공식 기관 실황이 아직 없습니다. GDACS 탐지만 된 상태입니다.</p>');
  const it = detail.intensity || {};
  const trend = it.trend ? `${esc(it.trend.ko)} (${it.trend.deltaMs > 0 ? '+' : ''}${num(it.trend.deltaMs, 1, ' m/s')} · ${kst(it.trend.since)} 이후)` : '추세 미산출';
  return section('현재 위치와 강도', `
    <div class="rd-now"><b>${coord(p)}</b><span>${esc(p.place || '')}</span></div>
    <div class="meta">
      <div><small>실황 시각 · 기관</small><b>${kst(p.at)} · ${esc(agencyKo(p.agency))}</b></div>
      <div><small>현재 진행</small><b>${esc(p.courseKo || '—')} ${num(p.speedKmh, 0, ' km/h')}</b></div>
      <div><small>최대풍속 · 중심기압</small><b>${num(p.windMs, 0, ' m/s')} · ${num(p.hpa, 0, ' hPa')}</b></div>
      <div><small>강도 분류</small><b>${grade(p)}</b></div>
      <div><small>최고 강도</small><b>${it.peakWindMs != null ? `${num(it.peakWindMs, 0, ' m/s')} · ${kst(it.peakAt)} (${esc(agencyKo(it.peakAgency))})` : '—'}</b></div>
      <div><small>최근 12시간</small><b>${trend}</b></div>
    </div>`, detail.note?.observed);
}

/* 2. 기관별 진로·강도 전망 — 있는 그대로 나란히. 합치지 않는다 */
function renderOfficial(detail) {
  const rows = detail.official || [];
  if (!rows.length) {
    const models = (detail.models || []).map(m => `${esc(agencyKo(m.agency))} ${esc(m.headingKo || '—')}`).join(' · ');
    return section('기관 발표 진로', `<p class="empty">진로 예보를 내는 공식 기관 자료가 없습니다.${models ? ` 모델 참고: ${models}` : ''}</p>`,
      'NHC 는 대서양·동태평양만 담당하고 서태평양 JTWC 는 접근이 막혀 있습니다. 진로 없이 실황만 있는 태풍은 이렇게 표시됩니다.');
  }
  const cards = rows.map(o => {
    const steps = (o.steps || []).filter(s => s.h !== 0).map(s =>
      `<tr><td>+${esc(s.h)}h<br><small>${kst(s.at)}</small></td><td>${coord(s)}<br><small>${esc(s.place || '')}</small></td>`
      + `<td>${esc(s.courseKo || '—')}<br><small>${num(s.speedKmh, 0, ' km/h')}</small></td><td>${num(s.windMs, 0)}<br><small>${num(s.hpa, 0, ' hPa')}</small></td><td>${grade(s)}</td></tr>`).join('');
    const events = [];
    if (o.peak) events.push(`최강 ${num(o.peak.windMs, 0, ' m/s')} · ${kst(o.peak.at)}`);
    if (o.weakenAt) events.push(`약화 시작 ${kst(o.weakenAt)}`);
    if (o.downgrade) events.push(`${esc(o.downgrade.fromKo)} → ${esc(o.downgrade.toKo)} ${kst(o.downgrade.at)} (${esc(o.downgrade.basis)})`);
    events.push(o.landfall ? `상륙 언급: ${kst(o.landfall.at)} · ${esc(o.landfall.place)}` : '발표문에 상륙 언급 없음');
    return `<article class="rd-agency"><header><b>${esc(o.agencyKo)}</b><small>발표 ${kst(o.issued)} · +${esc(o.horizonH)}h까지</small></header>
      <p class="rd-head">향후 ${esc(o.headingToH ?? '—')}시간 방향 <b>${esc(o.headingKo || '—')}</b>${o.headingDeg != null ? ` (${o.headingDeg}°)` : ''} · 현재 ${esc(o.courseKo || '—')} ${num(o.speedKmh, 0, ' km/h')}</p>
      <ul class="rd-events">${events.map(e => `<li>${e}</li>`).join('')}</ul>
      ${steps ? `<div class="wrap"><table class="score"><thead><tr><th>시각</th><th>위치</th><th>진행</th><th>풍속 m/s</th><th>등급</th></tr></thead><tbody>${steps}</tbody></table></div>` : ''}
    </article>`;
  }).join('');
  const models = (detail.models || []).map(m => `<li><b>${esc(agencyKo(m.agency))}</b> ${esc(m.headingKo || '—')}${m.headingDeg != null ? ` (${m.headingDeg}°)` : ''} · +${esc(m.horizonH)}h · ${kst(m.issued)}</li>`).join('');
  return section('기관 발표 진로·강도 전망', cards + (models ? `<p class="rd-sub">모델·계산 방향 (공식 예보 아님)</p><ul class="rd-events">${models}</ul>` : ''),
    `${detail.note?.landfall || ''} ${detail.note?.grade || ''}`.trim());
}

/* 3. 누가 맞았나 — 방향과 위치. 활동 중이면 잠정 */
function renderVerification(report, detail, allowed) {
  const isFinal = report.status === 'FINAL_REPORT';
  const posRows = isFinal ? (report.scores || []) : (detail.interimScores || []);
  const headRows = detail.headingScores || [];
  if (!allowed) {
    return section(isFinal ? '종료 검증' : '지금까지의 검증(잠정)',
      '<div class="lock">기관별·EARTHUS 계산의 위치 오차와 방향 적중은 구독·관리자에게 제공됩니다. 위의 기관 발표·실황은 그대로 볼 수 있습니다.</div>');
  }
  if (!posRows.length && !headRows.length) {
    return section('검증', `<p class="empty">${esc(detail.note?.interim || '대조할 실황이 아직 없습니다.')}</p>`);
  }
  const merged = new Map();
  posRows.forEach(s => { const m = merged.get(s.agency) || { agency: s.agency }; m.n = (m.n || 0) + (s.n || 0); m.sum = (m.sum || 0) + (s.meanErrorKm || 0) * (s.n || 0); merged.set(s.agency, m); });
  headRows.forEach(h => { const m = merged.get(h.agency) || { agency: h.agency }; m.headN = h.n; m.headErr = h.meanErrDeg; m.within45 = h.within45; merged.set(h.agency, m); });
  const list = [...merged.values()].map(m => ({ ...m, meanKm: m.n ? Math.round(m.sum / m.n) : null }))
    .sort((a, b) => (a.headErr ?? 999) - (b.headErr ?? 999));
  const table = `<div class="wrap"><table class="score"><thead><tr><th>자료</th><th>방향 오차</th><th>45° 안</th><th>위치 오차</th></tr></thead><tbody>${list.map(m =>
    `<tr class="${isOurs(m.agency) ? 'ours' : ''}"><td>${esc(agencyKo(m.agency))}</td><td>${m.headErr != null ? `${m.headErr}°` : '—'}</td>`
    + `<td>${m.headN ? `${m.within45}/${m.headN}` : '—'}</td><td>${m.meanKm != null ? `${m.meanKm} km (n=${m.n})` : '—'}</td></tr>`).join('')}</tbody></table></div>`;
  const best = list.find(m => m.headErr != null);
  const ours = list.find(m => isOurs(m.agency));
  const verdict = best ? `<p class="rd-verdict">방향을 가장 가깝게 본 자료: <b>${esc(agencyKo(best.agency))}</b> (평균 ${best.headErr}°)`
    + (ours && ours.headErr != null ? ` · EARTHUS 계산 ${ours.headErr}°${ours.meanKm != null ? `, 위치 ${ours.meanKm} km` : ''}` : ' · EARTHUS 계산은 이 태풍에 없음') + '</p>' : '';
  return section(isFinal ? '종료 검증 (IBTrACS 최종 경로 기준)' : `지금까지의 검증 (잠정 · ${esc(agencyKo(detail.truthAgency))} 실황 기준)`,
    verdict + table, `${isFinal ? '' : detail.note?.interim || ''} 한 사건의 결과로 기관의 장기 우열을 일반화하지 않습니다.`.trim());
}

/* 4. 실황 이력 — 언제 세졌고 약해졌나 */
function renderHistory(detail) {
  const rows = (detail.observed || []).slice(-24).reverse();
  if (!rows.length) return '';
  return section('실황 이력 (기관 발표 0시간 위치)', `<div class="wrap"><table class="score"><thead><tr><th>시각(KST)</th><th>기관</th><th>위치</th><th>진행</th><th>풍속</th><th>등급</th></tr></thead><tbody>${rows.map(p =>
    `<tr><td>${kst(p.at)}</td><td>${esc(p.agency)}</td><td>${coord(p)}</td><td>${esc(p.courseKo || '—')}</td><td>${num(p.windMs, 0)}</td><td>${grade(p)}</td></tr>`).join('')}</tbody></table></div>`);
}

export function renderCycloneDetail(report, allowed) {
  const detail = report.detail;
  if (!detail) return '<p class="empty">이 보고서에는 아직 본문이 없습니다. 다음 계산 회차(3시간 이내)에 채워집니다.</p>';
  return renderNow(detail) + renderOfficial(detail) + renderVerification(report, detail, allowed) + renderHistory(detail);
}

/* ── 태풍 밖의 현상 (lab-events handler 의 공통 detail) ────────────────────────────
   headline · facts · timeline · agencies · engine(우리 계산: 구독) · verification(구독) · notes · sourceLinks */
function factsTable(facts) {
  return `<div class="meta">${(facts || []).map(f => `<div><small>${esc(f.label)}</small><b>${esc(f.value ?? '—')}</b></div>`).join('')}</div>`;
}

export function renderEventDetail(report, allowed) {
  const d = report.detail;
  if (!d) return '<p class="empty">이 보고서에는 아직 본문이 없습니다. 다음 계산 회차(3시간 이내)에 채워집니다.</p>';
  let html = `<p class="rd-headline">${esc(d.headline || '')}</p>` + factsTable(d.facts);
  if ((d.timeline || []).length) {
    html += section('사건 이력', `<ul class="rd-events">${d.timeline.map(t => `<li><small>${kst(t.at)}${t.agency ? ` · ${esc(t.agency)}` : ''}</small> ${esc(t.text)}</li>`).join('')}</ul>`);
  }
  if ((d.agencies || []).length) {
    html += section('기관 발표·자료원', `<ul class="rd-events">${d.agencies.map(a => `<li><b>${esc(a.agencyKo || a.agency)}</b> ${esc(a.summary || '')}</li>`).join('')}</ul>`);
  }
  const eng = d.engine;
  if (eng) {
    const rows = allowed && (eng.rows || []).length
      ? `<div class="wrap"><table class="score"><thead><tr><th>대상</th><th>추정</th><th>실제</th><th>차이</th></tr></thead><tbody>${eng.rows.map(r =>
        `<tr><td>${esc(r.label)}</td><td>${esc(r.forecast)}</td><td>${esc(r.actual)}</td><td>${r.forecast != null && r.actual != null ? esc(Math.abs(r.actual - r.forecast).toFixed(1)) : '—'} ${esc(eng.unit || '')}</td></tr>`).join('')}</tbody></table></div>`
      : '';
    html += section(`EARTHUS 계산 — ${eng.name}`, `<p class="rd-head">${esc(eng.current || '—')}</p><p class="rd-note">${esc(eng.method || '')}</p>`
      + (allowed ? `<p class="rd-verdict">${esc(eng.verdict || '')}</p>${rows}` : '<div class="lock">추정의 채점 결과와 회차별 표는 구독·관리자에게 제공됩니다.</div>'));
  }
  const ver = d.verification;
  if (ver && allowed && (ver.rows || []).length) {
    html += section('검증', `<div class="wrap"><table class="score"><thead><tr><th>자료</th><th>n</th><th>점수</th></tr></thead><tbody>${ver.rows.map(r =>
      `<tr><td>${esc(r.source)}</td><td>${esc(r.n)}</td><td>${esc(r.score)} ${esc(r.unit || '')}</td></tr>`).join('')}</tbody></table></div>`, ver.note);
  } else if (ver && ver.note) {
    html += section('검증', `<p class="empty">${esc(ver.note)}</p>`);
  }
  if ((d.notes || []).length) html += `<ul class="rd-events rd-notes">${d.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`;
  if ((d.sourceLinks || []).length) html += `<p class="rd-links">${d.sourceLinks.filter(l => l.url).map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`).join(' · ')}</p>`;
  return html;
}
