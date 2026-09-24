// 묶음 전체 규칙 — 권한 3개 · 원격 코드 0 · eval 0 · rAF 0 · WebGL 0 · 인라인 스크립트 0 · 링크 주소 · 문구 짝 · 도시 지점 id
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { EXT, fixture, messages } from './helpers.mjs';

const read = (f) => readFileSync(path.join(EXT, f), 'utf8');
const pkgJs = readdirSync(EXT).filter((f) => f.endsWith('.js'));

test('manifest: MV3 · 새 탭 교체 · 권한은 storage·alarms·earthus.net 셋뿐 · 기본 언어 en', () => {
  const m = JSON.parse(read('manifest.json'));
  assert.equal(m.manifest_version, 3);
  assert.equal(m.chrome_url_overrides.newtab, 'newtab.html');
  assert.equal(m.default_locale, 'en');
  assert.deepEqual(m.permissions, ['storage', 'alarms']);
  assert.deepEqual(m.host_permissions, ['https://earthus.net/*']);
  assert.equal(m.optional_permissions, undefined);
  assert.equal(m.content_security_policy, undefined, '기본 CSP(script-src self)를 느슨하게 하지 않는다');
  assert.equal(m.background.service_worker, 'sw.js');
  assert.equal(m.options_page, 'options.html');
  for (const s of ['16', '32', '48', '128']) assert.ok(readFileSync(path.join(EXT, m.icons[s])).length > 50);
});

test('코드: requestAnimationFrame 0 · WebGL 0 · eval/new Function 0 · 원격 import 0', () => {
  for (const f of pkgJs) {
    const src = read(f).replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/requestAnimationFrame/.test(src), `${f}: rAF`);
    assert.ok(!/getContext\(\s*['"](webgl|webgl2|experimental-webgl)/.test(src), `${f}: WebGL`);
    assert.ok(!/\beval\s*\(/.test(src) && !/new\s+Function\s*\(/.test(src), `${f}: eval`);
    assert.ok(!/import\s*(\(|[^;]*from\s*)['"]https?:/.test(src) && !/importScripts\s*\(/.test(src), `${f}: 원격 코드`);
  }
});

test('HTML: 인라인 스크립트 없음 · 원격 스크립트/스타일 없음 · 링크는 같은 탭 earthus.net 과 /Intelligence', () => {
  for (const f of ['newtab.html', 'options.html']) {
    const h = read(f);
    for (const m of h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
      assert.match(m[1], /src="[^"h][^"]*"/, `${f}: 스크립트는 패키지 안 파일만`);
      assert.equal(m[2].trim(), '', `${f}: 인라인 스크립트`);
    }
    assert.ok(!/<link[^>]+href="https?:/.test(h), `${f}: 원격 스타일`);
  }
  const h = read('newtab.html');
  assert.match(h, /id="link-earth" href="https:\/\/earthus\.net\/" target="_self"/);
  assert.match(h, /id="link-v2" href="https:\/\/earthus\.net\/Intelligence" target="_self"/);
  assert.ok(!/<input\b/.test(h), '검색창을 넣지 않는다');
});

test('문구: ko·en 열쇠가 같고, 고정 문구가 지시서 그대로다', () => {
  const ko = messages('ko'), en = messages('en');
  assert.deepEqual(Object.keys(ko).sort(), Object.keys(en).sort());
  assert.equal(ko.safety.message, '대응은 기상청 공식 발표를 따르세요 · 이 화면은 15분 간격으로 받습니다');
  assert.equal(ko.formatChanged.message, '형식 변경 — 지구 전체 보기에서 확인');
  assert.equal(ko.offline.message, '오프라인 — 마지막으로 받은 그림 (관측 $1 KST)');
  assert.equal(ko.linkV2.message, '이 구름은 닷새 뒤 어디에 있을까? → EARTHUS Intelligence');
  assert.equal(ko.pageTitle.message, '새 탭 · 지금 지구 — EARTHUS');
  // Chrome Web Store 한도: manifest description 132자 · name 45자(넘으면 업로드가 거절된다)
  for (const m of [ko, en]) {
    assert.ok(m.extDescription.message.length <= 132, `extDescription ${m.extDescription.message.length}자`);
    assert.ok(m.extName.message.length <= 45);
  }
  // v1 창구 — 예보·확률 어휘는 v2 로 가는 질문 한 줄에만(AGENTS.md: 새 탭은 v1 의 사실 창구)
  for (const [k, v] of Object.entries(ko)) {
    if (k === 'linkV2') continue;
    assert.ok(!/(예보|확률|닷새|전망)/.test(v.message), `${k}: ${v.message}`);
  }
});

test('도시 목록: 모든 지점 id 가 운영 wind/kma-aws.json 에 있고 좌표가 그 지점 좌표다', () => {
  const doc = JSON.parse(read('data/cities.json'));
  const aws = fixture('wind_kma-aws');
  assert.ok(doc.cities.length >= 17);
  assert.ok(doc.cities.some((c) => c.id === doc.defaultCity));
  for (const c of doc.cities) {
    const s = aws.stations.find((x) => x.id === c.stationId);
    assert.ok(s, `${c.ko}: 지점 ${c.stationId} 없음`);
    assert.equal(s.lat, c.lat); assert.equal(s.lon, c.lon);
    assert.ok(String(s.name).startsWith(c.ko), `${c.ko} ≠ ${s.name}`);
  }
});
