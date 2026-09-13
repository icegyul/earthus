// EARTHUS V3 WONDER — 무대 (PHASE 0)
// 겹: 배경(한 장, 지연 로드, ambient 1) → 발견 영역(비어 있음, PHASE 1) → 캐릭터(전신 빌보드) → FX(팩 SVG inline).
// 동작은 몸 전체 CSS 변형이다. 관절 파츠가 아니다.
import { getFx } from '../../../packages/interaction-runtime/src/index.mjs';

const DUR = { greet: 500, jump: 600, wiggle: 600, wave: 700, flap: 600, nod: 500, spin: 700, bounce: 1000, rear: 600, coil: 800, stomp: 500,
  focus: 400, point: 700, look: 600, fart: 800, reaction: 400 };
const FX_AT = { greet: 'head', wave: 'hand', point: 'pointer', fart: 'rear', reaction: 'head', special: 'head' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const svgCache = new Map();

export function createStage(root, { contentBase, reducedMotion = () => false, onLog = () => {}, review = {} }) {
  const bgLayer = root.querySelector('#bg'), charLayer = root.querySelector('#chars'), fxLayer = root.querySelector('#fx');
  let bgImg = null, bgId = null, bgUsed = false, charEl = null, current = null, busy = false, focusTimer = null;

  /** 검수 불합격 배경은 그리지 않는다 — 종이 바탕만. 팩 파일은 그대로 두고 화면에서만 뺀다. */
  function clearBackground() {
    if (bgImg) { const old = bgImg; old.classList.add('leaving'); setTimeout(() => old.remove(), 700); bgImg = null; }
    bgUsed = false;
  }

  async function fxSvg(name) {
    if (!svgCache.has(name)) {
      const p = fetch(new URL(`content/pack-1.8/fx/${name}`, contentBase)).then(r => { if (!r.ok) throw new Error(`fx ${name} ${r.status}`); return r.text(); });
      svgCache.set(name, p);
    }
    return svgCache.get(name);
  }

  /** 배경 한 장. 같은 배경이면 아무것도 안 한다. 이전 배경은 새 것이 뜬 뒤 지운다. */
  function setBackground(id) {
    if (id === bgId) return Promise.resolve(false);
    const v = review[id];
    if (v && v.verdict !== 'ok') {
      clearBackground(); bgId = id;
      onLog(`배경 ${id} 검수 불합격(${v.category}) — 종이 바탕`);
      return Promise.resolve({ id, used: false, reason: v.category });
    }
    const url = new URL(`content/pack-1.8/backgrounds/${id}.webp`, contentBase).href;
    const img = new Image();
    img.className = 'bg'; img.decoding = 'async'; img.alt = '';
    const old = bgImg; bgImg = img; bgId = id;
    return new Promise((resolve, reject) => {
      img.onload = () => {
        bgLayer.appendChild(img);
        requestAnimationFrame(() => img.classList.add('ready'));
        if (old) { old.classList.add('leaving'); setTimeout(() => old.remove(), 700); }
        bgUsed = true;
        onLog(`배경 ${id} (${(img.naturalWidth)}×${img.naturalHeight})`);
        resolve({ id, used: true });
      };
      img.onerror = () => { bgImg = old; bgId = old ? bgId : null; reject(new Error(`배경 로드 실패: ${id}`)); };
      img.src = url;
    });
  }

  /** 캐릭터 한 명. art 가 없으면 "변환 대기" 종이 자리표. */
  function setCharacter(row) {
    if (charEl) charEl.remove();
    current = row;
    const el = document.createElement('div');
    el.className = 'char'; el.tabIndex = 0; el.dataset.slug = row.slug;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `${row.name} — 톡 누르면 인사, 꾹 누르면 가리키기`);
    if (row.art?.character) {
      const img = new Image();
      img.src = new URL(`content/${row.art.character}`, contentBase).href;
      img.alt = ''; img.decoding = 'async';
      img.onload = () => onLog(`캐릭터 ${row.slug} 그림 ${img.naturalWidth}×${img.naturalHeight}`);
      img.onerror = () => onLog(`⚠ 캐릭터 그림 로드 실패: ${row.art.character}`);
      el.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'placeholder';
      ph.innerHTML = `<div><strong>${row.name}</strong>그림 변환 대기<br><small>${row.league} · ${row.category}</small></div>`;
      el.appendChild(ph);
    }
    const sh = document.createElement('div'); sh.className = 'shadow'; el.appendChild(sh);
    charLayer.appendChild(el);
    charEl = el;
    return el;
  }

  function anchor(where, at) {
    const r = charEl.getBoundingClientRect();
    switch (where) {
      case 'head': return { x: r.left + r.width * .5, y: r.top + r.height * .18 };
      case 'hand': return { x: r.left + r.width * .82, y: r.top + r.height * .42 };
      case 'rear': return { x: r.left + r.width * .22, y: r.top + r.height * .78 };
      case 'pointer': return at ?? { x: r.left + r.width * .5, y: r.top + r.height * .5 };
      default: return { x: r.left + r.width * .5, y: r.top + r.height * .5 };
    }
  }

  async function spawnFx(action, at) {
    const name = getFx(action);
    if (!name) return null;
    const el = document.createElement('div');
    el.className = `fx fx-${action}`; el.dataset.action = action;
    const p = anchor(FX_AT[action] ?? 'center', at);
    el.style.left = `${p.x}px`; el.style.top = `${p.y}px`;
    try { el.innerHTML = await fxSvg(name); } catch (e) { onLog(`⚠ ${e.message}`); return null; }
    fxLayer.appendChild(el);
    setTimeout(() => el.remove(), 1200);
    return el;
  }

  /** 동작 하나를 재생하고 끝날 때까지 기다린다. */
  async function play(action, at) {
    if (!charEl) return;
    const rm = reducedMotion();
    const ms = rm ? 120 : (DUR[action] ?? 500);
    if (action === 'point' || action === 'look') {
      const r = charEl.getBoundingClientRect();
      const dir = at && at.x < r.left + r.width / 2 ? -1 : 1;
      charEl.style.setProperty('--lean', `${dir * 6}deg`); charEl.style.setProperty('--lean-x', `${dir * 3}%`);
    }
    if (action === 'focus') {
      root.classList.add('focused'); charEl.classList.add('focused');
      clearTimeout(focusTimer);
      focusTimer = setTimeout(() => { root.classList.remove('focused'); charEl?.classList.remove('focused'); }, 1800);
    }
    charEl.classList.remove(...[...charEl.classList].filter(c => c.startsWith('anim-')));
    void charEl.offsetWidth; // 같은 동작 연속 재생 시 애니메이션 재시작
    charEl.classList.add(`anim-${action}`);
    const fx = spawnFx(action, at);
    onLog(`▶ ${action}${rm ? ' (움직임 줄임)' : ''}`);
    await Promise.all([sleep(ms), fx]);
    charEl.classList.remove(`anim-${action}`);
  }

  /** 시퀀스를 차례로. 재생 중 재입력은 무시한다(겹치지 않는다). */
  async function playSequence(seq, at) {
    if (busy) { onLog('… 재생 중이라 무시'); return false; }
    busy = true;
    try { for (const a of seq) await play(a, at); } finally { busy = false; }
    return true;
  }

  return { setBackground, clearBackground, setCharacter, play, playSequence, anchor, get busy() { return busy; }, get current() { return current; }, get backgroundId() { return bgId; }, get backgroundUsed() { return bgUsed; }, get element() { return charEl; } };
}
