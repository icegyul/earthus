// 자동 번역 — 한국어 ↔ 영어
//
// 왜 필요한가
//   커뮤니티에 두 언어가 섞인다. 영어로 쓴 글을 한국어 사용자가 못 읽으면
//   같은 공간에 있어도 대화가 안 된다. 원문을 남기고 번역을 함께 보여준다.
//
// ⚠️ 번역문을 원문인 척 보여주지 않는다.
//    항상 "기계 번역"이라고 표시하고, 원문을 볼 수 있게 남긴다.
//    기계 번역은 틀린다 — 특히 반어·농담·전문용어에서 그렇다.
//    번역만 보여주면 글쓴이가 하지 않은 말이 그 사람 말이 되어버린다.
//
// 지금 쓰는 것: MyMemory (키 불필요, CORS 개방, 익명 무료 한도)
//   실측: en→ko "The typhoon is moving north" → "태풍이 북쪽으로 이동하고 있습니다." (품질 0.85)
//        ko→en "지구본이 너무 느리게 돌아갑니다" → "The globe spins too slowly"
//
// 나중에 LLM 로 바꾸려면 PROVIDERS 에 하나 추가하고 ACTIVE 만 바꾸면 된다.
// ⚠️ LLM 로 갈 때 API 키를 브라우저에 두면 안 된다. 반드시 서버(Lambda)를 거칠 것.

import { fetchT } from './net.js';

const LS_CACHE = 'earthus.tr';
const MAX_CACHE = 300;

/* MyMemory q 한도는 500 **글자**가 아니라 UTF-8 500 **바이트**다.
   한국어 한 글자는 보통 3바이트라 slice(0, 480)는 거의 항상 거절된다. */
export function clipUtf8(text, maxBytes = 500) {
  const src = String(text || '');
  const enc = new TextEncoder();
  if (enc.encode(src).length <= maxBytes) return src;
  const suffix = '…';
  const budget = maxBytes - enc.encode(suffix).length;
  let out = '', used = 0;
  for (const ch of src) {
    const n = enc.encode(ch).length;
    if (used + n > budget) break;
    out += ch; used += n;
  }
  return out + suffix;
}

/** 한글이 섞여 있으면 한국어로 본다. 짧은 글에도 잘 맞고 요청이 필요 없다. */
export function detectLang(text) {
  return /[ㄱ-ㆎ가-힣]/.test(String(text || '')) ? 'ko' : 'en';
}

/* ── 캐시 ──────────────────────────────────────────────────────
   같은 글을 다시 번역하면 하루 한도만 깎인다. 결과는 안 변한다. */
function loadCache() {
  try { return JSON.parse(localStorage.getItem(LS_CACHE) || '{}'); } catch { return {}; }
}
function saveCache(c) {
  const keys = Object.keys(c);
  if (keys.length > MAX_CACHE) {
    // 오래된 것부터 버린다 (삽입 순서 = 객체 키 순서)
    keys.slice(0, keys.length - MAX_CACHE).forEach(k => delete c[k]);
  }
  try { localStorage.setItem(LS_CACHE, JSON.stringify(c)); } catch { /* 용량 초과 무시 */ }
}

const PROVIDERS = {
  mymemory: {
    name: 'MyMemory',
    async run(text, from, to) {
      const u = new URL('https://api.mymemory.translated.net/get');
      u.searchParams.set('q', text);
      u.searchParams.set('langpair', `${from}|${to}`);
      const r = await fetchT(u, { timeout: 12_000 });
      if (!r.ok) throw new Error('translate ' + r.status);
      const j = await r.json();
      if (j.responseStatus !== 200 && j.responseStatus !== '200') {
        throw new Error(j.responseDetails || 'translate failed');
      }
      /* ⚠️ 한도가 차면 번역문 자리에 안내 문구가 들어온다.
         그걸 번역인 줄 알고 화면에 띄우면 엉뚱한 글이 붙는다. 걸러낸다. */
      const out = j.responseData?.translatedText || '';
      if (/MYMEMORY WARNING|QUOTA|USAGE LIMIT/i.test(out)) throw new Error('QUOTA');
      return { text: out, quality: Number(j.responseData?.match) || null };
    },
  },
};

const ACTIVE = 'mymemory';

export const translator = {
  provider: PROVIDERS[ACTIVE].name,
  disabled: false,        // 한도 소진 등으로 이번 세션에서 포기한 상태

  /**
   * @returns {{text:string, from:string, to:string, machine:true, quality:number|null} | null}
   *          같은 언어라 번역이 필요 없거나 실패하면 null
   */
  async to(text, target) {
    const src = String(text || '').trim();
    if (!src || this.disabled) return null;
    const from = detectLang(src);
    if (from === target) return null;

    // 너무 긴 글은 UTF-8 바이트 기준으로 자른다 (MyMemory 는 500바이트 제한)
    const q = clipUtf8(src);

    const cache = loadCache();
    const key = `${from}>${target}:${q}`;
    if (cache[key]) return { ...cache[key], from, to: target, machine: true, cached: true };

    try {
      const r = await PROVIDERS[ACTIVE].run(q, from, target);
      if (!r.text) return null;
      cache[key] = { text: r.text, quality: r.quality };
      saveCache(cache);
      return { text: r.text, quality: r.quality, from, to: target, machine: true };
    } catch (e) {
      if (e.message === 'QUOTA') {
        // 한도가 찼으면 이번 세션 동안 더 시도하지 않는다 — 매번 실패만 쌓인다
        this.disabled = true;
        console.info('[translate] 오늘 번역 한도 소진');
      } else {
        console.warn('[translate]', e.message);
      }
      return null;
    }
  },

  /** 두 언어 모두 확보 — 원문 + 반대편 번역 */
  async both(text) {
    const from = detectLang(text);
    const other = from === 'ko' ? 'en' : 'ko';
    const tr = await this.to(text, other);
    return { original: text, from, translated: tr?.text || null, to: other,
             quality: tr?.quality ?? null };
  },
};
