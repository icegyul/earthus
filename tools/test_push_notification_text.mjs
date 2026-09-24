// push-tick 알림 본문 시험 (2026-09-24, 앱 지시서 D5 · Phase 1 기준 6)
//
// 무엇을 시험하나 — 금지가 아니라 결과(AGENTS.md '일하는 법' 2):
//   네 종류 알림(이안류·지진·특보·관광) 본문에 **기관 이름과 HH:MM KST 가 반드시 보여야** 통과.
//   시각을 못 읽으면 지어내지 않고 '시각 정보 없음'이 보여야 통과.
//
// 왜 index.ts 를 통째로 돌리지 않나:
//   index.ts 는 npm:web-push · jsr:@supabase 를 import 하고 Deno.serve 를 부른다 — Node 로는 못 읽는다.
//   그래서 본문 글자만 _shared/push-notification-text.js(의존성 0, 순수 함수)로 떼었고,
//   index.ts 는 그 함수를 부르기만 한다. 그 연결은 아래 '배선' 시험이 소스 글자로 확인한다.
//
// 실행: node --test tools/test_push_notification_text.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const MOD_URL = new URL('../prototype/supabase/functions/_shared/push-notification-text.js', import.meta.url);
const T = await import(MOD_URL);

// 2026-09-24 15:12 KST = 06:12 UTC
const NOW = Date.UTC(2026, 8, 24, 6, 12);
const HHMM_KST = /\b\d{2}:\d{2} KST\b/;
const BAD = /undefined|NaN|null|Invalid/;

test('parseAgencyTime — 자료 파일에 실제로 나오는 네 형식', () => {
  // 기상청 특보 tm_fc — 시간대 표기 없음 = KST
  assert.equal(T.parseAgencyTime('202609241502'), Date.UTC(2026, 8, 24, 6, 2));
  assert.equal(T.parseAgencyTime('20260924150230'), Date.UTC(2026, 8, 24, 6, 2, 30));
  // 이안류 obsrvnDt — KST
  assert.equal(T.parseAgencyTime('2026-08-04 07:55'), Date.UTC(2026, 7, 3, 22, 55));
  // 지진 ISO +09:00 (기상청·JMA)
  assert.equal(T.parseAgencyTime('2026-09-06T19:28:00+09:00'), Date.UTC(2026, 8, 6, 10, 28));
  // 관광 ISO Z + 소수 초
  assert.equal(T.parseAgencyTime('2026-08-20T06:35:00.000Z'), Date.UTC(2026, 7, 20, 6, 35));
  // 없는 날짜·쓰레기
  for (const bad of ['', null, undefined, 'soon', '2026-02-30 10:00', '202613011200', '2026-09-24T25:00:00Z', '2026-09-24T10:00:00+9']) {
    assert.equal(T.parseAgencyTime(bad), null, String(bad));
  }
});

test('formatKst — 같은 날은 HH:MM KST, 다른 날은 M/D 를 붙인다', () => {
  assert.equal(T.formatKst(Date.UTC(2026, 8, 24, 6, 2), NOW), '15:02 KST');
  // 어제 발표된 특보를 오늘 발표로 읽히게 하지 않는다
  assert.equal(T.formatKst(Date.UTC(2026, 8, 23, 6, 2), NOW), '9/23 15:02 KST');
  // UTC 로는 전날이지만 KST 로는 같은 날(00:30 KST)
  assert.equal(T.formatKst(Date.UTC(2026, 8, 23, 15, 30), NOW), '00:30 KST');
  assert.equal(T.formatKst(NaN, NOW), null);
});

test('지진 — 기관(자료의 srcKo)과 HH:MM KST 가 보인다 · 지시서 예시 "일본 기상청 · 12:39 KST"', () => {
  const q = { src: 'JMA', srcKo: '일본 기상청', at: '2026-09-24T12:39:00+09:00', mag: 3.0,
    place: '岐阜県美濃東部', placeEn: 'Eastern Mino, Gifu Prefecture', depthKm: 50 };
  const ko = T.quakeBody({ quake: q, ko: true, now: NOW });
  assert.equal(ko, 'Eastern Mino, Gifu Prefecture · 깊이 50km · 일본 기상청 · 12:39 KST 발생');
  assert.match(ko, /일본 기상청 · 12:39 KST/);
  const en = T.quakeBody({ quake: q, ko: false, now: NOW });
  assert.equal(en, 'Eastern Mino, Gifu Prefecture · depth 50km · JMA · occurred 12:39 KST');

  const kma = { src: 'KMA', srcKo: '기상청', at: '2026-09-24T14:40:12+09:00', place: '경북 경주시 남남서쪽 9km', depthKm: null };
  assert.equal(T.quakeBody({ quake: kma, ko: true, now: NOW }), '경북 경주시 남남서쪽 9km · 기상청 · 14:40 KST 발생');
  assert.equal(T.quakeBody({ quake: kma, ko: false, now: NOW }), '경북 경주시 남남서쪽 9km · KMA · occurred 14:40 KST');
});

test('특보 — "기상청 · 15:02 KST 발표" (지시서 예시 그대로)', () => {
  const w = { issuedKst: '202609241502', kind: '호우', level: '주의보' };
  const ko = T.warnBody({ warn: w, label: '우리집', zoneName: '서울동남권', ko: true, now: NOW });
  assert.equal(ko, '우리집 · 가장 가까운 관측지점 기준 서울동남권. 기상청 · 15:02 KST 발표. 기상청 공식 발표를 확인하세요.');
  const en = T.warnBody({ warn: w, label: 'Home', zoneName: 'Seoul SE', ko: false, now: NOW });
  assert.equal(en, 'Home · Approximate KMA zone: Seoul SE. KMA · issued 15:02 KST. Check the official KMA bulletin.');
  // 어제 발표된, 아직 발효 중인 특보
  const old = T.warnBody({ warn: { issuedKst: '202609231100' }, label: 'a', zoneName: 'b', ko: true, now: NOW });
  assert.match(old, /기상청 · 9\/23 11:00 KST 발표/);
});

test('이안류 — 국립해양조사원 · 관측 시각, 거리 규칙(2km 안 생략)은 그대로', () => {
  const b = { at: '2026-09-24 14:50', grade: '경계', ko: '해운대' };
  const far = T.ripBody({ beach: b, distanceKm: 12.4, label: '부산 숙소', ko: true, now: NOW });
  assert.equal(far, '부산 숙소 에서 12km · 국립해양조사원 · 14:50 KST 관측. 국립해양조사원이 매긴 등급입니다. 들어가도 되는지는 현장 안내를 따르세요.');
  const near = T.ripBody({ beach: b, distanceKm: 0, label: '부산 숙소', ko: true, now: NOW });
  assert.ok(near.startsWith('국립해양조사원 · 14:50 KST 관측.'));
  const en = T.ripBody({ beach: b, distanceKm: 0, label: 'x', ko: false, now: NOW });
  assert.equal(en, 'KHOA · observed 14:50 KST. Graded by KHOA. Follow on-site guidance.');
});

test('관광 — ISO 원문 대신 "서울특별시 · 15:35 KST 관측"', () => {
  const place = { provenance: { observedAt: '2026-09-24T06:35:00.000Z' } };
  const ko = T.tourismBody({ place, ko: true, now: NOW });
  assert.equal(ko, '서울특별시 · 15:35 KST 관측 · 공식 현재 등급. 운영시간·입장 가능·안전을 뜻하지 않습니다.');
  assert.doesNotMatch(ko, /T06:35|\.000Z/);
  const en = T.tourismBody({ place, ko: false, now: NOW });
  assert.equal(en, 'Seoul Metropolitan Government · observed 15:35 KST · official current level. Not an opening, admission or safety decision.');
});

test('네 종류 모두 — 기관 + HH:MM KST 가 있고, undefined·NaN 이 없다', () => {
  const bodies = [
    T.ripBody({ beach: { at: '2026-09-24 14:50' }, distanceKm: 5, label: 'L', ko: true, now: NOW }),
    T.quakeBody({ quake: { src: 'KMA', srcKo: '기상청', at: '2026-09-24T14:40:00+09:00', place: 'P' }, ko: true, now: NOW }),
    T.warnBody({ warn: { issuedKst: '202609241502' }, label: 'L', zoneName: 'Z', ko: true, now: NOW }),
    T.tourismBody({ place: { provenance: { observedAt: '2026-09-24T06:35:00Z' } }, ko: true, now: NOW }),
  ];
  const agencies = ['국립해양조사원', '기상청', '기상청', '서울특별시'];
  bodies.forEach((b, i) => {
    assert.match(b, HHMM_KST, b);
    assert.ok(b.includes(agencies[i]), b);
    assert.doesNotMatch(b, BAD, b);
  });
});

test('시각을 못 읽으면 지어내지 않는다 — 기관은 남기고 "정보 없음"', () => {
  const w = T.warnBody({ warn: { issuedKst: '' }, label: 'L', zoneName: 'Z', ko: true, now: NOW });
  assert.match(w, /기상청 · 발표 시각 정보 없음/);
  assert.doesNotMatch(w, /KST|undefined|NaN/);
  const q = T.quakeBody({ quake: { src: 'JMA', at: 'garbage', place: 'P' }, ko: false, now: NOW });
  assert.equal(q, 'P · JMA · time unavailable');
  const t = T.tourismBody({ place: {}, ko: true, now: NOW });
  assert.match(t, /^서울특별시 · 관측 시각 정보 없음/);
  // 기관 정보가 아예 없는 지진 — 기관을 지어내지 않는다
  const none = T.quakeBody({ quake: { at: '2026-09-24T12:39:00+09:00' }, ko: true, now: NOW });
  assert.equal(none, '기관 정보 없음 · 12:39 KST 발생');
});

test('서버 시간대(TZ)와 무관하다 — 다른 TZ 의 자식 프로세스에서도 같은 글자', () => {
  const code = `import(${JSON.stringify(MOD_URL.href)}).then((T) => { process.stdout.write(
    T.warnBody({ warn: { issuedKst: '202609241502' }, label: 'L', zoneName: 'Z', ko: true, now: ${NOW} })); });`;
  for (const tz of ['UTC', 'America/Los_Angeles', 'Pacific/Kiritimati']) {
    const out = execFileSync(process.execPath, ['--input-type=module', '-e', code], { env: { ...process.env, TZ: tz } }).toString();
    assert.equal(out, 'L · 가장 가까운 관측지점 기준 Z. 기상청 · 15:02 KST 발표. 기상청 공식 발표를 확인하세요.', tz);
  }
});

test('배선 — push-tick/index.ts 가 네 본문을 이 모듈에서 만들고, 중복 방지 열쇠는 그대로다', async () => {
  const src = await readFile(new URL('../prototype/supabase/functions/push-tick/index.ts', import.meta.url), 'utf8');
  assert.match(src, /from '\.\.\/_shared\/push-notification-text\.js'/);
  for (const fn of ['ripBody(', 'quakeBody(', 'warnBody(', 'tourismBody(']) assert.ok(src.includes(fn), fn);
  // key 형식이 바뀌면 alert_claim 이 새 사건으로 보고 이미 보낸 알림을 또 보낸다
  for (const key of ['key: `rip:${b.id}:${b.grade}`', 'key: `quake:${q.src}:${q.at}`',
    'key: `warn:${w.regionId}:${w.kind}:${w.issuedKst}`', 'key: `tourism:${place.code}:rank${rank}:bucket${bucket}`']) {
    assert.ok(src.includes(key), key);
  }
  // 예전 본문(기관·시각 없는 지진)이 남아 있지 않다
  assert.doesNotMatch(src, /body: `\$\{place\}\$\{q\.depthKm/);
  // 공용 모듈은 Deno 전용 import 를 하지 않는다(Node 에서 읽혀야 한다)
  const mod = await readFile(fileURLToPath(MOD_URL), 'utf8');
  assert.doesNotMatch(mod, /^\s*import\s/m);
  assert.doesNotMatch(mod, /\bDeno\.(env|serve|read|args)/);
});
