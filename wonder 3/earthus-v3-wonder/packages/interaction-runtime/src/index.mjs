// EARTHUS V3 WONDER — Interaction Runtime (PHASE 0)
//
// 팩 1.8 의 `contract/wonder-interaction-engine.ts` 를 브라우저·Node 가 그대로 실행하는 ESM 으로 옮긴 것.
// 계약(TS)은 원본 그대로 옆에 두고, 이 파일이 실행체다. 둘의 동작이 다르면 tests/ 가 잡는다.
//
// 이 런타임은 **전신 스프라이트 폴백**을 전제로 한다. wave/point 는 동작 계약 + FX 이지
// 팔·손 관절이 실제로 움직인다는 뜻이 아니다 (docs/INTERACTION_ASSET_STATUS.md).
// 관절 파츠가 아트 파이프라인에서 오기 전까지 "124종 관절 애니메이션 완료" 라고 말하지 않는다.

/** @typedef {'wave'|'point'|'fart'|'special'|'greet'|'focus'|'look'|'jump'|'nod'|'wiggle'|'reaction'} WonderAction */

export const ACTIONS = Object.freeze(['wave', 'point', 'fart', 'special', 'greet', 'focus', 'look', 'jump', 'nod', 'wiggle', 'reaction']);

// 124종 manifest 의 `moves` 어휘 (기존 캐릭터 규약과 같은 10개 — 값만 채택, 코드는 새로 씀).
export const MOVES = Object.freeze(['jump', 'spin', 'wave', 'nod', 'wiggle', 'bounce', 'rear', 'flap', 'coil', 'stomp']);
export const LEAGUES = Object.freeze(['BIPED_PAPER', 'QUADRUPED_PAPER', 'SERPENT_PAPER', 'FLYER_PAPER']);
export const CATEGORIES = Object.freeze(['folklore', 'prehistoric', 'animal']);
const SLUG_RE = /^[a-z][a-z0-9-]{1,47}$/;

/**
 * @typedef {object} CharacterInteractionProfile
 * @property {string} id
 * @property {WonderAction[]} actions
 * @property {boolean} fartEnabled
 * @property {string} special          // manifest 의 special — moves 어휘(jump/wiggle/wave/flap …)
 * @property {'sprite-reaction'} fallback
 */

/** @typedef {{ reducedMotion?: boolean, focused?: boolean }} InteractionContext */

// ── 계약과 1:1 인 세 해석기 ─────────────────────────────────────────────

/** @param {CharacterInteractionProfile} profile @param {InteractionContext} [ctx] */
export function resolveTap(profile, ctx = {}) {
  const seq = ['greet'];
  if (!ctx.reducedMotion) seq.push(profile.special);
  else seq.push('reaction');
  return seq;
}

/** @param {CharacterInteractionProfile} profile @param {InteractionContext} [ctx] */
export function resolveLongPress(profile, ctx = {}) {
  if (ctx.reducedMotion) return ['focus'];
  return ['focus', profile.special === 'point' ? 'look' : 'point'];
}

/** @param {CharacterInteractionProfile} profile */
export function resolveFart(profile) {
  return profile.fartEnabled ? ['fart'] : ['reaction'];
}

/**
 * 동작 → FX 파일. 계약은 절대경로 `/assets/interaction/fx/…` 를 돌려주지만 새 빌드는 배포 루트를
 * 아직 정하지 않았으므로 **상대 id** 를 돌려주고 호출부가 base 를 붙인다.
 * @param {string} action @returns {string|null}
 */
export function getFx(action) {
  switch (action) {
    case 'wave': return 'wave-lines.svg';
    case 'point': return 'point-glow.svg';
    case 'fart': return 'fart-cloud.svg';
    case 'special':
    case 'reaction':
    case 'greet': return 'sparkle.svg';
    default: return null;
  }
}

// ── manifest 정규화·검증 ────────────────────────────────────────────────
// 팩 1.8 JSON 은 lat/lon 이 문자열이고 moves 가 쉼표 문자열이다. 기존 manifest 는 숫자·배열이다.
// 여기서 한 모양으로 맞춘다. 잘못된 항목은 그 하나만 빼고 계속한다 — 하나 때문에 123종을 버리지 않는다.

/** @param {any} raw */
export function normalizeEntry(raw) {
  const lat = typeof raw.lat === 'number' ? raw.lat : Number.parseFloat(raw.lat);
  const lon = typeof raw.lon === 'number' ? raw.lon : Number.parseFloat(raw.lon);
  const moves = Array.isArray(raw.moves) ? raw.moves.slice()
    : typeof raw.moves === 'string' ? raw.moves.split(',').map(s => s.trim()).filter(Boolean) : [];
  const it = raw.interaction ?? {};
  return {
    slug: raw.slug,
    name: raw.name,
    category: raw.category,
    league: raw.league,
    lat, lon,
    moves,
    note: raw.note ?? '',
    interaction: {
      tap: Array.isArray(it.tap) ? it.tap.slice() : [],
      longPress: Array.isArray(it.longPress) ? it.longPress.slice() : [],
      special: it.special,
      fart: it.fart === true,
      fartStyle: it.fart === true ? (it.fartStyle ?? null) : null,
      fallback: it.fallback ?? 'sprite-reaction',
    },
  };
}

/**
 * @param {any[]} list  팩 JSON 배열(또는 이미 정규화된 배열)
 * @returns {{ rows: ReturnType<typeof normalizeEntry>[], errors: {slug:string, reason:string}[], counts: Record<string,number> }}
 */
export function validateManifest(list) {
  const errors = [], rows = [];
  const counts = { folklore: 0, prehistoric: 0, animal: 0 };
  const seenSlug = new Set(), seenName = new Set();
  if (!Array.isArray(list)) return { rows, errors: [{ slug: '*', reason: '배열이 아니다' }], counts };
  for (const raw of list) {
    const c = normalizeEntry(raw ?? {});
    const tag = typeof c.slug === 'string' && c.slug ? c.slug : '#?';
    const fail = reason => { errors.push({ slug: tag, reason }); };
    if (typeof c.slug !== 'string' || !SLUG_RE.test(c.slug)) { fail('slug 형식'); continue; }
    if (seenSlug.has(c.slug)) { fail('slug 중복'); continue; }
    if (typeof c.name !== 'string' || !c.name.trim()) { fail('이름 없음'); continue; }
    if (seenName.has(c.name)) { fail(`이름 중복: ${c.name}`); continue; }
    if (!CATEGORIES.includes(c.category)) { fail(`분류: ${c.category}`); continue; }
    if (!LEAGUES.includes(c.league)) { fail(`리그: ${c.league}`); continue; }
    if (!Number.isFinite(c.lat) || !Number.isFinite(c.lon) || c.lat < -90 || c.lat > 90 || c.lon < -180 || c.lon > 180) { fail('좌표 범위'); continue; }
    if (c.moves.length < 3 || c.moves.length > 5) { fail(`동작 개수 ${c.moves.length}`); continue; }
    const badMove = c.moves.find(m => !MOVES.includes(m));
    if (badMove) { fail(`허용되지 않은 동작: ${badMove}`); continue; }
    const it = c.interaction;
    if (typeof it.special !== 'string' || !c.moves.includes(it.special)) { fail(`special 이 moves 에 없음: ${it.special}`); continue; }
    if (!it.tap.length || it.tap[0] !== 'greet') { fail('tap 은 greet 로 시작해야 한다'); continue; }
    if (!it.longPress.length || it.longPress[0] !== 'focus') { fail('longPress 는 focus 로 시작해야 한다'); continue; }
    const badTap = [...it.tap, ...it.longPress].find(a => !ACTIONS.includes(a) && !MOVES.includes(a));
    if (badTap) { fail(`알 수 없는 동작: ${badTap}`); continue; }
    if (it.fart && !it.fartStyle) { fail('fart:true 인데 fartStyle 없음'); continue; }
    if (it.fallback !== 'sprite-reaction') { fail(`fallback: ${it.fallback}`); continue; }
    seenSlug.add(c.slug); seenName.add(c.name); counts[c.category]++;
    rows.push(c);
  }
  return { rows, errors, counts };
}

/** 정규화된 행 → 계약의 프로필. @param {ReturnType<typeof normalizeEntry>} row @returns {CharacterInteractionProfile} */
export function profileOf(row) {
  const actions = new Set(['greet', 'focus', 'point', 'reaction']);
  for (const m of row.moves) if (ACTIONS.includes(m)) actions.add(m);
  for (const a of [...row.interaction.tap, ...row.interaction.longPress]) if (a !== 'special') actions.add(a);
  if (row.interaction.fart) actions.add('fart');
  return {
    id: row.slug,
    actions: [...actions],
    fartEnabled: row.interaction.fart,
    special: row.interaction.special,
    fallback: 'sprite-reaction',
  };
}

/**
 * 시퀀스의 'special' 을 실제 동작 이름으로 푼다. 화면 층은 이 결과만 본다.
 * @param {(WonderAction|string)[]} seq @param {CharacterInteractionProfile} profile
 */
export function expandSpecial(seq, profile) {
  return seq.map(a => (a === 'special' ? profile.special : a));
}

/** 브라우저 컨텍스트를 만든다. Node 에서는 reducedMotion=false. */
export function contextFromEnvironment(win = globalThis) {
  let reducedMotion = false;
  try { reducedMotion = !!win.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches; } catch { /* Node */ }
  return { reducedMotion };
}
