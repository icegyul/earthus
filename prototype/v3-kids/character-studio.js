import { newCharacter, files, makeId, validate, manifest, defaultLayers, autoLayers, promptFor, pose, sha256, zipFiles, SLOTS, PRICE } from './character-core.js';
import { CHARACTER_API_URL } from './character-config.js';
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const LOCAL = ['127.0.0.1', 'localhost'].includes(location.hostname) && new URLSearchParams(location.search).get('preview') === '1';
const endpoint = LOCAL ? '/__character-api' : CHARACTER_API_URL;
let c = newCharacter(), db, client, apiReady = false, imageReady = false, selected = 0, uploadSlot, busy = false, timer, playingUntil = 0, animationFrame = 0, previews = new Map(), images = {}, urls = {}, libraryUrls = [], dirty = false, pendingJob = null, auto = null;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const AUTO_PRICE = PRICE.master_sheet + PRICE.runtime_3q + PRICE.parts_atlas;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(timer); timer = setTimeout(() => $('#toast').classList.remove('show'), 6500); }
async function run(fn) {
  if (busy) return; busy = true; $('#app').inert = true;
  try { await fn(); } catch (e) { toast(e.message || '작업을 완료하지 못했습니다.'); }
  finally { busy = false; $('#app').inert = false; refresh(); }
}
async function api(action, data = {}) {
  if (!endpoint) throw new Error('제작 서버 연결 전입니다. 브라우저 저장과 ZIP 내보내기를 사용할 수 있습니다.');
  const token = LOCAL ? '' : (await client.auth.getSession()).data?.session?.access_token;
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ action, ...data }) });
  let result; try { result = await response.json(); } catch { throw new Error('서버 응답을 읽지 못했습니다.'); }
  if (!response.ok) { const error = new Error(result.error || `서버 요청 실패 (${response.status})`); error.status = response.status; throw error; }
  return result;
}
async function openDb() {
  db = await new Promise((resolve, reject) => { const req = indexedDB.open('earthus-paper-characters', 1); req.onupgradeneeded = () => req.result.createObjectStore('drafts', { keyPath: 'character_id' }); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
async function dbOp(mode, op) {
  return new Promise((resolve, reject) => { const tx = db.transaction('drafts', mode), req = op(tx.objectStore('drafts')); let result; req.onsuccess = () => result = req.result; tx.oncomplete = () => resolve(result); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
}
function collect() {
  for (const id of ['name', 'character_id', 'prompt', 'region', 'league', 'motion']) c[id] = $(`#${id}`).value;
  for (const k of ['lat', 'lon', 'scale']) c.placement[k] = Number($(`#${k}`).value);
  for (const k of ['enter_px', 'exit_px']) c.lod[k] = Number($(`#${k}`).value);
  c.updated_at = new Date().toISOString();
}
function markDirty() { dirty = true; $('#saveState').textContent = '저장하지 않은 변경사항'; }
function fill() {
  for (const id of ['name', 'character_id', 'prompt', 'region', 'league', 'motion']) $(`#${id}`).value = c[id];
  for (const k of ['lat', 'lon', 'scale']) $(`#${k}`).value = c.placement[k];
  for (const k of ['enter_px', 'exit_px']) $(`#${k}`).value = c.lod[k];
  $('#autoLat').value = c.placement.lat; $('#autoLon').value = c.placement.lon;
  $('#character_id').disabled = !!c.locked_id; selected = 0; fillParts(); refresh();
}
function refresh() {
  $('#app').inert = !!pendingJob || !!auto;
  $('#title').textContent = c.name || '새로운 친구 만들기';
  $('#estimate').textContent = `$${PRICE[$('#generateSlot').value].toFixed(3)}`;
  $('#generate').disabled = !imageReady || !!pendingJob || !!auto;
  $('#generate').textContent = pendingJob ? '이미지 제작 중…' : imageReady ? '이미지 생성하기' : '이미지 생성 연결 대기';
  $('#autoRun').disabled = !imageReady || !!pendingJob || !!auto;
  $('#autoRun').textContent = auto ? '자동 제작 중…' : imageReady ? `한 번에 만들기 · 예상 $${AUTO_PRICE.toFixed(3)}` : '이미지 생성 연결 대기';
  $('#saveServer').disabled = !apiReady; $('#publish').disabled = !apiReady; $('#unpublish').disabled = !apiReady || !c.published_revision;
  $('#approvalState').textContent = c.approvals.master && c.approvals.master === c.hashes.master_sheet ? '✓ 디자인 시트 확정됨' : '디자인 시트를 확인한 뒤 확정해 주세요.';
  $('#usage').textContent = `AI 생성 ${c.generation_count || 0} / 12회 · 누적 출력 예상 $${Number(c.estimated_output_usd || 0).toFixed(3)} · 입력 비용 별도`;
  const errors = validate(c, { complete: true }); $('#checklist').textContent = errors.length ? errors.map(s => `○ ${s}`).join('\n') : '✓ 디자인 확정\n✓ 단일 이미지와 파츠 준비\n✓ 움직임 확인\n지구에 적용할 준비가 되었습니다.';
  try { $('#manifest').textContent = `characters/${c.character_id}/\n${Object.values(files(c.character_id)).map(s => `  ${s}`).join('\n')}\n\n${JSON.stringify(manifest(c), null, 2)}`; } catch { $('#manifest').textContent = '이름과 영문 ID를 입력하면 파일 구성이 표시됩니다.'; }
  draw(); drawAtlas();
}
async function rebuildImages() {
  Object.values(urls).forEach(URL.revokeObjectURL); urls = {}; images = {};
  for (const slot of SLOTS) if (c.assets[slot] instanceof Blob) {
    urls[slot] = URL.createObjectURL(c.assets[slot]); const img = new Image(); img.src = urls[slot]; await img.decode(); images[slot] = img;
  }
  $('#assets').replaceChildren();
  const labels = { master_sheet: '디자인 시트', runtime_3q: '단일 이미지', parts_atlas: '분리 파츠', thumbnail: '썸네일' };
  for (const slot of SLOTS) {
    const box = document.createElement('div'); box.className = 'asset'; const art = document.createElement('div'); art.className = 'image';
    if (urls[slot]) { const img = document.createElement('img'); img.src = urls[slot]; img.alt = labels[slot]; art.append(img); } else art.textContent = '＋';
    const label = document.createElement('span'); label.textContent = labels[slot]; const status = document.createElement('small'); status.textContent = c.assets[slot] ? '준비됨' : slot === 'thumbnail' ? '자동 생성' : 'PNG 등록';
    box.append(art, label, status);
    if (slot !== 'thumbnail') { const button = document.createElement('button'); button.textContent = c.assets[slot] ? '이미지 교체' : '등록하기'; button.onclick = () => { uploadSlot = slot; $('#upload').click(); }; box.append(button); }
    $('#assets').append(box);
  }
  refresh();
}
async function pngInfo(blob, alpha) {
  if (blob.size > 3.5 * 1024 * 1024) throw new Error('PNG 파일은 3.5MB 이하로 등록해 주세요. 1536px 크기를 권장합니다.');
  const bytes = new Uint8Array(await blob.slice(0, 8).arrayBuffer());
  if (bytes.join(',') !== '137,80,78,71,13,10,26,10') throw new Error('PNG 형식의 이미지가 필요합니다.');
  const img = await createImageBitmap(blob);
  if (img.width > 4096 || img.height > 4096 || img.width < 32 || img.height < 32) { img.close(); throw new Error('이미지 크기는 가로·세로 32~4096px여야 합니다.'); }
  if (alpha) {
    const canvas = document.createElement('canvas'); canvas.width = img.width; canvas.height = img.height; const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height).data; let transparent = false, visible = false;
    for (let i = 3; i < pixels.length; i += 4) { transparent ||= pixels[i] < 20; visible ||= pixels[i] > 30; if (transparent && visible) break; }
    if (!transparent || !visible) { img.close(); throw new Error('투명한 배경과 보이는 캐릭터가 함께 있는 PNG가 필요합니다. 체크무늬가 그려진 이미지는 사용할 수 없습니다.'); }
  }
  return img;
}
async function setAsset(slot, blob) {
  if (slot !== 'master_sheet' && c.approvals.master !== c.hashes.master_sheet) throw new Error('디자인 시트를 먼저 확정해 주세요.');
  if (slot === 'parts_atlas' && (!c.assets.runtime_3q || c.references.runtime_3q !== c.hashes.master_sheet)) throw new Error('현재 디자인의 단일 이미지를 먼저 등록해 주세요.');
  const bitmap = await pngInfo(blob, slot !== 'master_sheet');
  c.assets[slot] = blob; c.hashes[slot] = await sha256(blob); c.approvals.motion = false;
  if (slot === 'master_sheet') c.approvals.master = '';
  if (slot === 'runtime_3q') {
    c.references.runtime_3q = c.hashes.master_sheet;
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d'); const scale = Math.min(232 / bitmap.width, 232 / bitmap.height); ctx.drawImage(bitmap, (256 - bitmap.width * scale) / 2, (256 - bitmap.height * scale) / 2, bitmap.width * scale, bitmap.height * scale);
    c.assets.thumbnail = await new Promise(resolve => canvas.toBlob(resolve, 'image/png')); c.hashes.thumbnail = await sha256(c.assets.thumbnail);
  }
  if (slot === 'parts_atlas') c.references.parts_atlas = c.hashes.runtime_3q;
  bitmap.close(); markDirty(); await rebuildImages();
}
function draw() {
  const canvas = $('#preview'), ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h); const view = $('#view').value;
  const image = view === 'master' ? images.master_sheet : images.runtime_3q;
  $('#empty').hidden = !!image || (view === 'layers' && !!images.parts_atlas);
  const time = playingUntil > performance.now() ? (8000 - (playingUntil - performance.now())) / 1000 : 0;
  if (view === 'layers' && images.parts_atlas) {
    const unit = Math.min(w * .64, h * .62), cx = w / 2, base = h * .86;
    shadow(ctx, cx, base + 5, unit * .22);
    for (const p of [...c.layers].sort((a, b) => a.depth - b.depth)) {
      const q = pose(p, c.motion, time), [x, y, rw, rh] = p.rect, a = images.parts_atlas;
      ctx.save(); ctx.translate(cx + p.x * unit, base - (p.y + q.dy) * unit); ctx.rotate(-q.angle);
      ctx.drawImage(a, x * a.width, y * a.height, rw * a.width, rh * a.height, -p.pivot[0] * p.width * unit, -p.pivot[1] * p.height * unit, p.width * unit, p.height * unit); ctx.restore();
    }
  } else if (image) {
    const s = Math.min((w - 90) / image.width, (h - 110) / image.height), iw = image.width * s, ih = image.height * s;
    if (view !== 'master') shadow(ctx, w / 2, (h + ih) / 2 + 8, iw * .23);
    ctx.drawImage(image, (w - iw) / 2, (h - ih) / 2, iw, ih);
  }
}
function shadow(ctx, x, y, radius) { ctx.fillStyle = '#263e342b'; ctx.beginPath(); ctx.ellipse(x, y, radius, radius * .22, 0, 0, Math.PI * 2); ctx.fill(); }
function play() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { toast('기기의 동작 줄이기 설정에 따라 정지 화면을 표시합니다.'); return; }
  playingUntil = performance.now() + 8000; cancelAnimationFrame(animationFrame);
  const tick = () => { draw(); if (performance.now() < playingUntil && !document.hidden) animationFrame = requestAnimationFrame(tick); else { playingUntil = 0; draw(); } }; tick();
}
function fillParts() {
  $('#partSelect').replaceChildren(...c.layers.map((p, i) => { const o = new Option(p.id, i); o.selected = i === selected; return o; }));
  const p = c.layers[selected]; if (!p) return;
  const fields = [['x', '가로 위치', p.x], ['y', '세로 위치', p.y], ['width', '너비', p.width], ['height', '높이', p.height], ['depth', '겹침 깊이', p.depth], ['rotation', '기울기 (도)', p.rotation], ['pivot.0', '회전 중심 X', p.pivot[0]], ['pivot.1', '회전 중심 Y', p.pivot[1]], ['rect.0', '자르기 X', p.rect[0]], ['rect.1', '자르기 Y', p.rect[1]], ['rect.2', '자르기 너비', p.rect[2]], ['rect.3', '자르기 높이', p.rect[3]]];
  $('#partFields').replaceChildren();
  for (const [key, label, value] of fields) {
    const l = document.createElement('label'); l.textContent = label; const input = document.createElement('input'); input.type = 'number'; input.step = key === 'rotation' ? '1' : '.01'; input.value = +value.toFixed(4); input.dataset.partKey = key;
    input.addEventListener('change', () => { const n = Number(input.value); if (!Number.isFinite(n)) return; const [k, idx] = key.split('.'); const old = idx === undefined ? p[k] : p[k][idx]; if (idx === undefined) p[k] = n; else p[k][idx] = n;
      const errors = validate({ ...c, character_id: c.character_id || 'draft-id', name: c.name || '초안' }); if (errors.length) { if (idx === undefined) p[k] = old; else p[k][idx] = old; input.value = old; toast(errors[0]); return; }
      c.approvals.motion = false; markDirty(); refresh(); }); l.append(input); $('#partFields').append(l);
  }
  drawAtlas();
}
function drawAtlas() {
  const a = $('#atlas'), ctx = a.getContext('2d'); ctx.clearRect(0, 0, a.width, a.height);
  if (!images.parts_atlas) return; ctx.drawImage(images.parts_atlas, 0, 0, a.width, a.height);
  c.layers.forEach((p, i) => { const [x, y, w, h] = p.rect; ctx.strokeStyle = i === selected ? '#eb8d33' : '#55715688'; ctx.lineWidth = i === selected ? 3 : 1; ctx.strokeRect(x * a.width, y * a.height, w * a.width, h * a.height);
    if (i === selected) { ctx.fillStyle = '#db573b'; ctx.beginPath(); ctx.arc((x + w * p.pivot[0]) * a.width, (y + h * p.pivot[1]) * a.height, 5, 0, Math.PI * 2); ctx.fill(); } });
}
async function saveLocal(silent = false) {
  collect(); if (!c.character_id) c.character_id = makeId(c.name);
  const errors = validate(c); if (errors.length) throw new Error(errors.join('\n'));
  c.locked_id = true; await dbOp('readwrite', store => store.put(c)); dirty = false; $('#character_id').value = c.character_id; $('#character_id').disabled = true; $('#saveState').textContent = '이 브라우저에 저장됨'; await renderLibrary(); if (!silent) toast('이 브라우저에 저장했습니다. 다른 기기에서도 쓰려면 서버에 저장하세요.');
}
async function renderLibrary() {
  libraryUrls.forEach(URL.revokeObjectURL); libraryUrls = []; const rows = await dbOp('readonly', store => store.getAll());
  $('#libraryList').replaceChildren();
  for (const row of rows.sort((a, b) => b.updated_at.localeCompare(a.updated_at))) {
    const button = document.createElement('button'); button.className = `library-item${row.character_id === c.character_id ? ' selected' : ''}`;
    if (row.assets.thumbnail) { const img = document.createElement('img'); img.src = URL.createObjectURL(row.assets.thumbnail); libraryUrls.push(img.src); img.alt = ''; button.append(img); }
    const name = document.createElement('span'); name.textContent = row.name; const small = document.createElement('small'); small.textContent = row.server_revision ? '서버 저장 이력 있음' : '이 브라우저'; name.append(small); button.append(name);
    button.onclick = () => run(async () => { if (dirty && c.name && c.character_id) await saveLocal(true); c = row; dirty = false; fill(); await rebuildImages(); $('#saveState').textContent = '보관함에서 불러옴'; }); $('#libraryList').append(button);
  }
}
function toBase64(blob) { return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result.split(',')[1]); r.onerror = () => reject(r.error); r.readAsDataURL(blob); }); }
function fromBase64(s) { return new Blob([Uint8Array.from(atob(s), c => c.charCodeAt(0))], { type: 'image/png' }); }
async function saveServer() {
  await saveLocal(true); const assets = {};
  for (const slot of SLOTS) if (c.assets[slot]) assets[slot] = await api('asset_put', { character_id: c.character_id, slot, png: await toBase64(c.assets[slot]) });
  const record = structuredClone(c); record.assets = assets;
  const r = await api('save', { character: record, revision: c.server_revision }); c.server_revision = r.revision;
  if (r.generation_count !== undefined) c.generation_count = r.generation_count;
  if (r.estimated_output_usd !== undefined) c.estimated_output_usd = r.estimated_output_usd;
  await saveLocal(true); $('#saveState').textContent = '서버와 브라우저에 저장됨'; return r;
}
async function loadServer(id) {
  const result = await api('get', { character_id: id }); const row = result.character;
  for (const slot of SLOTS) if (row.assets[slot]) row.assets[slot] = fromBase64((await api('asset_get', { character_id: id, asset: row.assets[slot] })).png);
  row.server_revision = result.revision; row.locked_id = true; c = row; dirty = false; fill(); await rebuildImages(); await saveLocal(true); $('#saveState').textContent = '서버에서 불러옴';
  if (!pendingJob && row.last_job_id && row.last_imported_job !== row.last_job_id) {
    const job = await api('job', { character_id: id, job_id: row.last_job_id });
    if (job.status !== 'failed') { pendingJob = { id, job_id: row.last_job_id, slot: job.slot }; sessionStorage.setItem('earthus-character-job', JSON.stringify(pendingJob)); refresh(); }
  }
}
function clearJob() { pendingJob = null; sessionStorage.removeItem('earthus-character-job'); }
function preflight(slot) {
  if (!c.prompt.trim()) throw new Error('제작 설명을 입력해 주세요.');
  if (slot !== 'master_sheet' && (!c.approvals.master || c.approvals.master !== c.hashes.master_sheet)) throw new Error('디자인 시트를 먼저 확정해 주세요.');
  if (slot === 'parts_atlas' && (!c.assets.runtime_3q || c.references.runtime_3q !== c.hashes.master_sheet)) throw new Error('현재 디자인의 단일 이미지를 먼저 준비해 주세요.');
}
// One generation from request to imported PNG. Awaiting it is what lets the automatic run
// chain three of them; the manual button awaits exactly the same call.
async function runJob(slot) {
  collect(); preflight(slot);
  await saveServer(); const requestId = crypto.randomUUID(); const id = c.character_id;
  pendingJob = { id, job_id: requestId, slot }; sessionStorage.setItem('earthus-character-job', JSON.stringify(pendingJob)); refresh();
  try { await api('generate', { character_id: id, slot, request_id: requestId }); }
  catch (e) {
    if (e.status && e.status < 500 || e.status === 503) { clearJob(); refresh(); throw e; }
    toast('요청 결과를 확인 중입니다. 같은 요청 ID로 확인해 중복 생성을 방지합니다.');
  }
  return followJob();
}
async function followJob() {
  while (pendingJob) {
    let job;
    try { job = await api('job', { character_id: pendingJob.id, job_id: pendingJob.job_id }); }
    catch (e) {
      toast(e.message);
      if (e.status === 404 && imageReady) {
        try { await api('generate', { character_id: pendingJob.id, slot: pendingJob.slot, request_id: pendingJob.job_id }); }
        catch (retryError) { if (retryError.status) { clearJob(); refresh(); throw retryError; } }
      } else if (e.status && e.status < 500) { clearJob(); refresh(); throw e; }
      await sleep(15000); continue;
    }
    if (job.status === 'complete') {
      const saved = pendingJob; clearJob();
      if (c.character_id === saved.id) { const blob = fromBase64((await api('asset_get', { character_id: saved.id, asset: job.asset })).png); await setAsset(saved.slot, blob); c.server_revision = null;
        const remote = await api('get', { character_id: c.character_id }); c.server_revision = job.record_revision; c.generation_count = remote.character.generation_count; c.estimated_output_usd = remote.character.estimated_output_usd; c.last_imported_job = saved.job_id;
        // A generation must not adopt a newer ETag and overwrite another administrator's edits.
        // Keep its result locally so a conflict cannot lose the generated image.
        await saveLocal(true);
        if (remote.revision !== job.record_revision) throw new Error('생성 이미지는 이 브라우저에 보관했습니다. 다른 화면의 서버 변경이 있어 자동 저장을 멈췄습니다. 서버 초안을 확인한 뒤 이미지를 다시 등록해 주세요.');
        await saveServer(); }
      refresh(); return saved.slot;
    }
    if (job.status === 'failed') { clearJob(); refresh(); throw new Error(job.error || '이미지 생성에 실패했습니다.'); }
    $('#generationNote').textContent = '서버에서 이미지를 만들고 있습니다. 화면을 새로 열어도 작업 상태를 확인할 수 있습니다.';
    await sleep(4000);
  }
}
async function generate() { await runJob($('#generateSlot').value); toast('이미지 제작이 완료되었습니다. 결과를 확인하고 확정해 주세요.'); }
async function publishNow() {
  collect(); const errors = validate(c, { complete: true }); if (errors.length) throw new Error(errors.join('\n'));
  await saveServer(); const r = await api('publish', { character_id: c.character_id, revision: c.server_revision });
  c.published_revision = r.published_revision; c.server_revision = r.revision; await saveLocal(true);
}
// The atlas prompt asks for a 3x2 grid, so the crop can be measured instead of assumed.
async function assembleParts() {
  if (!(c.assets.parts_atlas instanceof Blob)) throw new Error('분리 파츠 시트가 없습니다.');
  const bitmap = await createImageBitmap(c.assets.parts_atlas);
  const canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bitmap, 0, 0);
  const pixels = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data; bitmap.close();
  const { layers, warnings } = autoLayers(pixels, canvas.width, canvas.height);
  const errors = validate({ ...c, layers }); if (errors.length) throw new Error(`자동 조립 결과가 규격을 벗어났습니다: ${errors[0]}`);
  c.layers = layers; selected = 0; c.approvals.motion = true; markDirty(); fillParts(); await saveServer();
  return warnings;
}
const AUTO_STEPS = [
  ['master_sheet', '① 디자인 시트 4방향', '1536×1024 · 아이보리 배경'],
  ['runtime_3q', '② 단일 3/4 이미지 · 썸네일', '1024×1024 · 투명 배경'],
  ['parts_atlas', '③ 분리 파츠 시트', '3열×2행 · 투명 배경'],
  ['assemble', '④ 파츠 자동 조립', '알파 경계로 자르고 세웁니다'],
  ['publish', '⑤ 지구에 올리기', 'characters/{id}/ 5개 파일'],
];
let autoWantsPublish = true;
function confirmDialog(title, body, ok = '확인') {
  return new Promise(resolve => {
    const dialog = $('#confirmDialog');
    $('#confirmTitle').textContent = title; $('#confirmBody').textContent = body; $('#confirmOk').textContent = ok;
    const close = value => { dialog.close(); dialog.onclose = null; resolve(value); };
    $('#confirmOk').onclick = () => close(true); $('#confirmCancel').onclick = () => close(false); dialog.onclose = () => resolve(false);
    dialog.showModal();
  });
}
function autoNext() {
  if (!c.assets.master_sheet || c.approvals.master !== c.hashes.master_sheet) return 'master_sheet';
  if (!c.assets.runtime_3q || c.references.runtime_3q !== c.hashes.master_sheet) return 'runtime_3q';
  if (!c.assets.parts_atlas || c.references.parts_atlas !== c.hashes.runtime_3q) return 'parts_atlas';
  if (!c.approvals.motion) return 'assemble';
  if (autoWantsPublish && !c.published_revision) return 'publish';
  return 'done';
}
function renderAuto(current, { message = '', failed = false, title = '자동 제작 중' } = {}) {
  const panel = $('#autoPanel'); panel.hidden = false; $('#autoTitle').textContent = title;
  const index = AUTO_STEPS.findIndex(s => s[0] === current);
  $('#autoSteps').replaceChildren(...AUTO_STEPS.map(([key, label, hint], i) => {
    const skipped = key === 'publish' && !autoWantsPublish;
    const state = skipped ? 'skipped' : current === 'done' ? 'done' : i < index ? 'done' : i === index ? (failed ? 'failed' : 'active') : 'waiting';
    const li = document.createElement('li'); li.dataset.state = state; li.textContent = label;
    const small = document.createElement('small');
    small.textContent = { active: '진행 중…', failed: '멈춤', done: '완료', skipped: '건너뜀' }[state] || hint;
    li.append(small); return li;
  }));
  $('#autoMessage').textContent = message;
  $('#autoStop').hidden = !auto || !!failed; $('#autoClose').hidden = !$('#autoStop').hidden;
}
function persistAuto() { if (auto) sessionStorage.setItem('earthus-character-auto', JSON.stringify({ id: c.character_id, publish: autoWantsPublish })); else sessionStorage.removeItem('earthus-character-auto'); }
// One description, one press: prompts, three generations, measured assembly, then the globe.
// Every step reads its own precondition off the record, so a reload resumes where it stopped.
async function runAuto() {
  const notes = []; let step = autoNext();
  try {
    while (auto && !auto.stop && step !== 'done') {
      renderAuto(step);
      if (step === 'assemble') { const warnings = await assembleParts(); if (warnings.length) notes.push(`자동 조립에서 확인이 필요한 파츠: ${warnings.join(', ')}`); }
      else if (step === 'publish') await publishNow();
      else { await runJob(step); if (step === 'master_sheet') { c.approvals.master = c.hashes.master_sheet; markDirty(); await saveServer(); } }
      persistAuto(); step = autoNext();
    }
  } catch (e) {
    auto = null; persistAuto(); refresh();
    renderAuto(step, { title: '자동 제작을 멈췄습니다', failed: true, message: `${e.message}\n지금까지 만든 이미지는 보관함에 남아 있습니다. 고친 뒤 다시 누르면 남은 단계부터 이어서 합니다.` });
    throw e;
  }
  const stopped = auto?.stop; auto = null; persistAuto(); refresh();
  if (stopped) renderAuto(step, { title: '여기까지 하고 멈췄습니다', message: '다시 누르면 남은 단계부터 이어서 합니다.' });
  else renderAuto('done', { title: autoWantsPublish ? '지구에 올렸습니다' : '캐릭터를 완성했습니다',
    message: [autoWantsPublish ? '지구 화면을 새로 열면 보입니다.' : '‘저장하고 지구에 적용’을 누르면 공개됩니다.', ...notes].join('\n') });
  toast(autoWantsPublish ? '자동 제작을 마치고 지구에 올렸습니다.' : '자동 제작을 마쳤습니다. 확인 후 지구에 올려 주세요.');
}
async function startAuto() {
  for (const [from, to] of [['#autoLat', '#lat'], ['#autoLon', '#lon']]) if ($(from).value !== '') $(to).value = $(from).value;
  collect(); if (!c.character_id) { c.character_id = makeId(c.name); $('#character_id').value = c.character_id; }
  if (!c.name.trim()) throw new Error('캐릭터 이름을 입력해 주세요.');
  if (!c.prompt.trim()) throw new Error('제작 설명을 입력해 주세요.');
  const errors = validate(c); if (errors.length) throw new Error(errors.join('\n'));
  autoWantsPublish = $('#autoPublish').checked;
  // Only the generations this run still has to pay for; a resumed run does not re-buy what exists.
  const pending = ['master_sheet', 'runtime_3q', 'parts_atlas'].filter(slot =>
    slot === 'master_sheet' ? !c.assets.master_sheet || c.approvals.master !== c.hashes.master_sheet
      : slot === 'runtime_3q' ? !c.assets.runtime_3q || c.references.runtime_3q !== c.hashes.master_sheet
        : !c.assets.parts_atlas || c.references.parts_atlas !== c.hashes.runtime_3q);
  const cost = pending.reduce((sum, slot) => sum + PRICE[slot], 0);
  if ((c.generation_count || 0) + pending.length > 12) throw new Error('이 캐릭터의 생성 한도 12회를 넘습니다. 새 캐릭터로 시작해 주세요.');
  const ok = await confirmDialog('한 번에 만들까요?',
    `${c.name} · characters/${c.character_id}/\n유료 이미지 생성 ${pending.length}회, 예상 출력 $${cost.toFixed(3)}를 사용합니다.\n` +
    (autoWantsPublish ? '완성되면 확인 없이 바로 지구에 공개됩니다.' : '완성해도 공개하지 않고 보관함에 둡니다.'), '만들기');
  if (!ok) return;
  auto = { stop: false }; persistAuto(); refresh();
  await runAuto();
}
async function exportZip() {
  collect(); const errors = validate(c, { complete: true }); if (errors.length) throw new Error(errors.join('\n'));
  const names = files(c.character_id), prefix = `characters/${c.character_id}/`;
  const entries = SLOTS.map(s => [prefix + names[s], c.assets[s]]); entries.push([prefix + names.manifest, new Blob([JSON.stringify(manifest(c), null, 2)], { type: 'application/json' })]);
  const url = URL.createObjectURL(await zipFiles(entries)); const a = document.createElement('a'); a.href = url; a.download = `${c.character_id}.zip`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000);
}
function globePreview() {
  collect(); const errors = validate(c, { complete: true }); if (errors.length) throw new Error(errors.join('\n'));
  const token = crypto.randomUUID(); const win = window.open(`./?character_preview=${encodeURIComponent(token)}`, '_blank');
  if (!win) throw new Error('브라우저에서 팝업을 허용해 주세요.'); previews.set(token, { win, character: manifest(c), assets: c.assets });
}
addEventListener('message', e => { if (e.origin !== location.origin || e.data?.type !== 'earthus-character-ready') return; const p = previews.get(e.data.token); if (!p || p.win !== e.source) return; e.source.postMessage({ type: 'earthus-character-preview', token: e.data.token, character: p.character, assets: p.assets }, location.origin); previews.delete(e.data.token); });
addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
document.addEventListener('visibilitychange', () => { if (document.hidden) { cancelAnimationFrame(animationFrame); playingUntil = 0; } });

$$('[data-step]').forEach(button => button.onclick = () => { $$('[data-step]').forEach(b => b.classList.toggle('active', b === button)); $$('[data-panel]').forEach(p => p.hidden = p.dataset.panel !== button.dataset.step); if (button.dataset.step === 'parts') $('#view').value = 'layers'; refresh(); });
for (const input of $$('input:not([type=file]), textarea, #motion')) input.addEventListener('change', () => { collect(); if (input.id === 'name' && !c.locked_id && !$('#character_id').value) { c.character_id = makeId(c.name); $('#character_id').value = c.character_id; } if (input.id === 'motion') c.approvals.motion = false; markDirty(); refresh(); });
$('#generateSlot').onchange = refresh; $('#view').onchange = draw; $('#play').onclick = play;
$('#upload').onchange = () => run(async () => { const file = $('#upload').files[0]; $('#upload').value = ''; if (file) { await setAsset(uploadSlot, file); toast('이미지를 등록했습니다.'); } });
$('#approveMaster').onclick = () => run(async () => { if (!c.assets.master_sheet) throw new Error('디자인 시트를 먼저 등록하세요.'); c.approvals.master = c.hashes.master_sheet; markDirty(); toast('디자인 시트를 확정했습니다. 단일 이미지를 준비해 주세요.'); });
$('#approveMotion').onclick = () => run(async () => { const errors = validate({ ...c, approvals: { ...c.approvals, motion: true } }, { complete: true }); if (errors.length) throw new Error(errors.join('\n')); c.approvals.motion = true; markDirty(); toast('파츠와 움직임을 확정했습니다.'); });
$('#partSelect').onchange = () => { selected = Number($('#partSelect').value); fillParts(); };
$('#addPart').onclick = () => { if (c.layers.length >= 7) return toast('파츠는 최대 7개입니다.'); let id = 1; while (c.layers.some(p => p.id === `extra_${id}`)) id++; c.layers.push({ ...defaultLayers()[0], id: `extra_${id}`, role: 'extra' }); selected = c.layers.length - 1; c.approvals.motion = false; markDirty(); fillParts(); refresh(); };
$('#removePart').onclick = () => { if (c.layers.length <= 3) return toast('파츠는 최소 3개입니다.'); c.layers.splice(selected, 1); selected = Math.max(0, selected - 1); c.approvals.motion = false; markDirty(); fillParts(); refresh(); };
let dragStart;
function atlasPoint(e) { const r = $('#atlas').getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; }
$('#atlas').onpointerdown = e => { if (!images.parts_atlas) return; const pt = atlasPoint(e), p = c.layers[selected];
  if (e.shiftKey) { p.pivot = [Math.max(0, Math.min(1, (pt[0] - p.rect[0]) / p.rect[2])), Math.max(0, Math.min(1, (pt[1] - p.rect[1]) / p.rect[3]))]; c.approvals.motion = false; markDirty(); fillParts(); refresh(); }
  else { dragStart = pt; $('#atlas').setPointerCapture(e.pointerId); } };
$('#atlas').onpointerup = e => { if (!dragStart) return; const pt = atlasPoint(e), w = Math.abs(pt[0] - dragStart[0]), h = Math.abs(pt[1] - dragStart[1]); if (w > .01 && h > .01) { c.layers[selected].rect = [Math.min(pt[0], dragStart[0]), Math.min(pt[1], dragStart[1]), w, h]; c.approvals.motion = false; markDirty(); fillParts(); refresh(); } dragStart = null; };
$('#atlas').onpointercancel = () => dragStart = null;
$('#saveLocal').onclick = () => run(() => saveLocal()); $('#saveServer').onclick = () => run(async () => { await saveServer(); toast('서버 보관함에 저장했습니다.'); });
$('#new').onclick = () => run(async () => { if (dirty && c.name && c.character_id) await saveLocal(true); c = newCharacter(); fill(); await rebuildImages(); dirty = false; $('#saveState').textContent = '새 캐릭터'; });
$('#generate').onclick = () => run(generate); $('#export').onclick = () => run(exportZip); $('#globePreview').onclick = () => { try { globePreview(); } catch (e) { toast(e.message); } };
$('#copyPrompt').onclick = () => run(async () => { collect(); await navigator.clipboard.writeText(promptFor(c, $('#generateSlot').value)); toast('제작 프롬프트를 복사했습니다.'); });
$('#publish').onclick = () => run(async () => { await publishNow(); toast('지구에 적용했습니다. 지구 화면을 새로 열면 확인할 수 있습니다.'); });
$('#autoRun').onclick = () => run(startAuto);
$('#autoStop').onclick = () => { if (auto) { auto.stop = true; $('#autoMessage').textContent = '이번 단계를 마치면 멈춥니다. 이미 시작한 이미지 생성은 취소되지 않습니다.'; $('#autoStop').disabled = true; } };
$('#autoClose').onclick = () => { $('#autoPanel').hidden = true; };
// The one-shot panel and the placement step edit the same coordinates; keep both boxes honest.
for (const [from, to] of [['#autoLat', '#lat'], ['#autoLon', '#lon'], ['#lat', '#autoLat'], ['#lon', '#autoLon']]) $(from).addEventListener('change', () => { $(to).value = $(from).value; collect(); markDirty(); refresh(); });
$('#unpublish').onclick = () => run(async () => { const r = await api('unpublish', { character_id: c.character_id, revision: c.server_revision }); c.published_revision = null; c.server_revision = r.revision; await saveLocal(true); toast('지구에서 내렸습니다. 초안과 제작 파일은 보관됩니다.'); });
$('#refresh').onclick = () => run(async () => { const r = await api('list'); if (!r.characters.length) return toast('서버 보관함이 비어 있습니다.');
  const dialog = document.createElement('dialog'); dialog.style.cssText = 'border:1px solid #ddd;border-radius:14px;padding:24px;max-width:90vw'; const h = document.createElement('h2'); h.textContent = '서버 캐릭터 불러오기'; dialog.append(h);
  for (const id of r.characters) { const b = document.createElement('button'); b.textContent = id; b.style.margin = '5px'; b.onclick = () => { dialog.close(); dialog.remove(); run(async () => { if (dirty && c.name) await saveLocal(true); await loadServer(id); if (pendingJob) await followJob(); }); }; dialog.append(b); }
  const close = document.createElement('button'); close.textContent = '닫기'; close.onclick = () => { dialog.close(); dialog.remove(); }; dialog.append(close); document.body.append(dialog); dialog.showModal(); });
async function boot() {
  await openDb();
  if (!LOCAL) {
    const { CONFIG } = await import('../js/config.local.js'); const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    client = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY); $('#login').onclick = () => client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.href } });
    const session = (await client.auth.getSession()).data?.session;
    if (!session) { $('#gate').textContent = '관리자 계정으로 로그인해 주세요.'; $('#login').hidden = false; return; }
    const admins = Array.isArray(CONFIG.ADMIN_UIDS) ? CONFIG.ADMIN_UIDS : [];
    if (!admins.includes(session.user.id)) { $('#gate').textContent = '이 계정은 관리자 목록에 없습니다.'; return; }
    client.auth.onAuthStateChange((_event, s) => { if (!s) { $('#app').hidden = true; $('#gate').hidden = false; $('#gate').textContent = '로그인이 만료되었습니다. 다시 로그인해 주세요.'; $('#login').hidden = false; } });
  }
  $('#gate').hidden = true; $('#app').hidden = false;
  try { const status = await api('status'); apiReady = true; imageReady = status.image_generation_ready; $('#connection').textContent = imageReady ? '이미지 생성 연결됨' : '저장 서버 연결 · API 키 대기'; }
  catch { $('#connection').textContent = '브라우저 작업 모드'; }
  if (LOCAL) $('#connection').textContent = '로컬 미리보기 · 실제 사이트 적용 안 됨';
  fill(); await rebuildImages(); await renderLibrary();
  try { pendingJob = JSON.parse(sessionStorage.getItem('earthus-character-job')); } catch { pendingJob = null; }
  let resume = null; try { resume = JSON.parse(sessionStorage.getItem('earthus-character-auto')); } catch { resume = null; }
  if (!apiReady) { pendingJob = null; return refresh(); }
  if (pendingJob) await loadServer(pendingJob.id);
  else if (resume?.id) await loadServer(resume.id);
  if (resume?.id && (!pendingJob || pendingJob.id === resume.id)) {
    autoWantsPublish = !!resume.publish; auto = { stop: false }; refresh();
    run(async () => { if (pendingJob) await followJob(); await runAuto(); });
  } else if (pendingJob) run(followJob);
}
boot().catch(e => { $('#gate').hidden = false; $('#gate').textContent = `제작실을 열지 못했습니다: ${e.message}`; });
