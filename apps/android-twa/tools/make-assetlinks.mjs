#!/usr/bin/env node
// EARTHUS assetlinks.json 만들기 (2026-09-24, 지시서 §3-6 · Phase 1 PD 몫 2·3 · R5)
//
// 무엇: https://earthus.net/.well-known/assetlinks.json 에 올릴 파일을 만든다. 패키지는 net.earthus.app.
// 왜 스크립트인가: 지문을 손으로 옮겨 적다가 하나 빠지면 앱이 주소창 달린 Custom Tab 으로 떨어진다(R5).
//   신규 앱은 Play 가 **하이브리드 서명**에 자동 가입돼 Google 보유 키가 3개다(answer/9842756, 읽음).
//   그래서 Play Console 'App signing' 화면의 Digital Asset Links 스니펫을 **그대로** 넣고, 업로드 키 지문을 더한다.
//
// 쓰는 법:
//   1차(계정 전, ADB 설치본만):
//     node apps/android-twa/tools/make-assetlinks.mjs --fp <업로드 키 SHA-256> --out assetlinks.json
//   2차(Play Console 에 앱을 만든 뒤):
//     node apps/android-twa/tools/make-assetlinks.mjs --snippet play-console-snippet.json --fp <업로드 키 SHA-256> --out assetlinks.json
//   --fp 와 --snippet 은 여러 번 줄 수 있다. 콜론 없는 64자 16진수도 받는다.
//   --snippet 파일이 JSON 이 아니면(복사한 글 등) 안의 SHA-256 모양 문자열을 전부 찾는다.
//
// 이 스크립트는 파일만 만든다. S3 업로드·CloudFront 무효화는 PD 가 한다(README.md '올리기').

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE = 'net.earthus.app';
export const RELATION = 'delegate_permission/common.handle_all_urls';
const FP_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const FP_FIND_RE = /\b(?:[0-9A-Fa-f]{2}:){31}[0-9A-Fa-f]{2}\b/g;

/** 지문 하나를 AA:BB:… 대문자 형식으로. 틀린 모양이면 오류. */
export function normalizeFingerprint(raw) {
  if (typeof raw !== 'string') throw new Error(`지문이 문자열이 아니다: ${raw}`);
  let s = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (/^[0-9A-F]{64}$/.test(s)) {
    s = s.match(/.{2}/g).join(':');
  }
  if (!FP_RE.test(s)) {
    throw new Error(`SHA-256 지문 모양이 아니다(32바이트 AA:BB:…): ${raw}`);
  }
  return s;
}

/**
 * Play Console 스니펫(또는 아무 글)에서 지문을 꺼낸다.
 * JSON 배열이면 android_app 대상만 본다. 다른 패키지 이름이 섞여 있으면 멈춘다(엉뚱한 앱 스니펫을 붙인 사고 방지).
 */
export function fingerprintsFromSnippet(text, pkg = PACKAGE) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = undefined;
  }
  if (parsed !== undefined) {
    const list = Array.isArray(parsed) ? parsed : [parsed];
    const out = [];
    for (const st of list) {
      const t = st && st.target;
      if (!t || t.namespace !== 'android_app') continue;
      if (t.package_name !== pkg) {
        throw new Error(`스니펫의 패키지가 ${t.package_name} 이다 — ${pkg} 스니펫인지 확인`);
      }
      for (const fp of t.sha256_cert_fingerprints || []) out.push(normalizeFingerprint(fp));
    }
    if (out.length === 0) throw new Error('스니펫 JSON 에 android_app 지문이 없다');
    return out;
  }
  const found = (text.match(FP_FIND_RE) || []).map(normalizeFingerprint);
  if (found.length === 0) throw new Error('스니펫 글에서 SHA-256 지문을 찾지 못했다');
  return found;
}

/** assetlinks.json 내용(문자열). 지문은 주어진 순서대로, 중복만 뺀다. */
export function buildAssetLinks(fingerprints, pkg = PACKAGE) {
  const uniq = [];
  for (const fp of fingerprints.map(normalizeFingerprint)) {
    if (!uniq.includes(fp)) uniq.push(fp);
  }
  if (uniq.length === 0) throw new Error('지문이 하나도 없다');
  const statements = [{
    relation: [RELATION],
    target: { namespace: 'android_app', package_name: pkg, sha256_cert_fingerprints: uniq },
  }];
  // Chrome 파서는 엄격하다(끝 쉼표 금지). JSON.stringify 는 끝 쉼표를 만들지 않는다.
  return JSON.stringify(statements, null, 2) + '\n';
}

function parseArgs(argv) {
  const opts = { fps: [], snippets: [], out: null, pkg: PACKAGE };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} 뒤에 값이 없다`);
      return argv[++i];
    };
    if (a === '--fp') opts.fps.push(next());
    else if (a === '--snippet') opts.snippets.push(next());
    else if (a === '--out') opts.out = next();
    else if (a === '--package') opts.pkg = next();
    else if (a === '-h' || a === '--help') opts.help = true;
    else throw new Error(`모르는 인자: ${a}`);
  }
  return opts;
}

export function main(argv) {
  const opts = parseArgs(argv);
  if (opts.help) {
    process.stdout.write('node make-assetlinks.mjs [--snippet <Play Console 스니펫 파일>]... [--fp <SHA-256>]... [--out <파일>]\n');
    return 0;
  }
  const all = [];
  for (const file of opts.snippets) all.push(...fingerprintsFromSnippet(fs.readFileSync(file, 'utf8'), opts.pkg));
  for (const fp of opts.fps) all.push(normalizeFingerprint(fp));
  const json = buildAssetLinks(all, opts.pkg);
  const count = JSON.parse(json)[0].target.sha256_cert_fingerprints.length;
  if (opts.snippets.length === 0) {
    process.stderr.write('알림: Play Console 스니펫 없이 만들었다 — ADB 설치본(업로드 키)만 전체 화면으로 열린다. ' +
      '스토어 설치본은 Console 스니펫(Google 보유 키 3개)을 넣은 2차 파일이 필요하다.\n');
  }
  if (opts.out) {
    fs.writeFileSync(opts.out, json);
    process.stderr.write(`썼다: ${path.resolve(opts.out)} (지문 ${count}개, 패키지 ${opts.pkg})\n`);
  } else {
    process.stdout.write(json);
  }
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`오류: ${e.message}\n`);
    process.exitCode = 1;
  }
}
