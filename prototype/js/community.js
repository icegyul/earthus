// 커뮤니티 — 경고 + 개발 요청
//
// 두 갈래다.
//   경고(warnings) — 지금 위험한 것만. 지진·분화·쓰나미·산불.
//                    ⚠️ 이름을 "소식"에서 "경고"로 바꿨다. 지진과 로켓 발사가
//                       같은 목록에 섞여 있으면 무엇이 위험한지 구분이 안 된다.
//   개발 요청       — 사용자가 쓴다. 저장은 Supabase.
//
// 여기서 뺀 것
//   발사    → 위성 탭으로 옮겼다. 발사는 경고가 아니라 예정된 일정이다.
//   뉴스     → 이벤트 메뉴로 옮겼다. 교차검증 결과를 따로 보여줘야 의미가 산다.
//
// ⚠️ 사용자 글을 다루므로 지켜야 할 것
//   · 백엔드가 없으면 "저장된 척"하지 않는다. 못 쓴다고 말한다.
//   · 신고 수단이 없는 공개 게시판은 만들지 않는다 — 신고 버튼을 함께 둔다.
//   · 이메일 같은 개인정보를 목록에 노출하지 않는다.

import { auth } from './auth.js';
import { i18n } from './i18n.js';
import { GLOBAL_EVENT } from './config.js';

/* ── 소식 피드 ─────────────────────────────────────────────────
   새 데이터를 받아오지 않는다. 이미 켜져 있는 레이어들이 가진 것을 모은다.
   피드 하나 보려고 네트워크를 또 쓰는 건 낭비다. */
export async function warnings(limit = 30) {
  const items = [];
  const ko = i18n.lang === 'ko';
  const push = o => items.push(o);

  /* 쓰나미가 최우선이다. 다른 어떤 것보다 위에 온다. */
  try {
    const { tsunami } = await import('./layers/tsunami.js');
    (tsunami.list || []).forEach(t => push({
      id: `ts-${t.id}`, kind: 'tsunami',
      badge: ko ? '쓰나미' : 'Tsunami',
      /* ⚠️ 등급을 무시하고 전부 최고 위험으로 두면 안 된다 — '쓰나미 정보'는 발표 기관이
         "위험 없음"을 알리는 단계다. 그걸 며칠이 지나도 목록 맨 위에 두면, 진짜 경보와
         구분이 사라진다. 기관이 매긴 rank 를 그대로 쓴다 (경보·주의보 4·3 은 그대로 최상단). */
      severity: t.level.rank >= 3 ? 3 : t.level.rank === 2 ? 2 : 1,
      title: t.level[i18n.lang] || t.level.ko,
      sub: (t.area || '').split(';')[0],
      /* ⚠️ 여기엔 기관 이름만 있었다 — 언제 나온 발표인지 화면 어디에도 없었다.
         (받은 지적: "어디서 어떻게 진행되었다던지 그런 정보가 없어") */
      meta: t.sent ? `${i18n.rel(Date.parse(t.sent))} · ${t.sourceName || 'NWS'}` : (t.sourceName || 'NWS'),
      at: Date.parse(t.sent) || Date.now(), lat: t.lat, lon: t.lon,
      select: { id: t.id, kind: 'tsunami', name: t.level[i18n.lang] || t.level.ko,
                lat: t.lat, lon: t.lon, _ts: t },
    }));
  } catch (_) { /* 무시 */ }

  try {
    const { quakes, volcanoes } = await import('./layers/hazard.js');
    (quakes.layer?.items || [])
      .filter(m => m.data._mag >= 4.5)
      .slice(0, 10)
      .forEach(m => push({
        id: m.id, kind: 'quake',
        badge: ko ? '지진' : 'Quake',
        severity: m.data._mag >= GLOBAL_EVENT.QUAKE_MAG ? 3 : m.data._mag >= 5.5 ? 2 : 1,
        title: `M ${m.data._mag.toFixed(1)}`,
        sub: m.data[i18n.t.F.place] || '—',
        meta: i18n.rel(m.data._time),
        at: m.data._time, lat: m.lat, lon: m.lon, select: m,
      }));
    (volcanoes.layer?.items || [])
      /* ⚠️ 정적 화산 목록의 설명에 erupt 라는 단어가 있다고
         실시간 분화로 만들면 안 된다. 기관 피드가 명시한 플래그만 쓴다. */
      .filter(m => m.data?._currentEruption === true)
      .slice(0, 6)
      .forEach(m => push({
        id: m.id, kind: 'volcano',
        badge: ko ? '분화' : 'Eruption', severity: 2,
        title: m.name, sub: m.data?.[i18n.t.F.type] || '—',
        meta: ko ? '진행 중' : 'Ongoing',
        at: Date.now(), lat: m.lat, lon: m.lon, select: m,
      }));
  } catch (_) { /* 무시 */ }

  /* 산불 — 위성이 직접 본 것만. 큰 것 위주로.
     ⚠️ 3,900건을 다 넣으면 목록이 산불로 덮인다. FRP 상위만 올린다. */
  try {
    const { wildfires } = await import('./layers/wildfire.js');
    (wildfires.layer?.items || [])
      .filter(f => f.data._frp >= 3000)
      .slice(0, 8)
      .forEach(f => push({
        id: f.id, kind: 'wildfire',
        badge: ko ? '산불' : 'Wildfire',
        severity: f.data._frp >= 20000 ? 3 : f.data._frp >= 8000 ? 2 : 1,
        title: f.name,
        sub: `${f.lat.toFixed(2)}, ${f.lon.toFixed(2)}`,
        meta: ko ? '위성 관측' : 'Satellite',
        at: Date.now(), lat: f.lat, lon: f.lon, select: f,
      }));
  } catch (_) { /* 무시 */ }

  // 위험도 높은 순 → 그다음 최신순
  items.sort((a, b) => (b.severity || 0) - (a.severity || 0) || b.at - a.at);
  return items.slice(0, limit);
}

/** 예정된 발사 — 위성 탭에서 쓴다 (경고가 아니라 일정이다) */
export async function upcomingLaunches(limit = 8) {
  try {
    const { launches } = await import('./layers/space.js');
    return (launches.upcoming || []).slice(0, limit);
  } catch (_) { return []; }
}

/* ── 개발 요청 ─────────────────────────────────────────────────
   ⚠️ 1인 개발이라는 사실을 숨기지 않는다.
      "곧 반영하겠습니다"를 남발하면 지키지 못하고, 그게 쌓이면 아무도 안 믿는다.
      할 수 있는 것과 없는 것을 처음부터 말해두는 편이 낫다. */
export const STATUS = {
  open:    { ko: '접수됨',   en: 'Open',        color: '#9fb4c4' },
  planned: { ko: '만들 예정', en: 'Planned',     color: '#3fc7c0' },
  doing:   { ko: '만드는 중', en: 'In progress', color: '#f2a65a' },
  done:    { ko: '반영됨',   en: 'Shipped',     color: '#8fd694' },
  hold:    { ko: '보류',     en: 'On hold',     color: '#7a8794' },
};

export const requests = {
  async list() {
    if (!auth.client) return null;                 // null = 백엔드 없음 (빈 목록과 다르다)
    const { data, error } = await auth.client
      .from('feature_requests')
      .select('id, body, lang, status, votes, created_at')
      .order('votes', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { console.warn('[requests]', error.message); return null; }
    return data || [];
  },

  async submit(body) {
    if (!auth.client) throw new Error('BACKEND_NOT_CONFIGURED');
    const text = String(body || '').trim();
    if (text.length < 5) throw new Error('TOO_SHORT');
    if (text.length > 1000) throw new Error('TOO_LONG');
    const { detectLang } = await import('./translate.js');
    const { error } = await auth.client.from('feature_requests').insert({
      body: text,
      lang: detectLang(text),
      // 로그인 없이도 쓸 수 있게 둔다. 대신 수정·삭제는 로그인한 글만 가능하다.
      user_id: auth.user?.id || null,
      status: 'open',
      created_at: new Date().toISOString(),
    });
    if (error) throw error;
    return { ok: true };
  },

  /** 공감 — 한 사람이 한 번만. 서버에 기록이 없으면 로컬로라도 중복을 막는다. */
  async vote(id) {
    const LS = 'earthus.voted';
    let voted = [];
    try { voted = JSON.parse(localStorage.getItem(LS) || '[]'); } catch { /* 무시 */ }
    if (voted.includes(id)) return { ok: true, already: true };
    if (!auth.client) throw new Error('BACKEND_NOT_CONFIGURED');
    /* ⚠️ votes = votes + 1 을 클라이언트에서 계산해 쓰면 경쟁 상태로 값이 어긋난다.
       서버 함수(RPC)로 원자적으로 올린다. */
    const { error } = await auth.client.rpc('vote_feature_request', { req_id: id });
    if (error) throw error;
    voted.push(id);
    localStorage.setItem(LS, JSON.stringify(voted));
    return { ok: true, already: false };
  },

  hasVoted(id) {
    try { return JSON.parse(localStorage.getItem('earthus.voted') || '[]').includes(id); }
    catch { return false; }
  },

  async report(id) {
    if (!auth.client) throw new Error('BACKEND_NOT_CONFIGURED');
    const { error } = await auth.client.from('reports').insert({
      target_type: 'feature_request', target_id: id,
      user_id: auth.user?.id || null, created_at: new Date().toISOString(),
    });
    if (error) throw error;
    return { ok: true };
  },
};
