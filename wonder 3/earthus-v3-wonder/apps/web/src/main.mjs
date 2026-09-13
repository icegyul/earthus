// EARTHUS V3 WONDER — PHASE 0 부팅. 레지스트리·manifest·지역표를 읽고 무대와 런타임을 잇는다.
import { resolveTap, resolveLongPress, resolveFart, profileOf, expandSpecial, contextFromEnvironment } from '../../../packages/interaction-runtime/src/index.mjs';
import { resolveBackground } from '../../../packages/stage-engine/src/background-resolver.mjs';
import { createStage } from './stage.mjs';
import { attachGestures } from './gestures.mjs';

const CONTENT_BASE = new URL('../../../', import.meta.url); // earthus-v3-wonder/ 루트
const $ = s => document.querySelector(s);
const logEl = $('#log');
const lines = [];
const log = msg => { lines.push(msg); if (lines.length > 14) lines.shift(); logEl.textContent = lines.join('\n'); };

const state = { registry: null, manifest: null, regions: null, review: null, row: null, profile: null, background: null, history: [] };
let stage = null;

async function loadJson(rel) {
  const r = await fetch(new URL(rel, CONTENT_BASE));
  if (!r.ok) throw new Error(`${rel} ${r.status}`);
  return r.json();
}

function ctx() { return { reducedMotion: $('#rm').checked || contextFromEnvironment(window).reducedMotion }; }

async function run(kind, seq, at) {
  const expanded = expandSpecial(seq, state.profile);
  state.history.push({ kind, seq: expanded, at: Date.now() });
  log(`${kind}: ${expanded.join(' → ')}`);
  return stage.playSequence(expanded, at);
}

function showCard(row) {
  $('#cardCat').textContent = { folklore: '설화', prehistoric: '화석', animal: '자연' }[row.category] ?? row.category;
  $('#cardName').textContent = row.name;
  $('#cardPlace').textContent = row.place_basis ? `자리의 근거: ${row.place_basis} (${row.lat.toFixed(2)}, ${row.lon.toFixed(2)})` : `(${row.lat.toFixed(2)}, ${row.lon.toFixed(2)})`;
  $('#cardNote').textContent = row.note;
  const scene = $('#cardScene'); scene.innerHTML = '';
  if (row.art?.scene) { const img = new Image(); img.src = new URL(`content/${row.art.scene}`, CONTENT_BASE).href; img.alt = `${row.name} 장면`; scene.appendChild(img); }
  else scene.textContent = '장면 그림 변환 대기';
  $('#card').hidden = false;
}

async function selectCharacter(slug) {
  const row = state.manifest.find(m => m.slug === slug);
  if (!row) throw new Error(`없는 캐릭터: ${slug}`);
  state.row = row; state.profile = profileOf(row);
  const bg = resolveBackground(state.regions, row.lat, row.lon);
  state.background = bg;
  log(`캐릭터 ${row.name}(${row.slug}) · special=${row.interaction.special} · fart=${row.interaction.fart}`);
  log(`배경 선택 ${bg.id} (${bg.reason}${bg.distance_km != null ? `, ${bg.distance_km}km` : ''})`);
  $('#btnFart').hidden = !state.profile.fartEnabled;
  $('#card').hidden = true;
  const el = stage.setCharacter(row);
  attachGestures(el, {
    onTap: at => run('tap', resolveTap(state.profile, ctx()), at).then(ok => { if (ok) showCard(row); }),
    onLongPress: at => run('longPress', resolveLongPress(state.profile, ctx()), at),
  });
  try { await stage.setBackground(bg.id); } catch (e) { log(`⚠ ${e.message}`); }
  document.title = `EARTHUS WONDER · ${row.name}`;
}

async function boot() {
  try {
    [state.registry, state.manifest, state.regions, state.review] = await Promise.all([
      loadJson('content/registry/asset-registry.json'),
      loadJson('content/characters/manifest-124.json'),
      loadJson('content/backgrounds/regions.json'),
      loadJson('content/pack-1.8/background-review.json'),
    ]);
  } catch (e) {
    log(`✗ 부팅 실패: ${e.message}`); $('#phase').textContent = '부팅 실패'; throw e;
  }
  stage = createStage($('#stage'), {
    contentBase: CONTENT_BASE,
    reducedMotion: () => $('#rm').checked || contextFromEnvironment(window).reducedMotion,
    onLog: log,
    review: state.review.backgrounds,
  });
  window.__wonder.stage = stage;
  const c = state.registry.counts;
  log(`레지스트리 ${c.assets} 자산 · 배경 ${c.backgrounds}(사용 가능 ${c.backgrounds_usable}) · FX ${c.fx} · 그림 준비 ${c.characters_ready}/124`);
  const pick = $('#pick');
  const sorted = [...state.manifest].sort((a, b) => (a.art.status === 'ready' ? 0 : 1) - (b.art.status === 'ready' ? 0 : 1) || a.index - b.index);
  for (const m of sorted) {
    const o = document.createElement('option');
    o.value = m.slug; o.textContent = `${m.art.status === 'ready' ? '● ' : '○ '}${m.name}`;
    pick.appendChild(o);
  }
  pick.addEventListener('change', () => selectCharacter(pick.value));
  $('#btnTap').addEventListener('click', () => run('tap', resolveTap(state.profile, ctx())).then(ok => { if (ok) showCard(state.row); }));
  $('#btnLong').addEventListener('click', () => run('longPress', resolveLongPress(state.profile, ctx())));
  $('#btnFart').addEventListener('click', () => run('fart', resolveFart(state.profile)));
  $('#cardClose').addEventListener('click', () => { $('#card').hidden = true; });
  $('#rm').addEventListener('change', () => document.body.classList.toggle('reduced-motion', $('#rm').checked));
  await selectCharacter(sorted[0].slug);
  $('#phase').textContent = 'PHASE 0 · 기반 · 준비됨';
}

// 검증용 손잡이 (브라우저 도구가 상태를 읽는다). 운영 기능이 아니다.
window.__wonder = { state, stage: null, run, selectCharacter, resolveTap, resolveLongPress, resolveFart };
boot().catch(e => console.error(e));
