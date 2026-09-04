// Character assets share one contract in the editor, ZIP export and globe renderer.
export const SLOTS = ['master_sheet', 'runtime_3q', 'parts_atlas', 'thumbnail'];
export const PRICE = { master_sheet: 0.165, runtime_3q: 0.211, parts_atlas: 0.165 };
export const MODEL = 'gpt-image-2';
export function validId(id) { return /^[a-z][a-z0-9_-]{1,47}$/.test(id); }
export function makeId(name) {
  const slug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 36);
  return /^[a-z][a-z0-9-]+$/.test(slug) ? slug : `character-${crypto.randomUUID().slice(0, 8)}`;
}
export function files(id) {
  if (!validId(id)) throw new Error('영문 ID는 영문 소문자로 시작하는 2~48자의 영문·숫자·-·_만 사용할 수 있습니다.');
  return Object.fromEntries([...SLOTS, 'manifest'].map(s => [s, `${id}_${s}.${s === 'manifest' ? 'json' : 'png'}`]));
}
export function defaultLayers() {
  const roles = ['head', 'body', 'arm_left', 'arm_right', 'leg_left', 'leg_right'];
  const positions = [[0, .79, .42, .4], [0, .43, .43, .43], [-.27, .46, .2, .4], [.27, .46, .2, .4], [-.13, .13, .2, .28], [.13, .13, .2, .28]];
  return roles.map((role, i) => ({ id: role, role, rect: [(i % 3) / 3, Math.floor(i / 3) / 2, 1 / 3, 1 / 2],
    x: positions[i][0], y: positions[i][1], width: positions[i][2], height: positions[i][3],
    pivot: [.5, role.startsWith('arm') ? .15 : .5], depth: role === 'body' ? 0 : (i + 1) * .004, rotation: 0 }));
}
export function newCharacter() {
  return { schema_version: 1, character_id: '', name: '', prompt: '', region: '', league: '',
    placement: { lat: 37.5, lon: 127, scale: .085 }, motion: 'breathe', lod: { enter_px: 100, exit_px: 80 },
    layers: defaultLayers(), approvals: { master: '', motion: false }, assets: {}, hashes: {}, references: {},
    updated_at: new Date().toISOString(), server_revision: null };
}
export function validate(c, { complete = false } = {}) {
  const errors = [];
  if (!validId(c.character_id)) errors.push('올바른 영문 ID를 입력하세요.');
  if (!c.name?.trim() || c.name.length > 80) errors.push('캐릭터 이름은 1~80자로 입력하세요.');
  if (typeof c.prompt !== 'string' || c.prompt.length > 6000) errors.push('제작 설명은 6,000자 이내로 입력하세요.');
  const n = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
  if (!n(c.placement?.lat, -90, 90) || !n(c.placement?.lon, -180, 180) || !n(c.placement?.scale, .015, .3)) errors.push('배치 좌표 또는 크기를 확인하세요.');
  if (!['breathe', 'sway', 'wave', 'still'].includes(c.motion)) errors.push('동작을 확인하세요.');
  if (!n(c.lod?.exit_px, 20, 400) || !n(c.lod?.enter_px, 30, 500) || c.lod.enter_px <= c.lod.exit_px) errors.push('가까운 거리 전환값은 먼 거리 전환값보다 커야 합니다.');
  /* ⚠️ 파츠는 이제 **선택**이다. 122종을 손으로 잘라 넣을 수는 없고, 움직임이
     더는 파츠에 묶여 있지 않다(몸 전체 동작). 파츠가 없으면 빌보드 한 장으로
     서서 똑같이 움직인다. 있으면 가까이서 겹이 갈라진다. */
  if (!Array.isArray(c.layers) || (c.layers.length && (c.layers.length < 3 || c.layers.length > 7))) errors.push('파츠는 없거나 3~7개여야 합니다.');
  else if (c.layers.length) {
    const ids = new Set();
    for (const p of c.layers) {
      if (!/^[a-z][a-z0-9_]{0,31}$/.test(p.id) || ids.has(p.id)) errors.push('파츠 ID가 잘못되었거나 중복됩니다.');
      ids.add(p.id);
      if (!Array.isArray(p.rect) || p.rect.length !== 4 || !p.rect.every(v => n(v, 0, 1)) || p.rect[2] <= 0 || p.rect[3] <= 0 || p.rect[0] + p.rect[2] > 1.000001 || p.rect[1] + p.rect[3] > 1.000001) errors.push(`${p.id}: 잘라낼 영역을 이미지 안으로 맞추세요.`);
      if (!Array.isArray(p.pivot) || p.pivot.length !== 2 || !p.pivot.every(v => n(v, 0, 1)) || !n(p.x, -2, 2) || !n(p.y, -1, 3) || !n(p.width, .01, 2) || !n(p.height, .01, 2) || !n(p.depth, -.2, .2) || !n(p.rotation, -180, 180)) errors.push(`${p.id}: 파츠 위치·크기·회전 중심을 확인하세요.`);
    }
  }
  if (complete) {
    const need = c.layers.length ? SLOTS : SLOTS.filter(s => s !== 'parts_atlas');
    for (const slot of need) if (!c.assets[slot]) errors.push(`${slot}.png 파일이 필요합니다.`);
    if (!c.hashes.master_sheet || c.approvals.master !== c.hashes.master_sheet) errors.push('디자인 시트를 먼저 확정하세요.');
    if (c.references.runtime_3q !== c.hashes.master_sheet) errors.push('현재 디자인 시트를 기준으로 단일 이미지를 다시 등록하세요.');
    if (c.layers.length && c.references.parts_atlas !== c.hashes.runtime_3q) errors.push('현재 단일 이미지를 기준으로 파츠 시트를 다시 등록하세요.');
    if (!c.approvals.motion) errors.push('파츠와 동작을 확인한 뒤 확정하세요.');
  }
  return [...new Set(errors)];
}
export function manifest(c) {
  const { schema_version, character_id, name, prompt, region, league, placement, motion, lod, layers } = c;
  const f = files(character_id);
  // 파츠가 없으면 파일 목록에도 넣지 않는다 — 없는 파일을 받으러 가지 않게.
  if (!layers.length) delete f.parts_atlas;
  return { schema_version, character_id, name, prompt, region, league, placement, motion, lod, layers,
    moves: movesFor(c), files: f, direction: 'surface-normal-camera-facing',
    shadow: { type: 'ellipse', opacity: .22 }, updated_at: c.updated_at };
}
export function promptFor(c, slot) {
  const shared = `Create a consistent 2.5D layered paper picture-book character named ${c.name}. ${c.prompt}\nSoft paper texture, clean silhouette, no text, no watermark, no ground or cast shadow. Keep identity, colors, proportions and clothing identical to the reference. Character only, full body, no clipping.`;
  if (slot === 'master_sheet') return `${shared}\nDesign reference sheet: front, left side, back, and 3/4 views in four separate evenly spaced columns. Neutral pose. Plain ivory background. This is a design sheet, not a scene.`;
  if (slot === 'runtime_3q') return `${shared}\nUse the approved design sheet as the sole identity reference. One single 3/4-view character, centered, relaxed standing pose, entire character visible with padding. True transparent alpha background. No checkerboard painted into the image.`;
  return `${shared}\nUse the single 3/4 image as reference. Exploded paper puppet asset atlas on true transparent background. Six detached parts in an exact 3-column by 2-row grid. Top row: head, torso, character left arm. Bottom row: character right arm, left leg, right leg. Each part completely inside its own cell with padding. No labels, no assembled character. Paint hidden overlaps so rotation never reveals holes. Preserve the same 3/4 view in every part.`;
}
export function pose(p, motion, seconds, arm = 0) {
  let angle = p.rotation * Math.PI / 180, dy = 0;
  const lifts = /^(arm|wing|fin)_/.test(p.role || '');
  if (motion === 'wave' && p.role === 'arm_right') angle += .38 * Math.sin(seconds * 5);
  if (motion === 'sway') angle += .035 * Math.sin(seconds * 2);
  if (motion === 'breathe' && ['head', 'body'].includes(p.role)) dy = .008 * Math.sin(seconds * 2.4);
  // 몸 전체 동작이 팔·날개를 함께 들 때. 왼쪽과 오른쪽은 반대로 돈다.
  if (arm && lifts) angle += arm * (p.role.endsWith('_left') ? -1 : 1);
  return { angle, dy };
}

/* ── 손이 닿으면 하는 동작 ─────────────────────────────────────────
   ⚠️ 처음엔 파츠 회전으로만 움직였다. 그런데 파츠는 한 장 그림에서 잘라 만들기
      때문에 크게 움직이면 자른 자리가 드러난다. 그래서 **몸 전체를 움직인다** —
      종이 인형을 손에 들고 흔드는 것과 같은 방식이라 파츠가 없어도 성립한다.
      파츠가 있으면 팔·날개가 얹혀서 함께 움직인다.
   u 는 0→1 로 흐르는 진행도. 돌려주는 값:
      dy 위아래 · tz 좌우 기울기 · tx 앞뒤 끄덕임 · ry 제자리 돌기 · sx·sy 눌리고 늘어남 */
const easeInOut = u => u * u * (3 - 2 * u);
export const MOVES = {
  jump:   { ko: '폴짝 뛰기',   sec: 1.1, f: u => ({ dy: .34 * Math.sin(Math.PI * u), sy: 1 - .10 * Math.sin(Math.PI * u * 2) }) },
  spin:   { ko: '빙글 돌기',   sec: 1.3, f: u => ({ ry: Math.PI * 2 * easeInOut(u) }) },
  wave:   { ko: '손 흔들기',   sec: 1.6, f: u => ({ tz: .05 * Math.sin(u * Math.PI * 6) }), arm: u => .75 * Math.sin(u * Math.PI * 6) },
  nod:    { ko: '고개 끄덕',   sec: 1.0, f: u => ({ tx: .22 * Math.sin(u * Math.PI * 3), dy: -.02 * Math.abs(Math.sin(u * Math.PI * 3)) }) },
  wiggle: { ko: '살랑살랑',    sec: 1.2, f: u => ({ tz: .17 * Math.sin(u * Math.PI * 5) }) },
  bounce: { ko: '통통 튀기',   sec: 1.2, f: u => { const k = Math.abs(Math.sin(u * Math.PI * 3)); return { dy: .15 * k, sy: 1 - .11 * (1 - k) }; } },
  rear:   { ko: '앞발 들기',   sec: 1.4, f: u => { const k = Math.sin(Math.PI * u); return { tx: -.40 * k, dy: .06 * k }; } },
  flap:   { ko: '날갯짓',      sec: 1.5, f: u => ({ dy: .13 * Math.sin(u * Math.PI * 8) }), arm: u => .85 * Math.sin(u * Math.PI * 8) },
  coil:   { ko: '몸 세우기',   sec: 1.5, f: u => { const k = Math.sin(Math.PI * u); return { sy: 1 + .24 * k, sx: 1 - .11 * k, tz: .09 * Math.sin(u * Math.PI * 4) }; } },
  stomp:  { ko: '쿵쿵 걷기',   sec: 1.3, f: u => { const k = Math.abs(Math.sin(u * Math.PI * 2)); return { dy: .09 * k, sy: 1 - .13 * (1 - k), tz: .06 * Math.sin(u * Math.PI * 2) }; } },
};
export const RIG_MOVES = {
  BIPED_PAPER:     ['jump', 'spin', 'wave', 'nod', 'wiggle'],
  QUADRUPED_PAPER: ['jump', 'rear', 'nod', 'wiggle'],
  SERPENT_PAPER:   ['coil', 'wiggle', 'spin', 'nod'],
  FLYER_PAPER:     ['flap', 'jump', 'spin', 'nod'],
};
export function movesFor(c) {
  const list = Array.isArray(c?.moves) ? c.moves.filter(m => MOVES[m]) : [];
  return list.length ? list.slice(0, 6) : (RIG_MOVES[c?.league] || RIG_MOVES.BIPED_PAPER);
}
/* 몸 전체 변형. 쉬는 동안은 아주 작게, 동작 중에는 그 동작이 덮어쓴다. */
export function bodyPose(motion, seconds, move) {
  const t = { dy: 0, tz: 0, tx: 0, ry: 0, sx: 1, sy: 1, arm: 0 };
  if (motion === 'breathe') { t.sy = 1 + .016 * Math.sin(seconds * 2.4); t.dy = .004 * Math.sin(seconds * 2.4); }
  else if (motion === 'sway') t.tz = .035 * Math.sin(seconds * 1.7);
  if (move) {
    const spec = MOVES[move.id];
    if (spec) {
      const u = Math.min(1, Math.max(0, move.u));
      Object.assign(t, { ...t, ...spec.f(u) });
      if (spec.arm) t.arm = spec.arm(u);
    }
  }
  return t;
}
export async function sha256(blob) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(v => v.toString(16).padStart(2, '0')).join('');
}
// Store-only ZIP: PNGs are already compressed. UTF-8 names and CRC32 make this portable.
export async function zipFiles(entries) {
  const encoder = new TextEncoder(), chunks = [], central = []; let offset = 0;
  const crc = b => { let c = 0xffffffff; for (const v of b) { c ^= v; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (c ^ 0xffffffff) >>> 0; };
  for (const [name, blob] of entries) {
    const bytes = new Uint8Array(await blob.arrayBuffer()), filename = encoder.encode(name), checksum = crc(bytes);
    const local = new Uint8Array(30 + filename.length), l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); l.setUint16(4, 20, true); l.setUint16(6, 0x800, true); l.setUint32(14, checksum, true); l.setUint32(18, bytes.length, true); l.setUint32(22, bytes.length, true); l.setUint16(26, filename.length, true); local.set(filename, 30);
    const record = new Uint8Array(46 + filename.length), d = new DataView(record.buffer);
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x800, true); d.setUint32(16, checksum, true); d.setUint32(20, bytes.length, true); d.setUint32(24, bytes.length, true); d.setUint16(28, filename.length, true); d.setUint32(42, offset, true); record.set(filename, 46);
    chunks.push(local, bytes); central.push(record); offset += local.length + bytes.length;
  }
  const size = central.reduce((a, b) => a + b.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, entries.length, true); e.setUint16(10, entries.length, true); e.setUint32(12, size, true); e.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, end], { type: 'application/zip' });
}
// The atlas prompt asks for an exact 3x2 grid, but a model never lands a part in the middle of its
// cell. Reading the alpha channel gives the crop the picture actually has, so assembly uses measured
// parts instead of assumed ones. Roles keep the documented reading order of the atlas prompt.
export const ATLAS_ROLES = ['head', 'body', 'arm_left', 'arm_right', 'leg_left', 'leg_right'];
const ATLAS_DEPTH = { leg_left: -.008, leg_right: -.006, body: 0, arm_left: .006, arm_right: .008, head: .012 };
function alphaBox(data, width, x0, y0, x1, y1, threshold) {
  let minX = x1, minY = y1, maxX = -1, maxY = -1;
  for (let y = y0; y < y1; y++) {
    const row = y * width;
    for (let x = x0; x < x1; x++) {
      if (data[(row + x) * 4 + 3] <= threshold) continue;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
  }
  return maxX < minX ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}
export function autoLayers(data, width, height, { threshold = 40 } = {}) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v)), warnings = [];
  const cellW = width / 3, cellH = height / 2;
  const boxes = ATLAS_ROLES.map((role, i) => {
    const left = Math.round((i % 3) * cellW), top = Math.round(Math.floor(i / 3) * cellH);
    const right = Math.round((i % 3 + 1) * cellW), bottom = Math.round((Math.floor(i / 3) + 1) * cellH);
    const box = alphaBox(data, width, left, top, right, bottom, threshold);
    // A cell that is empty or nearly empty means the model skipped a part. Fall back to the cell
    // itself so the character still assembles, and say which part needs a human look.
    if (!box || box.w < cellW * .06 || box.h < cellH * .06) {
      warnings.push(role);
      return { role, x: left + cellW * .12, y: top + cellH * .12, w: cellW * .76, h: cellH * .76 };
    }
    const pad = Math.max(1, Math.round(cellW * .006));
    const x = clamp(box.x - pad, left, right - 1), y = clamp(box.y - pad, top, bottom - 1);
    return { role, x, y, w: clamp(box.w + (box.x - x) + pad, 1, right - x), h: clamp(box.h + (box.y - y) + pad, 1, bottom - y) };
  });
  const by = Object.fromEntries(boxes.map(b => [b.role, b]));
  const legPixels = Math.max(by.leg_left.h, by.leg_right.h);
  // One scale for every part keeps the picture's own proportions; the stack fills the unit height.
  const k = .94 / Math.max(1, by.head.h + by.body.h + legPixels);
  const size = b => [clamp(b.w * k, .01, 2), clamp(b.h * k, .01, 2)];
  const [bodyW, bodyH] = size(by.body), [headW, headH] = size(by.head);
  const legH = clamp(legPixels * k, .01, 2), armW = Math.max(size(by.arm_left)[0], size(by.arm_right)[0]);
  const bodyBottom = legH * .9, bodyTop = bodyBottom + bodyH, shoulder = bodyTop - bodyH * .12;
  const place = {
    head: [0, bodyTop - headH * .12 + headH / 2, [.5, .5]],
    body: [0, bodyBottom + bodyH / 2, [.5, .5]],
    arm_left: [-(bodyW / 2 + armW * .12), shoulder, [.5, .14]],
    arm_right: [bodyW / 2 + armW * .12, shoulder, [.5, .14]],
    leg_left: [-bodyW * .24, size(by.leg_left)[1] / 2, [.5, .5]],
    leg_right: [bodyW * .24, size(by.leg_right)[1] / 2, [.5, .5]],
  };
  const layers = boxes.map(b => {
    const [w, h] = size(b), [x, y, pivot] = place[b.role];
    return { id: b.role, role: b.role, rect: [b.x / width, b.y / height, b.w / width, b.h / height],
      x: clamp(x, -2, 2), y: clamp(y, -1, 3), width: w, height: h, pivot, depth: ATLAS_DEPTH[b.role], rotation: 0 };
  });
  return { layers, warnings };
}
