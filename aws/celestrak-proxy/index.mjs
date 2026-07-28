// CelesTrak 프록시 + SATCAT 조인
//
// 왜 필요한가
//   1. CelesTrak 은 rate limit 이 있다. 실측으로 걸렸다 (그룹 응답이 1개로 잘려 돌아옴).
//      사용자 요청이 직접 닿으면 사용자가 늘수록 막힌다.
//   2. SATCAT 은 6.7MB CSV 다. 브라우저가 매번 받으면 안 된다.
//   3. TLE 에는 궤도만 있고 국가·발사일·발사장·크기가 없다. SATCAT 을 NORAD ID 로 조인해야 채워진다.
//
// 동작
//   요청 → S3 캐시가 24시간 이내면 그대로 반환
//        → 아니면 CelesTrak 에서 받아 조인·압축해 S3 에 쓰고 반환
//   EventBridge 가 하루 한 번 깨워서 캐시를 미리 갱신한다 (사용자가 콜드 스타트를 안 맞도록).

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { gzipSync, gunzipSync } from 'node:zlib';

// ⚠️ 버킷 리전을 반드시 명시할 것.
//    S3Client 는 기본으로 Lambda 가 도는 리전(AWS_REGION)을 쓴다.
//    버킷이 다른 리전에 있으면
//    "The bucket you are attempting to access must be addressed using the specified endpoint"
//    오류가 난다. 실제로 버킷이 us-east-2 에 생성돼 이 오류를 맞았다.
const s3 = new S3Client({ region: process.env.CACHE_REGION || process.env.AWS_REGION });
const BUCKET = process.env.CACHE_BUCKET;
const TTL_MS = 24 * 60 * 60 * 1000;
const CELESTRAK = 'https://celestrak.org';

/* 사용자에게 보여줄 그룹 → CelesTrak 그룹명 (satcat.js 와 맞춰둘 것) */
const GROUPS = {
  stations: ['stations'],
  weather:  ['weather', 'noaa', 'goes'],
  science:  ['science'],
  nav:      ['gps-ops', 'galileo', 'beidou'],
  comm:     ['intelsat', 'ses', 'iridium-NEXT'],
  earth:    ['resource', 'planet'],
  military: ['military'],
  amateur:  ['amateur'],
  starlink: ['starlink'],
  all:      ['active'],
};

/* SATCAT 운용 상태 코드 → 사람이 읽는 말 */
const OPS = {
  '+': { ko: '운용 중',        en: 'Operational' },
  '-': { ko: '운용 중지',      en: 'Nonoperational' },
  'P': { ko: '부분 운용',      en: 'Partially operational' },
  'B': { ko: '백업/대기',      en: 'Backup/standby' },
  'S': { ko: '예비',           en: 'Spare' },
  'X': { ko: '확장 임무',      en: 'Extended mission' },
  'D': { ko: '궤도 이탈',      en: 'Decayed' },
  '?': { ko: '알 수 없음',     en: 'Unknown' },
};

/* SATCAT 소유 코드 → 국가명 (자주 나오는 것만) */
const OWNERS = {
  US:'미국', CIS:'러시아', PRC:'중국', ESA:'유럽우주국', FR:'프랑스', JPN:'일본',
  IND:'인도', UK:'영국', GER:'독일', ITSO:'인텔샛', ISS:'국제우주정거장',
  CA:'캐나다', SKOR:'대한민국', NKOR:'북한', IT:'이탈리아', SPN:'스페인',
  LUXE:'룩셈부르크', SES:'SES', ORB:'오브컴', GLOB:'글로벌스타', AB:'아랍샛',
  BRAZ:'브라질', ISRA:'이스라엘', AUS:'호주', TURK:'튀르키예', UAE:'아랍에미리트',
};

/* ── 유틸 ────────────────────────────────────────────────── */
const json = (status, body, extra = {}) => ({
  statusCode: status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',          // 공개 데이터라 전체 허용
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': 'public, max-age=3600',
    ...extra,
  },
  body: JSON.stringify(body),
});

async function fetchText(url) {
  const r = await fetch(url, { headers: { 'User-Agent': 'earthus/0.1 (+contact via app)' } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  const t = await r.text();
  // rate limit 에 걸리면 짧은 안내문이 200 으로 돌아온다. 길이로 걸러낸다.
  if (t.length < 500) throw new Error(`${url} → 응답이 너무 짧음 (rate limit 의심): ${t.slice(0, 120)}`);
  return t;
}

/* ── SATCAT (6.7MB CSV) ──────────────────────────────────── */
async function fetchSatcat() {
  const csv = await fetchText(`${CELESTRAK}/pub/satcat.csv`);
  const lines = csv.split('\n');
  const head = lines[0].split(',').map(s => s.trim());
  const ix = Object.fromEntries(head.map((h, i) => [h, i]));

  const map = {};
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    if (c.length < head.length) continue;
    const norad = c[ix.NORAD_CAT_ID]?.trim();
    if (!norad) continue;
    // 페이로드(위성)만. 로켓 잔해·파편은 제외해서 용량을 줄인다.
    if (c[ix.OBJECT_TYPE]?.trim() !== 'PAY') continue;
    map[norad] = {
      own: c[ix.OWNER]?.trim() || null,
      ld:  c[ix.LAUNCH_DATE]?.trim() || null,
      ls:  c[ix.LAUNCH_SITE]?.trim() || null,
      ops: c[ix.OPS_STATUS_CODE]?.trim() || null,
      rcs: c[ix.RCS]?.trim() ? Number(c[ix.RCS]) : null,   // 레이더 반사면적 ≈ 크기
      dec: c[ix.DECAY_DATE]?.trim() || null,
    };
  }
  return map;
}

/* ── TLE ─────────────────────────────────────────────────── */
async function fetchGroup(name) {
  const txt = await fetchText(`${CELESTRAK}/NORAD/elements/gp.php?GROUP=${name}&FORMAT=tle`);
  const lines = txt.split('\n').map(s => s.trimEnd()).filter(Boolean);
  const out = [];
  for (let i = 0; i + 2 < lines.length; i += 3) {
    const [nm, l1, l2] = [lines[i].trim(), lines[i + 1], lines[i + 2]];
    if (!l1.startsWith('1 ') || !l2.startsWith('2 ')) continue;
    out.push({ n: nm, id: l1.slice(2, 7).trim(), l1, l2 });
  }
  return out;
}

/* ── 조립 ────────────────────────────────────────────────── */
async function build() {
  const satcat = await fetchSatcat();
  const groups = {};

  for (const [key, names] of Object.entries(GROUPS)) {
    const list = [];
    // ⚠️ 중복 제거는 그룹 "안에서만" 한다.
    //    전역으로 하면 먼저 처리된 그룹이 위성을 가져가버려서
    //    'all'(전체) 그룹이 텅 비게 된다. 사용자는 그룹을 골라 받으므로
    //    각 그룹은 그 자체로 완결되어야 한다.
    const seen = new Set();
    for (const n of names) {
      let rows;
      try { rows = await fetchGroup(n); }
      catch (e) { console.warn('[group]', n, e.message); continue; }
      for (const r of rows) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        const s = satcat[r.id];
        list.push({
          n: r.n, id: r.id, l1: r.l1, l2: r.l2,
          ...(s ? {
            own: s.own, ownKo: OWNERS[s.own] || s.own,
            ld: s.ld, ls: s.ls,
            ops: s.ops, opsKo: OPS[s.ops]?.ko || null, opsEn: OPS[s.ops]?.en || null,
            rcs: s.rcs,
          } : {}),
        });
      }
      await new Promise(r => setTimeout(r, 400));   // CelesTrak 에 대한 예의 + rate limit 회피
    }
    groups[key] = list;
  }

  return {
    generated: new Date().toISOString(),
    source: 'CelesTrak GP + SATCAT',
    satcatMatched: Object.keys(satcat).length,
    counts: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, v.length])),
    groups,
  };
}

/* ── S3 캐시 ─────────────────────────────────────────────── */
const KEY = 'celestrak/catalog.json.gz';

async function readCache() {
  try {
    const r = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: KEY }));
    const age = Date.now() - new Date(r.LastModified).getTime();
    const buf = Buffer.from(await r.Body.transformToByteArray());
    return { data: JSON.parse(gunzipSync(buf).toString('utf8')), age };
  } catch (_) { return null; }
}

async function writeCache(data) {
  const gz = gzipSync(Buffer.from(JSON.stringify(data), 'utf8'), { level: 9 });
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: KEY, Body: gz,
    ContentType: 'application/json', ContentEncoding: 'gzip',
    /* ⚠️ 이게 없으면 CloudFront 가 **자기 기본값(하루)** 으로 캐시한다.
       다른 자료 파일은 전부 Cache-Control 을 달고 있는데 이것만 빠져 있었다.
       위성 카탈로그는 몇 시간마다 갱신되므로 하루는 너무 길다.
       원본이 스스로 신선도를 밝히는 것이 옳다 — CDN 설정으로 덮지 않는다. */
    CacheControl: 'public, max-age=3600',
  }));
  return gz.length;
}

/* ── 핸들러 ──────────────────────────────────────────────── */
export const handler = async (event) => {
  const method = event?.requestContext?.http?.method || 'GET';
  if (method === 'OPTIONS') return json(204, null);

  const qs = event?.queryStringParameters || {};
  const isCron = event?.source === 'aws.events';   // EventBridge 예약 실행
  const force = qs.force === '1' || isCron;

  try {
    let cache = await readCache();

    if (force || !cache || cache.age > TTL_MS) {
      console.log('[build] 캐시 갱신 시작', { force, age: cache?.age });
      const data = await build();
      const bytes = await writeCache(data);
      console.log('[build] 완료', { bytes, counts: data.counts });
      cache = { data, age: 0 };
    }

    if (isCron) return { ok: true, counts: cache.data.counts };

    // 특정 그룹만 요청한 경우 그것만 잘라서 반환 (전송량 절약)
    const want = (qs.groups || '').split(',').map(s => s.trim()).filter(Boolean);
    if (want.length) {
      const picked = {};
      for (const g of want) if (cache.data.groups[g]) picked[g] = cache.data.groups[g];
      return json(200, {
        generated: cache.data.generated,
        ageHours: +(cache.age / 3600000).toFixed(1),
        counts: Object.fromEntries(Object.entries(picked).map(([k, v]) => [k, v.length])),
        groups: picked,
      });
    }

    // 그룹 미지정이면 목록과 개수만 (전체를 실수로 받지 않도록)
    return json(200, {
      generated: cache.data.generated,
      ageHours: +(cache.age / 3600000).toFixed(1),
      counts: cache.data.counts,
      hint: '?groups=stations,weather 형식으로 필요한 그룹만 요청하세요',
    });

  } catch (e) {
    console.error('[error]', e);
    // 갱신에 실패해도 오래된 캐시가 있으면 그거라도 준다 (CelesTrak 장애 대비)
    const stale = await readCache();
    if (stale) {
      return json(200, {
        generated: stale.data.generated,
        ageHours: +(stale.age / 3600000).toFixed(1),
        stale: true,
        counts: stale.data.counts,
        groups: stale.data.groups,
      });
    }
    return json(502, { error: e.message });
  }
};
