// LAB · 개발 요청 — 1.0 ui-community.js renderRequests / reqCard 의 이식 (v2-three ext 규약)
//
// 자료·저장은 1.0 의 /js/community.js (`requests` — Supabase) 를 그대로 쓴다.
//   ⚠️ community.js 는 auth.js 를 끌어오고, auth.js 는 config.local.js 의 키로 Supabase 를 만든다.
//      키 파일이 없거나 import 가 던지면 → "게시판 서버가 연결되지 않았다" 카드로 내려앉는다.
//   ⚠️ auth.client 는 auth.init() 이 돌기 전까지 null 이다. v2 는 auth.init() 을 부르지 않으므로
//      여기서 한 번 부른다 (안에 한 번만 도는 가드가 있다). 오래 걸리면 기다리지 않고 진행한다.
//   ⚠️ requests.list() 가 null 이면 "요청이 없습니다"가 아니다 — 저장할 곳이 없는 것이다.
//
// 번역 (1.0 과 같다)
//   글은 원문 그대로 두고, 다른 언어 사용자를 위해 번역을 버튼 뒤에 붙인다.
//   ⚠️ 번역이 원문을 대체하지 않는다. 기계 번역이라고 반드시 표시한다.
//   ⚠️ 미리보기는 버튼을 눌러야만 MyMemory 로 전송된다 (최대 500바이트).
//
// 1.0 의 toast 는 ui.js(Cesium 묶음)에 있어 못 쓴다 → 카드 위에 한 줄(state.msg)로 대신한다.

const TA_ID = 'ext-req-body';
const PREVIEW_LABEL = (ko) => (ko ? '기계 번역 미리보기 · MyMemory로 전송' : 'Machine translation preview · sends to MyMemory');

const withTimeout = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(res, ms))]);

function notConnected(ko) {
  return `<div class="tr-warn">${ko
    ? '아직 게시판 서버가 연결되지 않아 요청을 저장할 수 없습니다. 연결되면 여기에 목록이 나타납니다.'
    : 'The board backend is not connected yet, so requests cannot be saved. The list will appear once it is.'}</div>`;
}

function errMsg(e, ko) {
  const m = {
    TOO_SHORT: ko ? '조금 더 자세히 적어주세요' : 'A little more detail, please',
    TOO_LONG: ko ? '1,000자 이내로 적어주세요' : 'Keep it under 1,000 characters',
    BACKEND_NOT_CONFIGURED: ko ? '게시판 서버가 아직 연결되지 않았습니다' : 'Board backend not connected',
  }[e?.message];
  return m || (ko ? '실패: ' : 'Failed: ') + (e?.message || e);
}

export default {
  key: 'lab/requests',
  title: '개발 요청',
  badge: (state) => (state?.v1 && state.list !== null ? 'LIVE' : 'UNAVAILABLE'),

  async load(ctx, state, signal) {
    state.ko = ctx.ko;
    state.msg = null; state.busyId = null;
    if (state.draft == null) state.draft = '';
    if (state.preview === undefined) state.preview = null;
    state.tr = state.tr || {};                       // id → {text} | 'busy' | 'fail'
    let v1 = null;
    try {
      const [community, translate, authMod] = await Promise.all([
        ctx.v1('community.js'), ctx.v1('translate.js'), ctx.v1('auth.js').catch(() => null),
      ]);
      /* Supabase 클라이언트를 만든다. 세션 조회가 늦으면 8초 뒤 그냥 진행한다 (client 는 그 전에 만들어진다). */
      try { if (authMod?.auth?.init) await withTimeout(authMod.auth.init(), 8000); } catch (_) { /* 게스트로 진행 */ }
      v1 = { requests: community.requests, STATUS: community.STATUS, translator: translate.translator, detectLang: translate.detectLang };
    } catch (e) {
      console.warn('[lab/requests] 1.0 모듈을 못 빌렸다 → 미연결 카드', e);
      state.v1 = null; state.list = null; state.data = { connected: false };
      return;
    }
    if (signal?.aborted) return;
    state.v1 = v1;
    let list = null;
    try { list = await v1.requests.list(); } catch (_) { list = null; }
    if (signal?.aborted) return;
    state.list = list;                               // null = 백엔드 없음 · [] = 비어 있음
    state.data = { connected: list !== null };
  },

  card(ctx, state) {
    const ko = ctx.ko; const esc = ctx.esc;
    const lang = ko ? 'ko' : 'en';
    let html = `<div class="req-intro">
      <b>${ko ? '무엇이 불편하신가요?' : 'What should improve?'}</b>
      <p>${ko
        ? '불편한 점과 필요한 기능을 남겨 주세요. <b>공감이 많은 요청부터 검토합니다.</b>'
        : 'Share what feels difficult and what you need. <b>Most-upvoted requests are reviewed first.</b>'}</p></div>`;

    if (state.msg) html += `<p class="sky-note ext-req-msg">${esc(state.msg)}</p>`;

    /* 작성 폼 — form 태그를 쓰지 않는다(submit 이 페이지를 새로 고친다). 버튼은 전부 data-action. */
    const draft = String(state.draft || '');
    const canPreview = draft.trim().length >= 8 && !state.previewBusy;
    html += `<div class="req-form">
      <textarea id="${TA_ID}" class="req-input" rows="3" maxlength="1000" data-action="ext:req-input"
        placeholder="${ko ? '예: 지진 알림을 진도 기준으로 받고 싶어요' : 'e.g. I want quake alerts based on local intensity'}">${esc(draft)}</textarea>
      ${state.preview ? `<div class="req-preview"><span class="tr-tag">${state.preview.to === 'ko' ? '한국어' : 'English'} · ${ko ? '기계 번역' : 'machine'}</span>${esc(state.preview.text)}</div>` : ''}
      <button type="button" class="tr-btn req-preview-btn" data-action="ext:req-preview" ${canPreview ? '' : 'disabled'}>${state.previewBusy ? (ko ? '번역 중…' : 'Translating…') : PREVIEW_LABEL(ko)}</button>
      <button type="button" class="btn-primary" data-action="ext:req-submit" ${state.submitBusy ? 'disabled' : ''}>${ko ? '요청 보내기' : 'Send request'}</button>
    </div>`;

    // 목록
    if (!state.v1 || state.list === null) return html + notConnected(ko);
    if (state.list === undefined) return html + `<p class="sky-dim">${ko ? '불러오는 중…' : 'Loading…'}</p>`;
    if (!state.list.length) {
      return html + `<p class="sky-dim">${ko
        ? '아직 올라온 요청이 없습니다. 첫 번째로 남겨주세요.'
        : 'No requests yet — be the first.'}</p>`;
    }

    const { STATUS, requests, detectLang } = state.v1;
    html += state.list.map((r) => {
      const st = STATUS[r.status] || STATUS.open;
      const voted = requests.hasVoted(r.id);
      let tr = '';
      if (detectLang(r.body) !== lang) {
        const t = state.tr[r.id];
        if (t && t !== 'busy' && t !== 'fail') {
          tr = `<div class="rq-tr"><span class="tr-tag">${ko ? '기계 번역' : 'Machine translation'}</span><div class="tr-text">${esc(t.text)}</div></div>`;
        } else {
          const label = t === 'busy' ? (ko ? '번역 중…' : 'Translating…')
            : t === 'fail' ? (ko ? '번역할 수 없습니다' : 'Translation unavailable')
            : (ko ? '한국어로 보기' : 'Show in English');
          tr = `<div class="rq-tr"><button type="button" class="tr-btn" data-action="ext:req-tr" data-id="${esc(r.id)}" ${t ? 'disabled' : ''}>${label}</button></div>`;
        }
      }
      return `<div class="req-card">
        <div class="rq-top">
          <span class="rq-st" style="color:${st.color};border-color:${st.color}55">${ko ? st.ko : st.en}</span>
          <span class="rq-date">${esc(String(r.created_at || '').slice(0, 10))}</span>
        </div>
        <div class="rq-body">${esc(r.body)}</div>
        ${tr}
        <div class="rq-foot">
          <button type="button" class="rq-vote${voted ? ' on' : ''}" data-action="ext:req-vote" data-id="${esc(r.id)}">▲ <b>${r.votes || 0}</b></button>
          <button type="button" class="rq-report" data-action="ext:req-report" data-id="${esc(r.id)}">${ko ? '신고' : 'Report'}</button>
        </div></div>`;
    }).join('');
    return html;
  },

  action(ctx, state, name, ds, value) {
    const ko = ctx.ko;
    const v1 = state.v1;
    const readDraft = () => {
      const ta = typeof document !== 'undefined' ? document.getElementById(TA_ID) : null;
      if (ta) state.draft = ta.value;
      return String(state.draft || '');
    };
    const say = (m) => { state.msg = m; ctx.refresh(); };

    if (name === 'req-input') {                     // 타이핑 — 다시 그리지 않는다 (입력이 끊긴다)
      if (typeof value === 'string') state.draft = value;
      else return { handled: true };                // click 이벤트로도 들어온다 — 값이 없으면 무시
      /* 다시 그리지 않고 미리보기 버튼·미리보기만 DOM 에서 직접 맞춘다 (1.0 ta.oninput 과 같다) */
      try {
        const root = document.getElementById(TA_ID)?.closest('.req-form');
        const btn = root?.querySelector('.req-preview-btn');
        if (btn && !state.previewBusy) btn.disabled = value.trim().length < 8;
        const prev = root?.querySelector('.req-preview');
        if (prev) prev.style.display = 'none';
      } catch (_) { /* DOM 이 없으면 그만 */ }
      state.preview = null;
      return { handled: true };
    }

    if (name === 'req-preview') {
      const v = readDraft().trim();
      if (v.length < 8 || !v1?.translator) return { handled: true };
      state.previewBusy = true; state.msg = null; ctx.refresh();
      v1.translator.both(v).then((r) => {
        state.previewBusy = false;
        state.preview = r?.translated ? { to: r.to, text: r.translated } : null;
        if (!r?.translated) state.msg = ko ? '번역할 수 없습니다' : 'Translation unavailable';
        ctx.refresh();
      }).catch(() => { state.previewBusy = false; state.preview = null; ctx.refresh(); });
      return { handled: true };
    }

    if (name === 'req-submit') {
      const body = readDraft();
      if (!v1?.requests) { say(errMsg(new Error('BACKEND_NOT_CONFIGURED'), ko)); return { handled: true }; }
      state.submitBusy = true; state.msg = null; ctx.refresh();
      (async () => {
        try {
          await v1.requests.submit(body);
          state.draft = ''; state.preview = null;
          state.msg = ko ? '보내주셔서 고맙습니다. 확인하겠습니다.' : 'Thank you — I will read it.';
          try { state.list = await v1.requests.list(); } catch (_) { /* 목록은 다음에 */ }
        } catch (e) { state.msg = errMsg(e, ko); }
        state.submitBusy = false;
        ctx.refresh();
      })();
      return { handled: true };
    }

    if (name === 'req-vote') {
      const r = (state.list || []).find((x) => String(x.id) === String(ds.id));
      if (!r || !v1?.requests) return { handled: true };
      readDraft();
      v1.requests.vote(r.id).then((res) => {
        if (res?.already) { say(ko ? '이미 공감하셨습니다' : 'Already voted'); return; }
        r.votes = (r.votes || 0) + 1;
        state.msg = null; ctx.refresh();
      }).catch((e) => say(e?.message === 'BACKEND_NOT_CONFIGURED'
        ? (ko ? '서버가 아직 연결되지 않았습니다' : 'Backend not connected')
        : (ko ? '실패: ' : 'Failed: ') + (e?.message || e)));
      return { handled: true };
    }

    if (name === 'req-report') {
      const r = (state.list || []).find((x) => String(x.id) === String(ds.id));
      if (!r || !v1?.requests) return { handled: true };
      readDraft();
      // 공개 게시판에 신고 수단이 없으면 안 된다 (1.0 과 같다)
      if (typeof confirm === 'function' && !confirm(ko ? '이 글을 신고할까요?' : 'Report this post?')) return { handled: true };
      v1.requests.report(r.id)
        .then(() => say(ko ? '신고했습니다' : 'Reported'))
        .catch(() => say(ko ? '신고 실패' : 'Report failed'));
      return { handled: true };
    }

    if (name === 'req-tr') {
      const r = (state.list || []).find((x) => String(x.id) === String(ds.id));
      if (!r || !v1?.translator || state.tr[r.id]) return { handled: true };
      readDraft();
      state.tr[r.id] = 'busy'; ctx.refresh();
      v1.translator.to(r.body, ko ? 'ko' : 'en').then((out) => {
        state.tr[r.id] = out?.text ? { text: out.text } : 'fail';
        ctx.refresh();
      }).catch(() => { state.tr[r.id] = 'fail'; ctx.refresh(); });
      return { handled: true };
    }
    return null;
  },

  close(ctx, state) {
    state.msg = null; state.previewBusy = false; state.submitBusy = false;
  },
};
