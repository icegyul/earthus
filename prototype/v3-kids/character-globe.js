import { loadPaperCharacter, surfaceNormal } from './paper-character.js';
import { validate } from './character-core.js';

export function createCharacterGlobe({ group, camera, focus }) {
  const models = new Map(), inflight = new Set(), failures = new Set(); let rows = [], stopped = false, draft = null, draftUrls = [], lastCheck = 0;
  const mobile = matchMedia('(max-width: 700px)').matches, limit = mobile ? 8 : 20;
  const root = new URL('./characters/', import.meta.url);
  const safeUrl = value => { const url = new URL(value, root); if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname) || !url.pathname.endsWith('.json')) throw new Error('캐릭터 경로가 잘못되었습니다.'); return url; };
  fetch(new URL('catalog.json', root), { cache: 'no-cache' }).then(async r => {
    if (r.status === 404) return { characters: [] };
    if (!r.ok) throw new Error('catalog'); return r.json();
  }).then(data => { rows = Array.isArray(data.characters) ? data.characters.slice(0, 200).filter(r => /^[a-z][a-z0-9_-]{1,47}$/.test(r.character_id) && Number.isFinite(r.placement?.lat) && Number.isFinite(r.placement?.lon)) : []; }).catch(() => console.warn('[characters] 공개 캐릭터 목록을 읽지 못했습니다.'));
  async function load(row) {
    inflight.add(row.character_id);
    try {
      const url = safeUrl(row.manifest), response = await fetch(url); if (!response.ok) throw new Error('manifest'); const data = await response.json();
      if (data.character_id !== row.character_id || validate({ ...data, assets: {}, hashes: {}, approvals: {}, references: {} }).length) throw new Error('contract');
      const urls = {};
      // 파츠는 선택이다. 목록에 있을 때만 받는다 — 없는 파일을 받으러 가면 캐릭터가 통째로 죽는다.
      for (const slot of ['runtime_3q', 'parts_atlas']) {
        if (slot === 'parts_atlas' && !data.files?.parts_atlas) continue;
        if (data.files?.[slot] !== `${data.character_id}_${slot}.png`) throw new Error('filename');
        urls[slot] = new URL(data.files[slot], url).href;
      }
      // 장면 카드는 인포창에서만 쓴다. 주소만 만들어 두고 받는 것은 카드가 열릴 때.
      if (data.files?.scene) {
        if (data.files.scene !== `${data.character_id}_scene.png`) throw new Error('filename');
        urls.scene = new URL(data.files.scene, url).href;
      }
      const model = await loadPaperCharacter(data, urls); if (stopped) return model.dispose();
      group.add(model.group); models.set(row.character_id, { model, seen: performance.now() });
    } catch { failures.add(row.character_id); } finally { inflight.delete(row.character_id); }
  }
  const previewToken = new URLSearchParams(location.search).get('character_preview');
  const receive = async event => {
    if (!previewToken || !window.opener || event.source !== window.opener || event.origin !== location.origin || event.data?.type !== 'earthus-character-preview' || event.data.token !== previewToken) return;
    const data = event.data.character;
    if (validate({ ...data, assets: {}, hashes: {}, approvals: {}, references: {} }).length) return;
    if (!['runtime_3q', 'parts_atlas'].every(s => event.data.assets?.[s] instanceof Blob && event.data.assets[s].size < 4 * 1024 * 1024)) return;
    if (event.data.assets.scene && !(event.data.assets.scene instanceof Blob && event.data.assets.scene.size < 8 * 1024 * 1024)) return;
    draft?.dispose(); draftUrls.forEach(URL.revokeObjectURL); draftUrls = [];
    const urls = Object.fromEntries(['runtime_3q', 'parts_atlas', 'scene'].filter(s => event.data.assets[s]).map(s => { const u = URL.createObjectURL(event.data.assets[s]); draftUrls.push(u); return [s, u]; }));
    try { draft = await loadPaperCharacter(data, urls); group.add(draft.group); focus?.(data.placement); }
    catch { console.warn('[characters] 초안 미리보기를 표시하지 못했습니다.'); }
    const badge = document.createElement('div'); badge.textContent = '캐릭터 초안 미리보기 · 실제 지구에는 적용되지 않음'; badge.style.cssText = 'position:fixed;bottom:90px;left:50%;transform:translateX(-50%);background:#fff7de;color:#334333;padding:10px 16px;border-radius:20px;z-index:10000;font:12px sans-serif;max-width:90vw;text-align:center'; document.body.append(badge);
    window.removeEventListener('message', receive);
  };
  if (previewToken && window.opener) { window.addEventListener('message', receive); window.opener.postMessage({ type: 'earthus-character-ready', token: previewToken }, location.origin); }
  return {
    update(now, height, visible = true) {
      if (document.hidden || stopped) return;
      draft?.update(camera, height, now);
      if (now - lastCheck > 500) {
        lastCheck = now;
        const direction = camera.position.clone().normalize();
        const candidates = visible ? rows.map(row => ({ row, facing: surfaceNormal(row.placement.lat, row.placement.lon).dot(direction) })).filter(r => r.facing > .25).sort((a, b) => b.facing - a.facing).slice(0, limit) : [];
        const wanted = new Set(candidates.map(r => r.row.character_id));
        for (const { row } of candidates) {
          const cached = models.get(row.character_id); if (cached) cached.seen = now;
          else if (inflight.size < 2 && !inflight.has(row.character_id) && !failures.has(row.character_id)) load(row);
        }
        for (const [id, entry] of models) {
          entry.enabled = wanted.has(id);
          if (!entry.enabled && (now - entry.seen > 30000 || models.size > limit + 4)) { entry.model.dispose(); models.delete(id); }
        }
      }
      for (const entry of models.values()) { if (entry.enabled) entry.model.update(camera, height, now); else entry.model.group.visible = false; }
    },
    /* 손이 닿은 캐릭터. 겹쳐 서 있으면 화면에서 더 가까운 하나만 — 둘이 한꺼번에 뛰면
       무엇을 눌렀는지 알 수 없다. 고른 즉시 다음 동작을 재생하고, 카드에 실을 것을 돌려준다. */
    pick(x, y, width, height) {
      if (document.hidden || stopped) return null;
      let hit = null, best = Infinity;
      const consider = model => { const d = model.hitDistance(x, y, camera, width, height); if (d < best) { best = d; hit = model; } };
      for (const entry of models.values()) if (entry.enabled) consider(entry.model);
      if (draft) consider(draft);
      return hit ? { data: hit.data, scene: hit.sceneUrl, move: hit.play() } : null;
    },
    dispose() { stopped = true; draft?.dispose(); draftUrls.forEach(URL.revokeObjectURL); models.forEach(e => e.model.dispose()); window.removeEventListener('message', receive); }
  };
}
