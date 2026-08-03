/* 일본 지명을 기기 언어에 맞춰 — 지어내지 않고 규칙으로만
 *
 * 받은 지시
 *   "일본어는 한국인 유저 디바이스 언어가 한국어면 한글로, 영어면 영어로 나오게 …
 *    일본어면 당연히 일본어"
 *
 * ⚠️⚠️ **자료에 한국어 이름이 거의 없다.** OSM 일본 해변 764곳 중 9곳(1%)뿐이다.
 *    영문(헵번 로마자)은 30% 있다. 그래서 **영문에서 외래어 표기법으로 옮긴다.**
 *
 * ⚠️⚠️ **한자를 한국 한자음으로 읽지 않는다.** 東京을 "동경"이라 하는 방식이다.
 *    (실제로 OSM 한국어 이름 중에 枕状溶岩 → "침상용암" 이 있었다 — 일본 지명이 아니다.)
 *
 * ⚠️⚠️ **못 읽으면 통째로 포기하고 원문을 둔다.** 반쯤 읽은 이름은 없는 지명이 된다.
 *
 * ⚠️ 이건 **표기 변환**이지 공식 한국어 지명이 아니다. 화면에 그렇게 밝힌다(mark 참고).
 *
 * 검산 — OSM 에 사람이 적어 둔 한국어와 맞춘 결과
 *   Mikasahama Beach → "미카사하마 해변" = 사람이 적은 값과 **일치**
 *   Naminoue · Miuda · Aharen 도 음절 전부 일치
 *   ⚠️ Mibaru 만 "미바루" vs 사람 "미이바루" — 영문 로마자가 장음을 빠뜨린 경우.
 *      로마자를 거치는 방식의 한계다.
 */

/* 어두와 어중이 다른 것 — 외래어 표기법 제2장 표8 */
const HEAD = { ka:'가', ki:'기', ku:'구', ke:'게', ko:'고',
               ta:'다', chi:'지', tsu:'쓰', te:'데', to:'도' };
const MID  = { ka:'카', ki:'키', ku:'쿠', ke:'케', ko:'코',
               ta:'타', chi:'치', tsu:'쓰', te:'테', to:'토' };
const BASE = {
  a:'아', i:'이', u:'우', e:'에', o:'오',
  sa:'사', shi:'시', su:'스', se:'세', so:'소',
  na:'나', ni:'니', nu:'누', ne:'네', no:'노',
  ha:'하', hi:'히', fu:'후', he:'헤', ho:'호',
  ma:'마', mi:'미', mu:'무', me:'메', mo:'모',
  ya:'야', yu:'유', yo:'요',
  ra:'라', ri:'리', ru:'루', re:'레', ro:'로',
  wa:'와', wo:'오',
  ga:'가', gi:'기', gu:'구', ge:'게', go:'고',
  za:'자', ji:'지', zu:'즈', ze:'제', zo:'조',
  da:'다', de:'데', do:'도',
  ba:'바', bi:'비', bu:'부', be:'베', bo:'보',
  pa:'파', pi:'피', pu:'푸', pe:'페', po:'포',
  kya:'갸', kyu:'규', kyo:'교', gya:'갸', gyu:'규', gyo:'교',
  sha:'샤', shu:'슈', sho:'쇼', ja:'자', ju:'주', jo:'조',
  cha:'자', chu:'주', cho:'조',
  nya:'냐', nyu:'뉴', nyo:'뇨',
  hya:'햐', hyu:'휴', hyo:'효', bya:'뱌', byu:'뷰', byo:'뵤',
  pya:'퍄', pyu:'퓨', pyo:'표', mya:'먀', myu:'뮤', myo:'묘',
  rya:'랴', ryu:'류', ryo:'료',
};
const MID_ONLY = { cha:'차', chu:'추', cho:'초' };
/* ⚠️ 긴 것부터 맞춘다 — "shi" 를 "s"+"hi" 로 쪼개면 안 된다 */
const SYL = [...new Set([...Object.keys(BASE), ...Object.keys(HEAD)])]
  .sort((a, b) => b.length - a.length);

/* 장음 표기는 적지 않는다 (ō → o) */
const LONG = { 'ā':'a','ī':'i','ū':'u','ē':'e','ō':'o',
               'â':'a','î':'i','û':'u','ê':'e','ô':'o' };

/* 뒤에 붙는 일반명사 — 한국에서 쓰는 말로 */
const TAIL = [
  [/\s*beach$/i, ' 해변'], [/\s*coast$/i, ' 해안'], [/\s*bay$/i, ' 만'],
  [/\s*island$/i, ' 섬'], [/\s*cape$/i, ' 곶'], [/\s*port$/i, ' 항'],
  [/\s*park$/i, ' 공원'], [/\s*river$/i, ' 강'], [/\s*lake$/i, ' 호'],
  [/\s*mountain$/i, ' 산'], [/\s*shrine$/i, ' 신사'], [/\s*temple$/i, ' 절'],
  /* 지진 자료에 자주 나온다 */
  [/\s*prefecture$/i, '현'], [/\s*region$/i, ' 지방'], [/\s*city$/i, '시'],
];

const JONG = { 'ㄴ': 4, 'ㅅ': 19 };
function batchim(ch, j) {
  const c = ch.charCodeAt(0) - 0xAC00;
  if (c < 0 || c > 11171 || c % 28 !== 0) return ch;
  return String.fromCharCode(0xAC00 + c + (JONG[j] || 0));
}

/** 로마자 한 낱말 → 한글. 못 읽으면 null (지어내지 않는다) */
function word(w) {
  let s = String(w).toLowerCase().replace(/[āīūēōâîûêô]/g, c => LONG[c] || c)
    .replace(/[^a-z']/g, '');
  if (!s) return null;
  const out = []; let i = 0, first = true;
  while (i < s.length) {
    // っ(촉음): 같은 자음이 겹치면 앞 음절에 ㅅ 받침
    if (i + 1 < s.length && s[i] === s[i + 1] && 'kstpgdbz'.includes(s[i])) {
      if (out.length) out[out.length - 1] = batchim(out[out.length - 1], 'ㅅ');
      i++; continue;
    }
    // ん: 뒤가 모음이 아니면 앞 음절 ㄴ 받침
    if (s[i] === 'n' && (i + 1 >= s.length || !'aiueoy'.includes(s[i + 1]))) {
      if (out.length) out[out.length - 1] = batchim(out[out.length - 1], 'ㄴ');
      i++; first = false; continue;
    }
    let hit = null;
    for (const k of SYL) {
      if (s.startsWith(k, i)) {
        const tbl = (k in HEAD) ? (first ? HEAD : MID)
                  : (!first && (k in MID_ONLY)) ? MID_ONLY : BASE;
        hit = tbl[k] ?? BASE[k];
        if (hit == null) return null;
        out.push(hit); i += k.length; first = false; break;
      }
    }
    if (hit === null) return null;      // ⚠️ 모르는 조합 → 통째로 포기
  }
  return out.join('');
}

/** 헵번 로마자/영문 지명 → 한글. 못 읽으면 null */
export function toHangul(en) {
  if (!en) return null;
  let s = String(en).trim();
  /* ⚠️ 지진 자료는 "Aizu,  Fukushima Prefecture" 처럼 쉼표로 이어진다.
     조각마다 따로 옮기고 한국어 어순(큰 곳 → 작은 곳)으로 뒤집는다. */
  const segs = s.split(',').map(x => x.trim()).filter(Boolean);
  if (segs.length > 1) {
    const done = segs.map(x => toHangul(x));
    if (done.some(x => x == null)) return null;
    return done.reverse().join(' ');
  }
  /* ⚠️ 지진 자료의 영문에는 **일본어가 아닌 영어 낱말**이 섞인다.
     "Off Urakawa" · "Amakusa and Ashikita Region" · "Northern Ibaraki".
     이것들은 지명이 아니라 방향·접속사라 **한국어에 정해진 대응이 있다.**
     지어내는 것이 아니므로 여기서 먼저 바꾼다 — 안 그러면 통째로 원문으로 떨어진다. */
  const OFF = s.match(/^off\s+(.+)$/i);
  if (OFF) { const h = toHangul(OFF[1]); return h ? `${h} 앞바다` : null; }
  const AND = s.split(/\s+and\s+/i);
  if (AND.length > 1) {
    const done = AND.map(x => toHangul(x.trim()));
    if (done.some(x => x == null)) return null;
    return done.join('·');
  }
  const DIR = s.match(/^(northern|southern|eastern|western|central|north|south|east|west)\s+(.+)$/i);
  if (DIR) {
    const KR = { northern:'북부', north:'북부', southern:'남부', south:'남부',
                 eastern:'동부', east:'동부', western:'서부', west:'서부', central:'중부' };
    const h = toHangul(DIR[2]);
    return h ? `${h} ${KR[DIR[1].toLowerCase()]}` : null;
  }

  let tail = '';
  for (const [re, kr] of TAIL) {
    const m = s.match(re);
    if (m) { tail = kr; s = s.slice(0, m.index).trim(); break; }
  }
  const parts = s.split(/[\s\-]+/).filter(Boolean);
  const got = [];
  for (const p of parts) {
    const h = word(p);
    if (h == null) return null;         // ⚠️ 하나라도 못 읽으면 전체 포기
    got.push(h);
  }
  const r = (got.join('') + tail).trim();
  return r || null;
}

/**
 * 기기 언어에 맞는 이름을 고른다.
 * @returns {{text:string, mark:'ko'|'tr'|'en'|'ja'}} mark 는 **어디서 왔는지**다.
 *   ko 자료에 있던 한국어 · tr 우리가 옮긴 표기 · en 영문 · ja 일본어 원문
 *   ⚠️ 화면은 mark 를 보고 "표기 변환입니다"를 밝힐 수 있다.
 */
export function jpName(o, lang) {
  const ja = o?.ja ?? o?.n ?? o?.name ?? o?.place ?? null;
  const en = o?.en ?? o?.placeEn ?? o?.romaji ?? null;
  const ko = o?.ko ?? null;
  if (lang === 'ja') return { text: ja || en || '', mark: 'ja' };
  if (lang !== 'ko') return { text: en || ja || '', mark: en ? 'en' : 'ja' };
  if (ko) return { text: ko, mark: 'ko' };
  const tr = toHangul(en);
  if (tr) return { text: tr, mark: 'tr' };
  /* ⚠️ 한국어를 만들 수 없으면 **원문을 그대로 둔다.** 비워 두거나 지어내지 않는다. */
  return { text: ja || en || '', mark: 'ja' };
}
