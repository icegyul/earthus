// make-assetlinks.mjs 시험 (2026-09-24). 실행: node --test apps/android-twa/tools/make-assetlinks.test.mjs
// 결과 기준: "주어진 지문이 **전부** 한 문장 안에 들어가야 통과" — 하나라도 빠지면 스토어 설치본이 주소창으로 떨어진다(R5).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  normalizeFingerprint, fingerprintsFromSnippet, buildAssetLinks, PACKAGE, RELATION,
} from './make-assetlinks.mjs';

const SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'make-assetlinks.mjs');
// 시험용 가짜 지문(실제 키 아님)
const FP_UPLOAD = '01:23:45:67:89:AB:CD:EF:'.repeat(4).slice(0, -1);
const G1 = 'AA:'.repeat(31) + 'AA';
const G2 = 'BB:'.repeat(31) + 'BB';
const G3 = 'CC:'.repeat(31) + 'CC';

// Play Console App signing 화면이 주는 모양(하이브리드 서명 — Google 보유 키 3개)
const CONSOLE_SNIPPET = JSON.stringify([{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: { namespace: 'android_app', package_name: 'net.earthus.app', sha256_cert_fingerprints: [G1, G2, G3] },
}]);

test('지문 정규화: 소문자·콜론 없음도 받는다', () => {
  assert.equal(normalizeFingerprint(FP_UPLOAD.toLowerCase()), FP_UPLOAD);
  assert.equal(normalizeFingerprint(FP_UPLOAD.replace(/:/g, '')), FP_UPLOAD);
  assert.throws(() => normalizeFingerprint('AB:CD'));
  assert.throws(() => normalizeFingerprint('SHA1-ish 12:34'));
});

test('콘솔 스니펫 3개 + 업로드 키 = 지문 4개가 모두 한 문장에 들어간다', () => {
  const fps = [...fingerprintsFromSnippet(CONSOLE_SNIPPET), FP_UPLOAD];
  const out = JSON.parse(buildAssetLinks(fps));
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].relation, [RELATION]);
  assert.equal(out[0].target.namespace, 'android_app');
  assert.equal(out[0].target.package_name, PACKAGE);
  assert.deepEqual(out[0].target.sha256_cert_fingerprints, [G1, G2, G3, FP_UPLOAD]);
});

test('중복 지문은 한 번만', () => {
  const out = JSON.parse(buildAssetLinks([G1, G1.toLowerCase(), FP_UPLOAD]));
  assert.deepEqual(out[0].target.sha256_cert_fingerprints, [G1, FP_UPLOAD]);
});

test('다른 패키지 스니펫은 거부한다', () => {
  const wrong = CONSOLE_SNIPPET.replace('net.earthus.app', 'com.example.other');
  assert.throws(() => fingerprintsFromSnippet(wrong), /패키지/);
});

test('JSON 이 아닌 복사 글에서도 지문을 찾는다', () => {
  const text = `SHA-256 certificate fingerprint\n${G1}\nUpload key: ${G2.toLowerCase()}\n`;
  assert.deepEqual(fingerprintsFromSnippet(text), [G1, G2]);
});

test('지문이 없으면 파일을 만들지 않는다', () => {
  assert.throws(() => buildAssetLinks([]));
  assert.throws(() => fingerprintsFromSnippet('[]'));
});

test('출력은 엄격 JSON(끝 쉼표 없음)이고 줄 끝이 LF 하나다', () => {
  const s = buildAssetLinks([FP_UPLOAD]);
  assert.doesNotMatch(s, /,\s*[\]}]/);
  assert.doesNotMatch(s, /\r/);
  assert.ok(s.endsWith('}\n]\n'));
});

test('명령줄: --snippet + --fp → --out 파일', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assetlinks-'));
  const snip = path.join(dir, 'snippet.json');
  const out = path.join(dir, 'assetlinks.json');
  fs.writeFileSync(snip, CONSOLE_SNIPPET);
  const r = spawnSync(process.execPath, [SCRIPT, '--snippet', snip, '--fp', FP_UPLOAD, '--out', out], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const parsed = JSON.parse(fs.readFileSync(out, 'utf8'));
  assert.equal(parsed[0].target.sha256_cert_fingerprints.length, 4);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('명령줄: 틀린 지문이면 0 이 아닌 코드로 끝난다', () => {
  const r = spawnSync(process.execPath, [SCRIPT, '--fp', 'nope'], { encoding: 'utf8' });
  assert.notEqual(r.status, 0);
});
