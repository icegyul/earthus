// EARTHUS v2 — 지구에 묻기 (개발지시서 v5.3 §17C LLM → 3D EARTH INTERACTION CONTRACT)
//
// §17C가 정한 것을 이 파일이 화면에서 지킨다.
//
// LLM이 할 수 있는 것: 질문 해석 · 우리가 이미 확보한 근거(스냅샷) 설명 ·
//   **승인된 Scene Tool 호출을 제안**하는 것.
// LLM이 할 수 없는 것: 지형/바다/구름 기하 생성 · 임의 좌표·수심 생성 ·
//   확률/원인/책임 생성 · 렌더러 직접 제어 · **장면 상태 직접 변경**.
//
// 그래서 이 모듈은 모델의 actions 를 그대로 실행하지 않는다.
//   모델 제안 → (이 파일의) 도구 검사 → main.js 가 준 orchestrator → 장면
// 이 경로만 통과한다. 승인 목록에 없는 이름, 없는 레이어 id, 범위 밖 좌표는 버리고
// **버렸다는 사실을 화면에 적는다.** 조용히 무시하면 사용자는 모델이 한 일을 오해한다.
//
// 되돌리기는 §17C의 reset_scene_to_verified_state 에 해당한다. 도구를 적용하기 전에
// 무엇이 켜져 있었는지와 카메라를 적어 두고, 한 번 눌러 그 상태로 돌아간다.
//
// 서버: /api/ask → Lambda earthus-llm (제미니 키는 Lambda 환경변수에만 있다).
// ⚠️ CloudFront OAC 뒤라 요청 본문의 SHA-256 을 x-amz-content-sha256 에 담아야 한다.
//    안 담으면 403 이다. 해시는 **실제로 보내는 바이트** 로 계산해야 한다.

const ENDPOINT = '/api/ask';
const MAX_Q = 400;

// 승인된 Scene Tool. 서버의 SCENE_TOOLS 와 정확히 같아야 한다.
const TOOLS = {
  showLayer: ['id'],
  hideLayer: ['id'],
  flyTo: ['lat', 'lon', 'altKm'],
  openCard: ['id'],
};

const T = {
  ko: {
    title: '지구에 묻기',
    hint: '지금 켜 놓은 레이어의 값만 근거로 답합니다. 화면에 없는 것은 답하지 않습니다.',
    ph: '예) 지금 이 지역에 비가 오나? 무슨 근거로?',
    ask: '묻기',
    asking: '읽는 중…',
    noLayers: '켜진 레이어가 없습니다. 왼쪽 메뉴에서 먼저 켜 주세요.',
    used: '근거로 쓴 레이어',
    did: '장면에서 한 일',
    dropped: '버린 제안',
    droppedWhy: '승인된 도구가 아니거나 없는 레이어를 가리켜서 실행하지 않았습니다',
    reset: '되돌리기',
    insufficient: '자료 부족',
    footer: (m) => `이 답은 ${m} 이(가) 위 스냅샷만 보고 쓴 것입니다. 웹 검색·기사 요약을 하지 않습니다.`,
    errRate: '조금 뒤에 다시 물어봐 주세요 (분당 12회까지).',
    errLong: `질문이 너무 깁니다 (${MAX_Q}자까지).`,
    errNet: '답을 받지 못했습니다. 값을 만들지 않고 비워 둡니다.',
    tool: {
      showLayer: (n) => `${n} 켬`,
      hideLayer: (n) => `${n} 끔`,
      flyTo: (a) => `${a.lat.toFixed(1)}°, ${a.lon.toFixed(1)}° · 고도 ${Math.round(a.altKm).toLocaleString()}km 로 이동`,
      openCard: (n) => `${n} 근거 카드 염`,
    },
  },
  en: {
    title: 'Ask the Earth',
    hint: 'Answers are grounded only in the layers you have on. It will not answer what is not on screen.',
    ph: 'e.g. Is it raining here right now, and on what evidence?',
    ask: 'Ask',
    asking: 'Reading…',
    noLayers: 'No layers are on. Turn one on from the menu first.',
    used: 'Layers used as evidence',
    did: 'What it did to the scene',
    dropped: 'Rejected proposals',
    droppedWhy: 'not an approved tool, or it pointed at a layer that does not exist',
    reset: 'Undo',
    insufficient: 'insufficient data',
    footer: (m) => `Written by ${m} from the snapshot above only. No web search, no article summarising.`,
    errRate: 'Please wait a moment (12 questions per minute).',
    errLong: `Question is too long (max ${MAX_Q} characters).`,
    errNet: 'No answer came back. Nothing is invented in its place.',
    tool: {
      showLayer: (n) => `turned on ${n}`,
      hideLayer: (n) => `turned off ${n}`,
      flyTo: (a) => `flew to ${a.lat.toFixed(1)}°, ${a.lon.toFixed(1)}° at ${Math.round(a.altKm).toLocaleString()} km`,
      openCard: (n) => `opened the evidence card for ${n}`,
    },
  },
};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function sha256Hex(bytes) {
  const d = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(d)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

export class AskEarth {
  // hooks: { lang, snapshot(), layerName(id), tools: {showLayer,hideLayer,flyTo,openCard},
  //          captureScene(), restoreScene(saved) }
  constructor(hooks) {
    this.h = hooks;
    this.t = T[hooks.lang === 'en' ? 'en' : 'ko'];
    this.saved = null;
    this.busy = false;
  }

  init() {
    const btn = document.getElementById('btn-ask');
    const box = document.getElementById('ask-drawer');
    if (!btn || !box) return;
    const t = this.t;
    box.innerHTML = `
      <div class="ask-head">${esc(t.title)}</div>
      <div class="ask-hint">${esc(t.hint)}</div>
      <div class="ask-row">
        <input type="text" id="ask-q" maxlength="${MAX_Q}" placeholder="${esc(t.ph)}" autocomplete="off" />
        <button id="ask-go">${esc(t.ask)}</button>
      </div>
      <div id="ask-out"></div>`;
    this.out = box.querySelector('#ask-out');
    const input = box.querySelector('#ask-q');
    const go = box.querySelector('#ask-go');
    go.onclick = () => this.ask(input.value);
    input.onkeydown = (e) => { if (e.key === 'Enter') this.ask(input.value); };
    btn.onclick = () => {
      const open = box.classList.toggle('open');
      btn.classList.toggle('on', open);
      if (open) { if (this.h.onOpen) this.h.onOpen(); setTimeout(() => input.focus(), 30); }
    };
    this.box = box;
    this.btn = btn;
  }

  // 언어를 바꾸면 서랍 문구와 답변 언어를 함께 갈아 끼운다.
  // (예전엔 this.t 를 지우게 해뒀는데 render() 가 그걸 쓰므로 다음 답에서 터진다.)
  setLang(lang) {
    this.h.lang = (lang === 'en') ? 'en' : 'ko';
    this.t = T[this.h.lang];
    const out = this.out ? this.out.innerHTML : '';
    this.init();
    if (out && this.out) this.out.innerHTML = out;
  }

  close() {
    if (this.box) this.box.classList.remove('open');
    if (this.btn) this.btn.classList.remove('on');
  }

  async ask(qRaw) {
    const t = this.t;
    const q = String(qRaw || '').trim();
    if (!q || this.busy) return;
    if (q.length > MAX_Q) { this.out.innerHTML = `<div class="ask-err">${esc(t.errLong)}</div>`; return; }
    const snap = this.h.snapshot();
    if (!snap.layers.length) { this.out.innerHTML = `<div class="ask-err">${esc(t.noLayers)}</div>`; return; }

    this.busy = true;
    this.out.innerHTML = `<div class="ask-wait">${esc(t.asking)}</div>`;
    try {
      // ⚠️ 해시는 실제로 보내는 바이트로 계산한다. JSON.stringify 결과를 다시 만들면
      //    같은 문자열이라도 인코딩이 어긋날 수 있어, 인코딩한 바이트를 그대로 보낸다.
      const bytes = new TextEncoder().encode(JSON.stringify({ ...snap, q, lang: this.h.lang }));
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-amz-content-sha256': await sha256Hex(bytes) },
        body: bytes,
      });
      if (res.status === 429) throw new Error(t.errRate);
      const data = await res.json();
      if (!res.ok || !data.answer) throw new Error(data.error || t.errNet);
      this.render(data);
    } catch (e) {
      this.out.innerHTML = `<div class="ask-err">${esc((e && e.message) || t.errNet)}</div>`;
    } finally {
      this.busy = false;
    }
  }

  // 모델의 제안을 검사해서 실행한다. 실행한 것과 버린 것을 모두 적는다.
  runActions(actions) {
    const t = this.t;
    const did = [];
    const dropped = [];
    if (!Array.isArray(actions) || !actions.length) return { did, dropped };
    this.saved = this.h.captureScene();
    for (const a of actions.slice(0, 6)) {
      const name = a && a.tool;
      const spec = TOOLS[name];
      if (!spec) { dropped.push(String(name || '?')); continue; }
      if (name === 'flyTo') {
        const lat = Number(a.lat); const lon = Number(a.lon); const altKm = Number(a.altKm);
        // 좌표를 지어내지 못하게 범위를 강제한다. 범위를 벗어나면 버린다.
        if (!(lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180 && altKm >= 20 && altKm <= 20000)) {
          dropped.push(`flyTo(${a.lat}, ${a.lon}, ${a.altKm})`);
          continue;
        }
        this.h.tools.flyTo(lat, lon, altKm);
        did.push(t.tool.flyTo({ lat, lon, altKm }));
        continue;
      }
      const id = String(a.id || '');
      const label = this.h.layerName(id);
      if (!label) { dropped.push(`${name}(${id || '?'})`); continue; }   // 없는 레이어는 실행하지 않는다
      this.h.tools[name](id);
      did.push(t.tool[name](label));
    }
    return { did, dropped };
  }

  render(data) {
    const t = this.t;
    const { did, dropped } = this.runActions(data.actions);
    const used = (data.used || []).map((id) => this.h.layerName(id) || id);
    let html = `<div class="ask-a${data.insufficient ? ' thin' : ''}">${esc(data.answer)}</div>`;
    if (data.insufficient) html += `<div class="ask-flag">${esc(t.insufficient)}</div>`;
    if (used.length) html += `<div class="ask-meta"><b>${esc(t.used)}</b> · ${used.map(esc).join(' · ')}</div>`;
    if (did.length) {
      html += `<div class="ask-meta"><b>${esc(t.did)}</b> · ${did.map(esc).join(' · ')}`
        + ` <button id="ask-undo">${esc(t.reset)}</button></div>`;
    }
    if (dropped.length) {
      html += `<div class="ask-meta drop"><b>${esc(t.dropped)}</b> · ${dropped.map(esc).join(' · ')}`
        + ` — ${esc(t.droppedWhy)}</div>`;
    }
    if (data.model) html += `<div class="ask-foot">${esc(t.footer(data.model))}</div>`;
    this.out.innerHTML = html;
    const undo = this.out.querySelector('#ask-undo');
    if (undo) {
      undo.onclick = () => {
        if (this.saved) this.h.restoreScene(this.saved);
        undo.disabled = true;
      };
    }
  }
}
