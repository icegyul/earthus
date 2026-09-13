// EARTHUS V3 WONDER — Wonder Environment 화면 층 (PHASE 1-B)
// 종이가 펼쳐지며 지역이 살아난다: sheet(지역 지점에서 커짐) → 겹(하늘·먼 산·구름·랜드마크·땅·캐릭터)이 차례로 일어선다.
// 자산은 asset-runtime 으로만 받는다(LOD1 썸네일 → LOD2 런타임 → LOD3 인터랙션). 닫으면 지역 자산을 내린다.
import { createStage } from './stage.mjs';
import { resolveTap, resolveLongPress, resolveFart, profileOf, expandSpecial } from '../../../packages/interaction-runtime/src/index.mjs';
import { attachGestures } from './gestures.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const LAYERS = ['sky', 'far', 'clouds', 'landmark', 'ground', 'stage'];

/**
 * @param {HTMLElement} root  #env
 * @param {{ assets: import('../../../packages/asset-runtime/src/loader.mjs').createAssetRuntime extends (...a:any)=>infer R ? R : any, contentBase: URL, log?: (s:string)=>void, reducedMotion?: () => boolean }} o
 */
export function createEnvironmentView(root, { assets, contentBase, log = () => {}, reducedMotion = () => false }) {
  root.innerHTML = `
    <div class="env-sheet" id="envSheet">
      <div class="env-layers">
        <div class="env-layer env-sky" data-layer="sky"></div>
        <div class="env-layer env-far" data-layer="far"><i class="hill h1"></i><i class="hill h2"></i><i class="hill h3"></i></div>
        <div class="env-layer env-clouds" data-layer="clouds"><i class="cloud c1"></i><i class="cloud c2"></i></div>
        <div class="env-layer env-landmark" data-layer="landmark"><img alt="" decoding="async"></div>
        <div class="env-layer env-ground" data-layer="ground"><i class="grass g1"></i><i class="grass g2"></i><i class="grass g3"></i></div>
        <div class="env-layer env-stage" data-layer="stage" id="envStage">
          <div id="bg" class="layer layer-bg" aria-hidden="true"></div>
          <div id="hits" class="layer layer-hits" data-discovery-ready="false" aria-hidden="true"></div>
          <div id="chars" class="layer layer-chars"></div>
          <div id="fx" class="layer layer-fx" aria-hidden="true"></div>
        </div>
      </div>
      <div class="env-label" id="envLabel" aria-live="polite"><strong id="envName"></strong><span id="envDesc"></span></div>
      <div class="env-lod" id="envLod" aria-live="polite"></div>
    </div>`;
  const sheet = root.querySelector('#envSheet');
  const stageRoot = root.querySelector('#envStage');
  const stage = createStage(stageRoot, { contentBase, reducedMotion, onLog: log, review: {} });
  const state = { open: false, envId: null, lod: 0, requests: [], row: null, profile: null, detach: null, busy: false };

  const setVars = (env) => {
    const p = env.palette;
    sheet.style.setProperty('--env-sky', p.sky); sheet.style.setProperty('--env-far', p.far);
    sheet.style.setProperty('--env-mid', p.mid); sheet.style.setProperty('--env-ground', p.ground); sheet.style.setProperty('--env-ink', p.ink);
  };
  const setLod = (n, text) => { state.lod = n; root.querySelector('#envLod').textContent = text; };

  async function loadCharacter(row) {
    // LOD1 썸네일 → 즉시 표시(흐리게 확대) → LOD2 런타임으로 교체 → LOD3 제스처 연결
    const el = stage.setCharacter({ ...row, art: { ...row.art, character: null } });   // 자리표로 시작 (이미지 없이)
    el.querySelector('.placeholder')?.remove();
    const img = new Image(); img.alt = ''; img.decoding = 'async'; img.className = 'lod1'; el.prepend(img);
    try {
      if (row.art.thumb) {
        const t = await assets.get(row.art.thumb);
        img.src = t.value.src; setLod(1, `${row.name} · 썸네일`); state.requests.push(row.art.thumb);
      }
      const r = await assets.get(row.art.character);
      img.src = r.value.src; img.className = 'lod2'; setLod(2, `${row.name}`); state.requests.push(row.art.character);
    } catch (e) {
      log(`⚠ 캐릭터 자산 실패(재시도 뒤): ${e.message} — 자리표 유지`);
      const ph = document.createElement('div'); ph.className = 'placeholder'; ph.innerHTML = `<div><strong>${row.name}</strong>그림을 받지 못했어요</div>`; el.appendChild(ph);
    }
    state.profile = profileOf(row);
    state.detach = attachGestures(el, {
      onTap: at => play('tap', resolveTap(state.profile, { reducedMotion: reducedMotion() }), at),
      onLongPress: at => play('longPress', resolveLongPress(state.profile, { reducedMotion: reducedMotion() }), at),
    });
    setLod(3, `${row.name} · 톡·꾹`);
    return el;
  }

  async function play(kind, seq, at) {
    const expanded = expandSpecial(seq, state.profile);
    sheet.classList.add('focus');                       // Character Focus: 환경 모션 ≈ 20~30%
    log(`${kind}: ${expanded.join(' → ')}`);
    const ok = await stage.playSequence(expanded, at);
    sheet.classList.remove('focus');
    return ok;
  }

  /**
   * @param {{ env: object, row: object, landmarkPath: string|null, origin: {x:number,y:number}, plan: object }} o
   */
  async function open({ env, row, landmarkPath, origin, plan }) {
    if (state.open || state.busy) return false;
    state.busy = true; state.envId = env.id; state.row = row; state.requests = [];
    setVars(env);
    root.querySelector('#envName').textContent = env.nameKo;
    root.querySelector('#envDesc').textContent = env.descriptorKo;
    sheet.style.setProperty('--origin-x', `${origin.x}px`); sheet.style.setProperty('--origin-y', `${origin.y}px`);
    sheet.style.setProperty('--unfold-ms', `${plan.unfoldMs}ms`); sheet.style.setProperty('--stagger-ms', `${plan.staggerMs}ms`);
    sheet.className = `env-sheet mode-${plan.mode} amb-${env.ambient.main} ${env.ambient.secondary.map(s => 'amb2-' + s).join(' ')}`;
    root.hidden = false;
    // 랜드마크(지역 지연 로드) — 실패해도 환경은 열린다(랜드마크 없이)
    const lmImg = root.querySelector('.env-landmark img');
    lmImg.removeAttribute('src'); lmImg.classList.remove('ready');
    const lmP = landmarkPath ? assets.get(landmarkPath).then(e => { lmImg.src = e.value.src; lmImg.classList.add('ready'); state.requests.push(landmarkPath); }).catch(e => log(`⚠ 랜드마크 실패: ${e.message}`)) : Promise.resolve();
    // 펼치기 시작
    void sheet.offsetWidth;
    sheet.classList.add('unfolding');
    const charP = loadCharacter(row);
    await sleep(plan.unfoldMs);
    sheet.classList.add('active');
    root.querySelector('#hits').dataset.discoveryReady = 'true';
    state.open = true; state.busy = false;
    await Promise.allSettled([lmP, charP]);
    return true;
  }

  async function close({ plan }) {
    if (!state.open || state.busy) return false;
    state.busy = true;
    sheet.style.setProperty('--fold-ms', `${plan.foldMs}ms`);
    sheet.classList.remove('active'); sheet.classList.add('folding');
    root.querySelector('#hits').dataset.discoveryReady = 'false';
    await sleep(plan.foldMs);
    state.detach?.(); state.detach = null;
    stage.element?.remove();
    // 지역 자산 내리기(런타임·장면·랜드마크). 썸네일은 작아서 지구 스프라이트용으로 남긴다.
    const row = state.row;
    if (row?.art?.character) assets.unload(row.art.character);
    if (row?.art?.scene) assets.unload(row.art.scene);
    const lm = root.querySelector('.env-landmark img'); lm.removeAttribute('src');
    for (const p of state.requests) if (p.startsWith('landmarks/')) assets.unload(p);
    sheet.classList.remove('unfolding', 'folding'); root.hidden = true;
    setLod(0, '');
    state.open = false; state.envId = null; state.row = null; state.busy = false;
    return true;
  }

  /** 뿡 등 외부 버튼용 */
  function fart() { if (!state.profile) return Promise.resolve(false); return play('fart', resolveFart(state.profile)); }

  return { open, close, fart, stage, get state() { return state; }, get isOpen() { return state.open; } };
}
