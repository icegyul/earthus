// 알림 '지켜볼 곳' 저장 — 기기 위치가 아니라 지도 가운데를 저장한다 (2026-09-24 PD 결정 · L5 길 B)
//
// 무엇이 잘못돼 있었나: v1 알림 시트의 '＋ 지금 내 위치' 단추(prototype/js/ui-alerts.js 옛 406-415행)가
//   myLocation.locate(true) 로 **기기 측위 좌표**를 받아 push.addSpot → Supabase alert_spots 에 계정과 함께
//   저장했다. 개인위치정보를 우리 시스템으로 보내는 길이라 위치정보법 위치기반서비스사업 신고 대상일 가능성이
//   높았다(docs/PAID-APP-LAUNCH-REVIEW-2026-09-24.md L5). PD 는 신고 대신 그 단추를 빼고 지도 가운데 저장만
//   남기는 길을 골랐다.
//
// 여기서 잠그는 것:
//   ① ui-alerts.js 코드(주석 제외)는 기기 위치를 읽지 않는다 — mylocation·geolocation 참조 0.
//   ② 저장 단추는 '지금 보는 곳 저장' 하나이고, 저장값은 viewCenter() 를 한 번 읽은 center 뿐이다.
//   ③ 저장 전에 무엇이 저장되는지(지도 가운데 좌표 · 기기 위치 아님) 화면과 확인 창이 **말한다**.
//      (2026-09-24 정정 · 검토) '기기 위치 아님'이 아니라 '기기 위치를 읽지 않음 + 지도가 내 위치에 가 있으면
//      그 근처가 저장됨'이다 — 시작 시 자동 이동·'내 위치' 단추 뒤의 지도 가운데는 기기 위치 근처다.
//   ④ alert_spots 에 쓰는 addSpot 호출은 두 곳뿐이고, 기기 위치를 쓰는 파일은 서버에 쓰지 않는다.
//   ⑤ ui-alerts.js 를 부르는 두 import 지정자가 글자까지 같다(다르면 모듈이 둘로 갈라진다).
//
// ⚠️ 이 시험은 소스를 읽는다. 실제 브라우저에서 '기기 위치를 멀리 두고 저장해도 지도 가운데가 저장된다'는
//    확인은 build/legal-fix/ 의 Playwright 점검(폰 크기)로 했다 — npm test 에 브라우저를 넣지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const JS = path.join(REPO, 'prototype', 'js');
const read = (rel) => readFileSync(path.join(JS, rel), 'utf8');

/** 주석을 걷어 낸 코드. 문자열 안의 '//'(URL)는 ui-alerts.js 에 없으므로 단순 제거로 충분하다. */
const code = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n').map((line) => line.replace(/^\s*\/\/.*$/, '')).join('\n');

test('① ui-alerts.js 코드는 기기 위치를 읽지 않는다', () => {
  const c = code(read('ui-alerts.js'));
  for (const bad of ['mylocation', 'myLocation', 'geolocation', 'getCurrentPosition', 'watchPosition', 'locateUser']) {
    assert.ok(!c.includes(bad), `ui-alerts.js 코드에 '${bad}' 가 있다 — 기기 위치를 서버 저장 경로에 다시 들이지 말 것`);
  }
  assert.ok(!c.includes('지금 내 위치'), "'＋ 지금 내 위치' 단추가 다시 생겼다");
  assert.ok(!c.includes('Watch my current location'), "'Watch my current location' 단추가 다시 생겼다");
});

test('② 저장 단추는 지도 가운데 하나이고 저장값은 viewCenter() 를 한 번 읽은 center 다', () => {
  const c = code(read('ui-alerts.js'));
  assert.ok(c.includes("'＋ 지금 보는 곳 저장'"), '한국어 단추 이름');
  assert.ok(c.includes("'＋ Save this map spot'"), '영어 단추 이름');
  assert.equal((c.match(/viewCenter\(\)/g) || []).length, 1, 'viewCenter() 는 렌더에서 한 번만 읽는다(단추·확인·저장값이 같은 좌표)');
  assert.match(c, /const center = viewCenter\(\);/);
  const calls = c.match(/saveAt\([^)]*\)/g) || [];
  assert.deepEqual(calls.filter((s) => s !== 'saveAt(c)' ), ['saveAt(center)'], `saveAt 호출은 saveAt(center) 하나여야 한다: ${calls}`);
  const adds = c.match(/push\.addSpot\(\{[^}]*\}\)/g) || [];
  assert.equal(adds.length, 1);
  assert.match(adds[0], /lat: c\.lat, lon: c\.lon/);
  // 지명은 오프라인 경로만 — deviceCurrent 를 켜면 BigDataCloud 로 좌표가 나간다.
  assert.ok(!/deviceCurrent/.test(c), 'lookupPlace 에 deviceCurrent 를 넘기지 않는다');
});

test('③ 저장 전에 무엇이 저장되는지 말한다(결과 시험 — 말이 나와야 통과)', () => {
  const c = code(read('ui-alerts.js'));
  assert.ok(c.includes('저장될 곳 · 지도 가운데'), '단추 아래 안내: 지도 가운데 좌표');
  assert.ok(c.includes('저장할 곳 · 지금 보는 지도 가운데'), '확인 창: 지도 가운데');
  /* (2026-09-24 정정 · 검토) 처음엔 "기기 위치(GPS)는 저장하지 않습니다"/"기기 위치(GPS)가 아닙니다"를 요구했다.
     main.js 가 시작하자마자 지구를 기기 위치로 돌리고 '내 위치' 단추도 그렇게 하므로, 그 상태의 지도 가운데는
     기기 위치 근처다(폰 점검 0.6km) — 값이 아니라 방식을 말해야 참이다. 방식 문구 + '내 위치 근처가 저장된다'
     고지가 **나와야** 통과하고, 거짓이 될 수 있는 단정 문구는 다시 들어오면 실패한다. */
  assert.ok(c.includes('기기 위치(GPS)를 읽지 않고 지도 가운데 좌표를 저장합니다'), '방식: 기기 위치를 읽지 않는다');
  assert.equal((c.match(/지도가 \\?'내 위치\\?'에 가 있으면/g) || []).length, 2, "단추 아래 안내와 확인 창 둘 다 '내 위치에 가 있으면 그 근처가 저장' 고지");
  assert.ok(c.includes('We do not read your device location (GPS)') && c.includes('coordinates near you are saved'), '영어 안내');
  for (const absolute of ['기기 위치(GPS)는 저장하지 않습니다', '기기 위치(GPS)가 아닙니다', 'This is not your device location', 'Your device location (GPS) is not saved']) {
    assert.ok(!c.includes(absolute), `'${absolute}' 는 지도가 내 위치에 가 있을 때 거짓이다`);
  }
});

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === 'vendor' || name === 'node_modules') continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

test('④ alert_spots 쓰기는 두 곳뿐이고, 기기 위치를 읽는 파일은 서버에 쓰지 않는다', () => {
  const files = walk(JS);
  const adders = files.filter((f) => /push\.addSpot\(/.test(code(readFileSync(f, 'utf8'))))
    .map((f) => path.relative(JS, f).replace(/\\/g, '/')).sort();
  assert.deepEqual(adders, ['ui-alerts.js', 'ui-tourism.js']);
  // 관광 지켜보기는 서울시 관광지(POI)의 고정 좌표를 저장한다 — 기기 위치가 아니다.
  const tourism = code(read('ui-tourism.js'));
  assert.match(tourism, /lat: this\.place\.position\.lat, lon: this\.place\.position\.lon/);

  const deviceReaders = files.filter((f) => {
    const c = code(readFileSync(f, 'utf8'));
    return /mylocation\.js|navigator\.geolocation/.test(c) && !f.endsWith(`${path.sep}mylocation.js`);
  });
  for (const f of deviceReaders) {
    const c = code(readFileSync(f, 'utf8'));
    const rel = path.relative(JS, f).replace(/\\/g, '/');
    /* (2026-09-24 정정 · 검토) 'Supabase 모양' 쓰기만 보면 우리 서버(earthus.net·Lambda)로 가는 POST 나
       좌표를 쿼리에 싣는 GET 을 놓친다 — POST 와 lat/lon 쿼리 주소도 함께 막는다(검토 시점 18개 파일 모두 0건). */
    assert.ok(!/push\.addSpot\(|\.from\('alert_spots'\)|\.insert\(|\.upsert\(|sendBeacon\(|method:\s*['"]POST['"]|[?&](?:lat|latitude)=/.test(c),
      `${rel} 는 기기 위치를 읽으면서 서버에 쓴다 — 좌표가 따라가는지 확인할 것`);
  }
});

test('⑤ ui-alerts.js import 지정자가 모든 importer 에서 같다', () => {
  const specs = new Set();
  for (const rel of ['layerbar.js', 'ui.js']) {
    for (const m of read(rel).matchAll(/import\('(\.\/ui-alerts\.js[^']*)'\)/g)) specs.add(m[1]);
  }
  assert.equal(specs.size, 1, `지정자가 갈렸다: ${[...specs]}`);
});
