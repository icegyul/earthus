// EARTHUS V3 WONDER — Wonder Environment 화면 층 (PHASE 1-B/1-C)
// 종이가 펼쳐지며 지역이 살아난다: sheet(지역 지점에서 커짐) → 겹(하늘·먼 산·구름·랜드마크·땅·캐릭터)이 차례로 일어선다.
// 자산은 asset-runtime 으로만 받는다(LOD1 썸네일 → LOD2 런타임 → LOD3 인터랙션 → 반응 뒤 Story Card 가 열릴 때만 장면).
// 닫으면 지역 자산의 pin 을 풀어 LRU 예산에 맡긴다(재방문 캐시 히트). 예산을 넘으면 로더가 오래된 것부터 비운다.
import { createStage } from './stage.mjs';
import { resolveTap, resolveLongPress, resolveFart, profileOf, expandSpecial } from '../../../packages/interaction-runtime/src/index.mjs';
import { attachGestures } from './gestures.mjs';
import { coverLayout } from '../../../packages/wonder-environment/src/background-select.mjs';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * @param {HTMLElement} root  #env
 * @param {{ assets: any, contentBase: URL, log?: (s:string)=>void, reducedMotion?: () => boolean,
 *           onEarth?: () => void, onStoryOpen?: () => boolean, onStoryClose?: () => boolean, loadStories?: () => Promise<any[]> }} o
 */
export function createEnvironmentView(root, { assets, contentBase, log = () => {}, reducedMotion = () => false, onEarth = () => {}, onStoryOpen = () => true, onStoryClose = () => true, loadStories = async () => [] }) {
  root.innerHTML = `
    <div class="env-sheet" id="envSheet">
      <div class="env-layers">
        <div class="env-layer env-sky" data-layer="sky"></div>
        <div class="env-layer env-bg" data-layer="bg" aria-hidden="true"></div>
        <div class="env-layer env-far" data-layer="far"><i class="hill h1"></i><i class="hill h2"></i><i class="hill h3"></i></div>
        <div class="env-layer env-clouds" data-layer="clouds"><i class="cloud c1"></i><i class="cloud c2"></i></div>
        <div class="env-layer env-motion" data-layer="motion" aria-hidden="true"><i class="p p1"></i><i class="p p2"></i><i class="p p3"></i><i class="p p4"></i><i class="p p5"></i><i class="p p6"></i><i class="p p7"></i><i class="p p8"></i><i class="shimmer"></i><i class="veil"></i></div>
        <div class="env-layer env-landmark" data-layer="landmark"><img alt="" decoding="async"></div>
        <div class="env-layer env-ground" data-layer="ground"><i class="grass g1"></i><i class="grass g2"></i><i class="grass g3"></i></div>
        <div class="env-layer env-stage" data-layer="stage" id="envStage">
          <div id="bg" class="layer layer-bg" aria-hidden="true"></div>
          <div id="hits" class="layer layer-hits" data-discovery-ready="false" aria-hidden="true"></div>
          <div id="chars" class="layer layer-chars"></div>
          <div id="fx" class="layer layer-fx" aria-hidden="true"></div>
        </div>
      </div>
      <div class="env-label" id="envLabel" aria-live="polite"><strong id="envName"></strong><span class="env-desc"><q id="envDesc"></q><em class="story-tag">느낌 말</em></span></div>
      <button class="env-story-btn" id="envStoryBtn" type="button" hidden>📖 이야기</button>
      <div class="env-lod" id="envLod" aria-live="polite"></div>
      <section class="story-card" id="storyCard" hidden aria-label="이야기 카드" aria-live="polite">
        <div class="story-scene" id="storyScene"><span class="story-scene-wait">장면을 가져오는 중…</span></div>
        <div class="story-sec story-sec-region">
          <span class="story-k">REGION · 지역</span>
          <strong id="storyRegionName"></strong>
          <span class="story-desc"><q id="storyRegionDesc"></q><em class="story-tag">느낌 말</em></span>
          <span class="story-fact" id="storyRegionBasis"></span>
        </div>
        <div class="story-sec story-sec-char">
          <span class="story-k">CHARACTER · 친구</span>
          <strong id="storyCharName"></strong>
          <span class="story-fact" id="storyCharMeta"></span>
        </div>
        <div class="story-sec story-sec-story">
          <span class="story-k">STORY · 이야기</span>
          <h2 class="story-title" id="storyTitle"></h2>
          <p class="story-body" id="storyBody"></p>
          <p class="story-basis" id="storyBasis"></p>
        </div>
        <div class="story-actions">
          <button id="storyClose" type="button" class="story-btn">닫기</button>
          <button id="storyEarth" type="button" class="story-btn story-btn-earth">🌍 지구</button>
        </div>
      </section>
    </div>`;
  const sheet = root.querySelector('#envSheet');
  const stageRoot = root.querySelector('#envStage');
  const card = root.querySelector('#storyCard');
  const stage = createStage(stageRoot, { contentBase, reducedMotion, onLog: log, review: {} });
  const state = { open: false, envId: null, env: null, lod: 0, requests: [], row: null, profile: null, detach: null, busy: false,
    story: 'closed', storyId: null, sceneRequested: false, storyOpens: 0, lastSequence: null, background: null, motion: null };
  const bgBox = root.querySelector('.env-bg');

  /* ── Background Pack v1: 정적 그림 한 장(별도 레이어) + 모션은 CSS 레이어. 그림 안에 캐릭터·UI 를 굽지 않는다. ──
     safe-crop: 카탈로그 시트 여백(safeCropPx)이 화면에 절대 안 보이게, 그림을 '안전 상자'가 화면을 덮도록 키워 밀어 넣는다(원본 파일 그대로).
     focal(0~1) 은 안전 상자 안에서 화면 창이 어디를 보는가 — 세로 폰에서는 하늘보다 지형·전경 공간이 남게 y=0.62 기본. */
  function layoutBackground() {
    const bg = state.background, img = bgBox.querySelector('img');
    if (!bg || !img) return;
    const Cw = bgBox.clientWidth || 1, Ch = bgBox.clientHeight || 1;
    const L = coverLayout(bg, Cw, Ch);                        // 순수 계산(background-select.mjs) — node 시험이 같은 식을 검사한다
    img.style.width = `${L.w}px`; img.style.height = `${L.h}px`; img.style.left = `${L.x}px`; img.style.top = `${L.y}px`;
    state.layout = { Cw, Ch, ...L };
  }
  new ResizeObserver(layoutBackground).observe(bgBox);
  const motionClasses = m => `amb-${m.main} ${m.secondary.map(s => 'amb2-' + s).join(' ')}`;
  function setMotion(m) {
    state.motion = m;
    for (const k of [...sheet.classList]) if (k.startsWith('amb-') || k.startsWith('amb2-')) sheet.classList.remove(k);
    for (const k of motionClasses(m).split(' ').filter(Boolean)) sheet.classList.add(k);
  }
  async function applyBackground(bg) {
    bgBox.innerHTML = '';
    state.background = bg;
    if (!bg) { sheet.classList.remove('has-bg'); return false; }
    sheet.classList.add('has-bg');
    state.requests.push(bg.path);
    try {
      const e = await assets.get(bg.path, { pin: true });      // 지역 진입 때 이 한 장만 (24장 preload 없음)
      if (state.background !== bg) return false;               // 그 사이 바뀜
      const img = e.value; img.alt = ''; img.className = 'env-bg-img'; img.draggable = false;
      bgBox.innerHTML = ''; bgBox.appendChild(img); layoutBackground();
      void img.offsetWidth; img.classList.add('ready');       // rAF 가 아니라 즉시(가려진 탭에서도 나타나게) — 강제 리플로우로 페이드는 유지
      log(`배경 ${bg.id} ${bg.slug} (${bg.status}, ${Math.round(bg.bytes / 1024)}KB)`);
      return true;
    } catch (err) {
      log(`⚠ 배경 실패: ${err.message} — 종이 폴백`); if (state.background === bg) { sheet.classList.remove('has-bg'); state.background = null; }
      return false;
    }
  }
  /** 열려 있는 동안 배경만 바꾼다(지역 안 이동·검증용). 이전 배경은 pin 을 풀어 LRU 에 맡긴다. */
  async function setBackground(bg) {
    if (!state.open && !state.busy) return false;
    const prev = state.background;
    if (prev && prev.path !== bg?.path) assets.pin(prev.path, false);
    if (bg?.motion) setMotion(bg.motion); else if (state.env) setMotion(state.env.ambient);
    const ok = await applyBackground(bg);
    assets.evictToBudget();
    return ok;
  }

  const setVars = (env) => {
    const p = env.palette;
    sheet.style.setProperty('--env-sky', p.sky); sheet.style.setProperty('--env-far', p.far);
    sheet.style.setProperty('--env-mid', p.mid); sheet.style.setProperty('--env-ground', p.ground); sheet.style.setProperty('--env-ink', p.ink);
  };
  const setLod = (n, text) => { state.lod = n; root.querySelector('#envLod').textContent = text; if (stage.element) stage.element.dataset.lod = String(n); };

  async function loadCharacter(row) {
    // LOD1 썸네일 → 즉시 표시(흐리게 확대) → LOD2 런타임으로 교체 → LOD3 제스처 연결
    const el = stage.setCharacter({ ...row, art: { ...row.art, character: null } });
    el.querySelector('.placeholder')?.remove();
    // 로더가 준 <img> 요소를 그대로 붙인다 — 새 요소에 src 를 주면 no-store 환경에서 네트워크로 다시 받는다(재방문 캐시 히트가 깨진다).
    let img = null;
    try {
      if (row.art.thumb) {
        const t = await assets.get(row.art.thumb, { pin: true });
        img = t.value; img.alt = ''; img.className = 'lod1'; el.prepend(img);
        setLod(1, `${row.name} · 썸네일`); state.requests.push(row.art.thumb);
      }
      const r = await assets.get(row.art.character, { pin: true });
      const rt = r.value; rt.alt = ''; rt.className = 'lod2';
      if (img && img.parentNode === el) el.replaceChild(rt, img); else el.prepend(rt);
      img = rt; setLod(2, `${row.name}`); state.requests.push(row.art.character);
    } catch (e) {
      log(`⚠ 캐릭터 자산 실패(재시도 뒤): ${e.message} — 자리표 유지`);
      const ph = document.createElement('div'); ph.className = 'placeholder'; ph.innerHTML = `<div><strong>${row.name}</strong>그림을 받지 못했어요</div>`; el.appendChild(ph);
    }
    state.profile = profileOf(row);
    state.detach = attachGestures(el, {
      onTap: at => play('tap', resolveTap(state.profile, { reducedMotion: reducedMotion() }), at).then(ok => { if (ok) openStory(); }),
      onLongPress: at => play('longPress', resolveLongPress(state.profile, { reducedMotion: reducedMotion() }), at),
    });
    setLod(3, `${row.name} · 톡·꾹`);
    root.querySelector('#envStoryBtn').hidden = false;
    return el;
  }

  /** 반응 재생. 재생 중엔 Character Focus(환경 모션 ≈25%). 겹치지 않는다. */
  async function play(kind, seq, at) {
    if (!state.profile || stage.busy) return false;
    const expanded = expandSpecial(seq, state.profile);
    sheet.classList.add('focus');
    log(`${kind}: ${expanded.join(' → ')}`);
    state.lastSequence = { kind, seq: expanded, at: Date.now() };
    const ok = await stage.playSequence(expanded, at);
    sheet.classList.remove('focus');
    return ok;
  }

  /* ── Story Card (§13): Character Tap → Reaction → Story Card. 장면은 이때 처음 받는다. ── */
  async function openStory() {
    if (!state.open || state.story === 'open') return false;
    if (!onStoryOpen()) return false;
    state.story = 'open'; state.storyOpens++;
    sheet.classList.add('story');                       // ambient minimal
    const row = state.row, env = state.env;
    const stories = await loadStories();
    const story = stories.find(s => s.characterId === row.slug && s.locationId === env.id) ?? null;
    state.storyId = story?.storyId ?? null;
    // REGION / CHARACTER / STORY 구조. descriptor 는 <q> + "느낌 말" 표로 사실 문장과 구분하고, 자료 근거는 따로 적는다.
    root.querySelector('#storyRegionName').textContent = `${env.nameKo} · ${env.nameEn}`;
    root.querySelector('#storyRegionDesc').textContent = env.descriptorKo;
    root.querySelector('#storyRegionBasis').textContent = `자리의 근거(자료): ${env.placeBasis}`;
    const cat = { folklore: '설화', prehistoric: '화석', animal: '자연' }[row.category] ?? row.category;
    root.querySelector('#storyCharName').textContent = `${row.name} · ${cat}`;
    root.querySelector('#storyCharMeta').textContent = `${row.place_basis} · 좌표 ${row.lat.toFixed(2)}, ${row.lon.toFixed(2)}`;
    root.querySelector('#storyTitle').textContent = story?.title ?? row.name;
    root.querySelector('#storyBody').textContent = story?.body ?? row.note;
    root.querySelector('#storyBasis').textContent = story ? (story.basis === 'folklore' ? '전해 내려오는 이야기예요 (사실이 아닐 수 있어요)' : '자연에서 널리 알려진 이야기예요') : '이야기는 준비 중이에요 (지금은 소개 글)';
    const sceneBox = root.querySelector('#storyScene');
    sceneBox.innerHTML = '<span class="story-scene-wait">장면을 가져오는 중…</span>';
    card.hidden = false;
    const scenePath = story?.sceneImages?.[0] ?? row.art?.scene ?? null;
    if (scenePath) {
      try {
        const s = await assets.get(scenePath);         // lazy — 카드가 열릴 때만
        state.sceneRequested = true; state.requests.push(scenePath);
        if (state.story !== 'open') return true;
        // 캐시된 <img> 요소를 그대로 붙인다(새 요소에 src 를 주면 no-store 환경에서 다시 받는다). 닫을 때 떼어 두고 다음에 또 붙인다.
        const img = s.value; img.alt = `${row.name} 장면`;
        sceneBox.innerHTML = ''; sceneBox.appendChild(img);
      } catch (e) { sceneBox.innerHTML = '<span class="story-scene-wait">장면을 가져오지 못했어요</span>'; log(`⚠ 장면 실패: ${e.message}`); }
    } else sceneBox.innerHTML = '<span class="story-scene-wait">장면 그림이 없어요</span>';
    log(`이야기 카드 ${state.storyId ?? '(소개 글)'}`);
    return true;
  }
  function closeStory() {
    if (state.story !== 'open') return false;
    onStoryClose();
    state.story = 'closed'; card.hidden = true; sheet.classList.remove('story');
    root.querySelector('#storyScene').innerHTML = '';   // 캐시 요소를 떼어 둔다(폐기 아님)
    return true;
  }
  root.querySelector('#storyClose').addEventListener('click', closeStory);
  root.querySelector('#storyEarth').addEventListener('click', () => onEarth());
  root.querySelector('#envStoryBtn').addEventListener('click', () => { if (state.story === 'open') closeStory(); else openStory(); });

  /**
   * @param {{ env: object, row: object, landmarkPath: string|null, origin: {x:number,y:number}, plan: object }} o
   */
  async function open({ env, row = null, landmarkPath = null, origin, plan, background = null }) {
    if (state.open || state.busy) return false;
    state.busy = true; state.envId = env.id; state.env = env; state.row = row; state.requests = []; state.sceneRequested = false; state.storyId = null;
    setVars(env);
    root.querySelector('#envName').textContent = env.nameKo;
    root.querySelector('#envDesc').textContent = env.descriptorKo ?? '';
    root.querySelector('#envStoryBtn').hidden = true;
    sheet.style.setProperty('--origin-x', `${origin.x}px`); sheet.style.setProperty('--origin-y', `${origin.y}px`);
    sheet.style.setProperty('--unfold-ms', `${plan.unfoldMs}ms`); sheet.style.setProperty('--stagger-ms', `${plan.staggerMs}ms`);
    sheet.className = `env-sheet mode-${plan.mode}`;
    setMotion(background?.motion ?? env.ambient);            // 모션은 배경(팩) 배정이 우선, 없으면 환경 카탈로그 — MAIN 1 + SECONDARY ≤ 2
    root.hidden = false;
    const lmBox = root.querySelector('.env-landmark');
    lmBox.innerHTML = '';
    // Paper Unfold → Environment Background: 배경 한 장을 지금 받기 시작한다(펼침과 함께 나타남). 캐릭터·랜드마크는 별도 레이어.
    const bgP = applyBackground(background);
    // 랜드마크도 캐시된 요소를 그대로 붙인다(재방문 때 네트워크 0).
    const lmP = landmarkPath ? assets.get(landmarkPath, { pin: true }).then(e => { const im = e.value; im.alt = ''; im.classList.add('ready'); lmBox.appendChild(im); state.requests.push(landmarkPath); }).catch(e => log(`⚠ 랜드마크 실패: ${e.message}`)) : Promise.resolve();
    void sheet.offsetWidth;
    sheet.classList.add('unfolding');
    const charP = row ? loadCharacter(row) : Promise.resolve(null);   // 캐릭터는 있을 때만(지역 배경만 있는 진입은 캐릭터 없음)
    await sleep(plan.unfoldMs);
    sheet.classList.add('active');
    root.querySelector('#hits').dataset.discoveryReady = row ? 'true' : 'false';
    state.open = true; state.busy = false;
    await Promise.allSettled([bgP, lmP, charP]);
    return true;
  }

  async function close({ plan }) {
    if (!state.open || state.busy) return false;
    state.busy = true;
    if (state.story === 'open') { state.story = 'closed'; card.hidden = true; sheet.classList.remove('story'); }
    sheet.style.setProperty('--fold-ms', `${plan.foldMs}ms`);
    sheet.classList.remove('active'); sheet.classList.add('folding');
    root.querySelector('#hits').dataset.discoveryReady = 'false';
    await sleep(plan.foldMs);
    state.detach?.(); state.detach = null;
    stage.element?.remove();
    // 지역 자산은 pin 만 풀고 캐시에 둔다(재방문 캐시 히트). 예산 초과분은 로더 LRU 가 비운다.
    for (const p of new Set(state.requests)) assets.pin(p, false);
    assets.evictToBudget();
    root.querySelector('.env-landmark').innerHTML = '';     // 캐시 요소를 떼어 둔다(폐기 아님)
    bgBox.innerHTML = ''; state.background = null; sheet.classList.remove('has-bg');   // 배경도 떼어 둔다 — pin 은 위에서 풀렸고 LRU 가 예산을 관리한다
    root.querySelector('#envStoryBtn').hidden = true;
    sheet.classList.remove('unfolding', 'folding'); root.hidden = true;
    setLod(0, '');
    state.open = false; state.envId = null; state.env = null; state.row = null; state.profile = null; state.busy = false;
    return true;
  }

  /** 뿡 — 자격 있는 캐릭터만 'fart', 아니면 'reaction'(runtime 계약). 버튼은 호출부가 자격으로 숨긴다. */
  function fart() { if (!state.profile) return Promise.resolve(false); return play('fart', resolveFart(state.profile)); }
  function special() { if (!state.profile) return Promise.resolve(false); return play('special', ['special']); }

  return { open, close, fart, special, play, openStory, closeStory, setBackground, layoutBackground, stage, get state() { return state; }, get isOpen() { return state.open; }, get background() { return state.background; } };
}
