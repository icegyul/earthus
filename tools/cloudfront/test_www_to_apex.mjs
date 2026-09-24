// www → apex CloudFront Function 시험 (2026-09-24, 앱 지시서 D18)
//
// CloudFront Functions 는 모듈이 아니라 스크립트라 import 할 수 없다.
// 그래서 파일 글자를 vm 상자에서 돌려 최상위 handler 를 꺼낸다(운영과 같은 모양 그대로 시험).
// 실행: node --test tools/cloudfront/test_www_to_apex.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const src = await readFile(new URL('./www-to-apex.js', import.meta.url), 'utf8');
const box = {};
vm.createContext(box);
vm.runInContext(src, box);
const handler = box.handler;

const ev = (host, uri = '/', querystring = {}) => ({
  version: '1.0', context: { eventType: 'viewer-request' }, viewer: { ip: '198.51.100.11' },
  request: { method: 'GET', uri, querystring, headers: host == null ? {} : { host: { value: host } }, cookies: {} },
});

test('스크립트 문법 — export·import 가 없고 handler 가 최상위 함수다', () => {
  assert.equal(typeof handler, 'function');
  assert.doesNotMatch(src, /^\s*(export|import)\s/m);
});

test('www → 301 https://earthus.net + 경로 그대로', () => {
  const r = handler(ev('www.earthus.net', '/v2/'));
  assert.equal(r.statusCode, 301);
  assert.equal(r.headers.location.value, 'https://earthus.net/v2/');
});

test('쿼리 보존 — 순서·빈 값·중복 키(multiValue)·퍼센트 인코딩 원문', () => {
  const r = handler(ev('www.earthus.net', '/', {
    tab: { value: 'my' },
    empty: { value: '' },
    q: { value: 'a%26b' },
    layer: { value: 'clouds', multiValue: [{ value: 'clouds' }, { value: 'wind' }] },
  }));
  assert.equal(r.headers.location.value, 'https://earthus.net/?tab=my&empty=&q=a%26b&layer=clouds&layer=wind');
});

test('대소문자·끝 점 — WWW.EarthUS.net. 도 같은 사이트다', () => {
  assert.equal(handler(ev('WWW.EarthUS.net.', '/Intelligence')).headers.location.value, 'https://earthus.net/Intelligence');
});

test('apex·CloudFront 기본 주소·host 없음 → 그대로 통과(요청 객체를 돌려준다)', () => {
  for (const host of ['earthus.net', 'd111111abcdef8.cloudfront.net', 'wwwearthus.net', 'www.earthus.net.evil.example', null]) {
    const e = ev(host, '/x');
    assert.equal(handler(e), e.request, String(host));
  }
});

test('딥링크 형식 그대로 — /v2/?tab=my&event=… · ?tc= · ?station=', () => {
  assert.equal(handler(ev('www.earthus.net', '/v2/', { tab: { value: 'my' }, event: { value: 'quake-1' } })).headers.location.value,
    'https://earthus.net/v2/?tab=my&event=quake-1');
  assert.equal(handler(ev('www.earthus.net', '/', { tc: { value: 'WP2026' } })).headers.location.value, 'https://earthus.net/?tc=WP2026');
});

test('README 에 싣는 test-event-www.json 을 그대로 넣으면 기대한 Location 이 나온다', async () => {
  const e = JSON.parse(await readFile(new URL('./test-event-www.json', import.meta.url), 'utf8'));
  const r = handler(e);
  assert.equal(r.statusCode, 301);
  assert.equal(r.headers.location.value, 'https://earthus.net/v2/?tab=my&q=a%26b&layer=clouds&layer=wind');
});
