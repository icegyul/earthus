#!/usr/bin/env node
// EARTHUS 안드로이드 TWA 프로젝트 생성기 (2026-09-24, 지시서 §3-1·§3-2·§3-7 · Phase 1 개발 몫)
//
// 왜 `bubblewrap init` 대신 이 스크립트인가:
//   1) init 은 대화형이다(질문에 손으로 답한다). 같은 입력 → 같은 프로젝트가 나와야 검수할 수 있다.
//   2) Bubblewrap 기본값 셋이 EARTHUS 와 맞지 않는다. 생성 뒤에 이 스크립트가 고친다 — 고친 곳은 아래 '덧입힘' 목록이 전부다.
//      - 적응형 아이콘: 템플릿은 maskable 을 흰 바탕 background 층에 넣는다 → 전경=v5 모노그램, 배경=#0A0A0A 로 바꾼다.
//      - 런처: 템플릿 LauncherActivity 는 src=twa 를 붙이지 않는다 → 모든 진입 URL 에 붙인다(§3-4 신호 1).
//      - App Links: 템플릿은 https://earthus.net/* 전부 → /admin.html·/studio.html·/legal/* 을 뺀다(Android 15+).
//   3) 키스토어를 만들지 않는다. 키는 저장소 밖 %USERPROFILE%\.earthus-android\ 에만 있다(§3-2, R6).
//
// 쓰는 법 (README.md 참고):
//   npm i --prefix "<작업 폴더>" @bubblewrap/core@1.25.0
//   node apps/android-twa/tools/generate-project.mjs --modules "<작업 폴더>/node_modules" --work "<git 무시 폴더>"
//
// 이 스크립트가 쓰는 곳: apps/android-twa/ 안(생성물) + --work 폴더(중간 PNG). 그 밖은 건드리지 않는다.
// 네트워크: https://earthus.net/manifest.webmanifest 를 한 번 읽는다(Bubblewrap 이 res/raw 에 넣는다 — ChromeOS·Quest 용).

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '..');
const REPO = path.resolve(PROJECT, '..', '..');
const LOGO = path.join(REPO, 'prototype', 'logo');
const OVERLAY = path.join(HERE, 'overlay');

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const MODULES = path.resolve(arg('--modules', process.env.BUBBLEWRAP_MODULES ||
  path.join(REPO, 'build', 'app-build', 'android', 'bw', 'node_modules')));
const WORK = path.resolve(arg('--work', path.join(REPO, 'build', 'app-build', 'android', 'gen')));

if (!fs.existsSync(path.join(MODULES, '@bubblewrap', 'core', 'package.json'))) {
  console.error(`@bubblewrap/core 가 없다: ${MODULES}\n` +
    '먼저: npm i --prefix "<작업 폴더>" @bubblewrap/core@1.25.0  그리고 --modules "<작업 폴더>/node_modules"');
  process.exit(2);
}
const coreRequire = createRequire(path.join(MODULES, '@bubblewrap', 'core', 'package.json'));
const { TwaManifest, TwaGenerator, ConsoleLog } = coreRequire('@bubblewrap/core');
const Jimp = coreRequire('jimp');
const { Resvg } = coreRequire('@resvg/resvg-js');
const corePkg = JSON.parse(fs.readFileSync(path.join(MODULES, '@bubblewrap', 'core', 'package.json'), 'utf8'));

// 이 스크립트가 덧입힘을 맞춰 둔 Bubblewrap 판. 다르면 템플릿이 바뀌었을 수 있으니 멈춘다.
const EXPECTED_CORE = '1.25.0';
if (corePkg.version !== EXPECTED_CORE && !process.argv.includes('--allow-other-core')) {
  console.error(`@bubblewrap/core ${corePkg.version} — 이 스크립트는 ${EXPECTED_CORE} 기준이다. ` +
    '템플릿 차이를 확인한 뒤 --allow-other-core 로 돌린다.');
  process.exit(2);
}

// 안전장치: 지우고 쓰는 경로가 전부 apps/android-twa 안인지 확인한다.
function insideProject(p) {
  const rel = path.relative(PROJECT, path.resolve(p));
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`프로젝트 밖 경로를 건드리려 했다: ${p}`);
  }
  return path.resolve(p);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─────────────────────────────── 1. 아이콘 래스터화 (로고는 새로 그리지 않는다)
function readSvg(name) {
  return fs.readFileSync(path.join(LOGO, name), 'utf8');
}
function renderSvg(svg, size) {
  const r = new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: false } });
  return r.render().asPng();
}
function innerOfSvg(svg) {
  const open = svg.indexOf('>', svg.indexOf('<svg'));
  const close = svg.lastIndexOf('</svg>');
  return svg.slice(open + 1, close);
}

fs.mkdirSync(WORK, { recursive: true });
const appiconSvg = readSvg('earthus-appicon.svg');
const monogramSvg = readSvg('earthus-monogram-white.svg');

const localIcons = {
  // 레거시 런처(Android 7 이하)·스플래시: 앱아이콘 원본 그대로(둥근 #0A0A0A 타일 + 모노그램)
  'appicon-512.png': renderSvg(appiconSvg, 512),
  // 알림 작은 아이콘: 흰 모노그램 + 투명 바탕. 상태바는 알파만 쓰므로 바탕이 있으면 꽉 찬 네모가 된다.
  'monogram-white-512.png': renderSvg(monogramSvg, 512),
};
for (const [name, png] of Object.entries(localIcons)) {
  fs.writeFileSync(path.join(WORK, name), png);
}

// Play 고해상 아이콘 512: 꽉 찬 정사각형(모서리 30%·그림자는 Play 가 입힌다, 지시서 §3-6·§3-7).
// earthus-appicon.svg 의 둥근 모서리(rx="27")만 0 으로 둔다 — 획·색·위치는 원본 그대로.
const playSvg = appiconSvg.replace('rx="27"', 'rx="0"');
if (playSvg === appiconSvg) {
  throw new Error('earthus-appicon.svg 에서 rx="27" 을 찾지 못했다 — 로고 파일이 바뀌었는지 확인');
}
const storeDir = insideProject(path.join(PROJECT, 'store'));
fs.mkdirSync(storeDir, { recursive: true });
fs.writeFileSync(path.join(storeDir, 'play-icon-512.png'), renderSvg(playSvg, 512));

// 적응형 전경: 108dp 캔버스. 보이는 영역은 가운데 72dp(런처 마스크), 안전 원은 지름 66dp.
// earthus-appicon.svg 에서 획의 가로 폭은 120 중 62(29→91). 같은 비율을 보이는 72dp 에 맞추면 획 폭 37.2dp.
// 모노그램 SVG 는 120 중 66.6(26.7→93.3) 이므로 모노그램 120 상자를 S = 72×62/66.6 ≈ 67.03dp 로 놓는다.
// 가장 먼 모서리(26.7,98)는 중심에서 약 28.2dp — 안전 원(33dp) 안이다.
const S = (72 * 62) / 66.6;
const OFF = (108 - S) / 2;
const foregroundSvg =
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="108" height="108">` +
  `<svg x="${OFF.toFixed(3)}" y="${OFF.toFixed(3)}" width="${S.toFixed(3)}" height="${S.toFixed(3)}" viewBox="0 0 120 120" fill="none">` +
  innerOfSvg(monogramSvg) + `</svg></svg>`;
const FOREGROUND = [
  ['mipmap-mdpi', 108], ['mipmap-hdpi', 162], ['mipmap-xhdpi', 216],
  ['mipmap-xxhdpi', 324], ['mipmap-xxxhdpi', 432],
];

// ─────────────────────────────── 2. 이전 생성물 지우기 (프로젝트 안, 생성물 목록만)
// (2026-09-24 정정, 적대 검수) Gradle 데몬이 app/build 안 파일을 잡고 있으면 아래 rmSync('app') 가 EBUSY 로 죽는데,
// 그때는 이미 build.gradle·gradlew·settings.gradle 이 지워진 뒤라 프로젝트가 반쯤 사라진 채로 남았다(실측).
// 그래서 버려도 되는 빌드 폴더를 **먼저** 지워 본다. 여기서 막히면 추적 파일은 하나도 건드리지 않고 멈춘다.
for (const dir of ['app/build', 'build', '.gradle']) {
  try {
    fs.rmSync(insideProject(path.join(PROJECT, dir)), { recursive: true, force: true });
  } catch (e) {
    console.error(`${dir} 를 지우지 못했다(${e.code}) — Gradle 데몬이 잡고 있을 수 있다. ` +
      'apps/android-twa 에서 `gradlew.bat --stop` 뒤 다시 돌린다. 생성물은 건드리지 않았다.');
    process.exit(3);
  }
}
const GENERATED = ['settings.gradle', 'gradle.properties', 'build.gradle', 'gradlew', 'gradlew.bat',
  'gradle', 'app', 'store_icon.png'];
for (const entry of GENERATED) {
  fs.rmSync(insideProject(path.join(PROJECT, entry)), { recursive: true, force: true });
}

// ─────────────────────────────── 3. Bubblewrap 생성
const manifestJson = JSON.parse(fs.readFileSync(path.join(PROJECT, 'twa-manifest.json'), 'utf8'));
for (const key of ['iconUrl', 'monochromeIconUrl', 'maskableIconUrl']) {
  const v = manifestJson[key];
  if (typeof v === 'string' && v.startsWith('local:')) {
    manifestJson[key] = path.join(WORK, v.slice('local:'.length));
  }
}
if (manifestJson.maskableIconUrl) {
  throw new Error('maskableIconUrl 을 넣지 말 것 — 적응형 아이콘은 이 스크립트가 쓴다(twa-manifest.json _comment_icons)');
}
if (manifestJson.fallbackType !== 'customtabs') {
  throw new Error('fallbackType 은 customtabs 만 — webview 폴백은 Google 로그인·Play 결제가 안 된다(R10)');
}
if (manifestJson.features && manifestJson.features.playBilling) {
  console.warn('주의: playBilling 이 켜져 있다 — Phase 2(결제)는 2026-09-24 PD 결정으로 보류 중이다.');
}
const twaManifest = new TwaManifest(manifestJson);
const generator = new TwaGenerator();
// fetchIcon 은 HTTP 만 받는다. 로컬 PNG 를 Jimp 로 바로 읽게 바꾼다(아이콘 내용은 같다).
const httpFetchIcon = generator.imageHelper.fetchIcon.bind(generator.imageHelper);
generator.imageHelper.fetchIcon = async (url) => {
  if (/^https?:/i.test(url)) return httpFetchIcon(url);
  return { url, data: await Jimp.read(url) };
};
await generator.createTwaProject(PROJECT, twaManifest, new ConsoleLog('generate'));

// Bubblewrap 1.25.0 의 applyTemplateList 는 파일 쓰기를 기다리지 않고 돌아온다. 다 써질 때까지 본다.
const MUST = [
  'app/build.gradle', 'app/src/main/AndroidManifest.xml', 'app/src/main/res/values/strings.xml',
  'app/src/main/java/net/earthus/app/LauncherActivity.java',
  'app/src/main/java/net/earthus/app/DelegationService.java',
  'app/src/main/java/net/earthus/app/Application.java',
];
for (let i = 0; i < 100; i++) {
  if (MUST.every((f) => {
    const p = path.join(PROJECT, f);
    return fs.existsSync(p) && fs.statSync(p).size > 0;
  })) break;
  await sleep(100);
}
await sleep(500);
for (const f of MUST) {
  if (!fs.existsSync(path.join(PROJECT, f))) throw new Error(`생성물이 없다: ${f}`);
}

// ─────────────────────────────── 4. 덧입힘
function read(rel) { return fs.readFileSync(insideProject(path.join(PROJECT, rel)), 'utf8'); }
function write(rel, text) {
  const p = insideProject(path.join(PROJECT, rel));
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}
function replaceOnce(text, pattern, replacement, what) {
  const matches = text.match(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'));
  if (!matches || matches.length !== 1) {
    throw new Error(`${what}: 바꿀 자리를 정확히 하나 찾지 못했다(${matches ? matches.length : 0}개) — 템플릿이 바뀌었는지 확인`);
  }
  return text.replace(pattern, replacement);
}

// 4-a. 런처: 템플릿 모양을 확인한 뒤 덮는다(방향 코드가 'any' → UNSPECIFIED 그대로인지).
const genLauncher = read('app/src/main/java/net/earthus/app/LauncherActivity.java');
if (!genLauncher.includes('ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED') ||
    !genLauncher.includes('super.getLaunchingUrl()')) {
  throw new Error('템플릿 LauncherActivity 모양이 예상과 다르다 — overlay 를 다시 맞춘다');
}

// 4-b. overlay 폴더를 그대로 덮는다(런처·EntryMarker·단위 시험·적응형 아이콘 XML·배경색).
function copyTree(src, dst) {
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, ent.name);
    const d = insideProject(path.join(dst, ent.name));
    if (ent.isDirectory()) {
      fs.mkdirSync(d, { recursive: true });
      copyTree(s, d);
    } else {
      fs.copyFileSync(s, d);
    }
  }
}
copyTree(OVERLAY, PROJECT);

// 4-c. 적응형 전경 PNG
for (const [dir, px] of FOREGROUND) {
  write(`app/src/main/res/${dir}/ic_launcher_foreground.png`, '');
  fs.writeFileSync(path.join(PROJECT, 'app', 'src', 'main', 'res', dir, 'ic_launcher_foreground.png'),
    renderSvg(foregroundSvg, px));
}

// 4-d. App Links 제외 경로
let manifest = read('app/src/main/AndroidManifest.xml');
manifest = replaceOnce(manifest, /<intent-filter android:autoVerify="true">[\s\S]*?<\/intent-filter>/,
  `<!--
                App Links (EARTHUS 2026-09-24, 지시서 §3-2 · verify-feasibility #23):
                https://earthus.net/* 를 앱이 연다. 단 /admin.html · /studio.html · /legal/* 은 앱이 열지 않는다.
                ⚠️ uri-relative-filter-group 은 Android 15(API 35)+ 에서만 동작한다.
                   Android 14 이하에서는 이 세 경로도 앱으로 온다 → LauncherActivity.launchTwa() 가
                   브라우저 Custom Tab(주소창 있음)으로 돌려 연다. Custom Tab 브라우저가 없을 때만 앱 안에서 열린다.
                마지막 allow="true" 그룹은 '나머지 전부'다. 문서가 '어느 그룹에도 안 맞을 때'를 정하지 않아서 명시한다.
                제외 목록은 EntryMarker.java 의 EXCLUDED_* 와 같다 — 한쪽만 고치지 말 것.
            -->
            <intent-filter android:autoVerify="true">
                <action android:name="android.intent.action.VIEW"/>
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE"/>
                <data android:scheme="https" />
                <data android:host="@string/hostName" />
                <uri-relative-filter-group android:allow="false">
                    <data android:path="/admin.html" />
                </uri-relative-filter-group>
                <uri-relative-filter-group android:allow="false">
                    <data android:path="/studio.html" />
                </uri-relative-filter-group>
                <uri-relative-filter-group android:allow="false">
                    <data android:pathPrefix="/legal/" />
                </uri-relative-filter-group>
                <uri-relative-filter-group android:allow="true">
                    <data android:pathPattern=".*" />
                </uri-relative-filter-group>
            </intent-filter>`,
  'App Links intent-filter');
write('app/src/main/AndroidManifest.xml', manifest);

// 4-e. app/build.gradle — 서명(저장소 밖 키) · 단위 시험 · Phase 2 결제 자리
let gradle = read('app/build.gradle');
gradle = replaceOnce(gradle, /buildTypes \{\s*release \{\s*minifyEnabled true\s*\}\s*\}/,
  `// 서명 (EARTHUS 2026-09-24, 지시서 §3-2 · R6):
    // 키스토어와 비밀번호는 저장소 밖 %USERPROFILE%\\.earthus-android\\ 의 properties 파일에만 있다.
    // 파일 위치는 환경변수 EARTHUS_KEYSTORE_PROPS 로 바꿀 수 있다(기본: 로컬 시험 키 dev-keystore.properties).
    // 파일이 없으면 release 는 서명 없이 만들어진다(설치 불가) — 비밀번호를 이 파일에 적지 말 것.
    def earthusKeyProps = new Properties()
    def earthusKeyFile = file(System.getenv('EARTHUS_KEYSTORE_PROPS') ?:
            "\${System.getProperty('user.home')}/.earthus-android/dev-keystore.properties")
    if (earthusKeyFile.exists()) {
        earthusKeyFile.withInputStream { earthusKeyProps.load(it) }
    }
    signingConfigs {
        if (earthusKeyFile.exists()) {
            release {
                storeFile file(earthusKeyProps['storeFile'])
                storePassword earthusKeyProps['storePassword']
                keyAlias earthusKeyProps['keyAlias']
                keyPassword earthusKeyProps['keyPassword']
            }
        }
    }
    buildTypes {
        release {
            minifyEnabled true
            if (earthusKeyFile.exists()) {
                signingConfig signingConfigs.release
            }
        }
    }`,
  'app/build.gradle buildTypes');
gradle = replaceOnce(gradle, /dependencies \{\s*implementation fileTree\(include: \['\*\.jar'\], dir: 'libs'\)/,
  `dependencies {
    implementation fileTree(include: ['*.jar'], dir: 'libs')
    // TODO(Phase 2 결제 — 구독료 결정 뒤, 2026-09-24 PD 보류): Play 결제는 twa-manifest.json 의
    //   features.playBilling 을 켜고 tools/generate-project.mjs 로 다시 만든다. 그러면 여기에
    //   'com.google.androidbrowserhelper:billing:1.2.0'(billingclient 8.3.0, PBL 8+ 충족)이 붙는다. 손으로 넣지 말 것.
    // 앱 안 표식 규칙(EntryMarker) 단위 시험
    testImplementation 'junit:junit:4.13.2'`,
  'app/build.gradle dependencies');
write('app/build.gradle', gradle);

// 4-e2. 루트 build.gradle — jcenter() 를 mavenCentral() 로 (2026-09-24 적대 검수 추가)
// 템플릿의 jcenter() 는 읽기 전용으로 닫힌 저장소이고, 빌드 로그의 'Gradle 9.0 과 호환되지 않음' 경고의 출처다.
// 이 앱의 의존성(androidbrowserhelper·locationdelegation·AGP)은 google(), junit 은 mavenCentral() 에 있다.
let rootGradle = read('build.gradle');
const jcenterCount = (rootGradle.match(/jcenter\(\)/g) || []).length;
if (jcenterCount !== 2) {
  throw new Error(`루트 build.gradle 의 jcenter() 가 ${jcenterCount}개다(2개 예상) — 템플릿이 바뀌었는지 확인`);
}
rootGradle = rootGradle.replace(/jcenter\(\)/g, 'mavenCentral()');
write('build.gradle', rootGradle);

// 4-f. DelegationService — Phase 2 자리 표시
let delegation = read('app/src/main/java/net/earthus/app/DelegationService.java');
delegation = replaceOnce(delegation, /public class DelegationService extends/,
  `/**
 * 알림·위치 위임 서비스 (Bubblewrap 생성).
 * 지금 붙은 것: 알림 위임(enableNotifications) + 위치 위임(LocationDelegationExtraCommandHandler).
 * TODO(Phase 2 결제 — 구독료 결정 뒤, 2026-09-24 PD 보류): playBilling 을 켜면 생성기가 여기에
 *   DigitalGoodsRequestHandler 를 등록한다(웹의 Digital Goods API → Play 결제). 손으로 넣지 말 것.
 *   삼성 인터넷 기본 기기용 네이티브 Billing 브리지(지시서 §3-1 c)도 Phase 2 몫이다.
 */
public class DelegationService extends`,
  'DelegationService 클래스 선언');
write('app/src/main/java/net/earthus/app/DelegationService.java', delegation);

// 4-g. Bubblewrap 의 store_icon.png(둥근 모서리 앱아이콘)는 쓰지 않는다 — Play 아이콘 정본은 store/play-icon-512.png
fs.rmSync(insideProject(path.join(PROJECT, 'store_icon.png')), { force: true });

// 4-h. 줄 끝: .bat 만 CRLF, 나머지 글 파일은 LF (저장소 규칙)
const TEXT_EXT = new Set(['.gradle', '.java', '.xml', '.json', '.properties', '.md', '.pro', '.mjs', '.txt']);
function normalize(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (['build', '.gradle', 'node_modules'].includes(ent.name)) continue;
      normalize(p);
      continue;
    }
    const ext = path.extname(ent.name);
    if (ent.name === 'gradlew' || TEXT_EXT.has(ext)) {
      const t = fs.readFileSync(p, 'utf8');
      const lf = t.replace(/\r\n/g, '\n');
      if (lf !== t) fs.writeFileSync(p, lf);
    } else if (ext === '.bat') {
      const t = fs.readFileSync(p, 'utf8');
      const crlf = t.replace(/\r?\n/g, '\r\n');
      if (crlf !== t) fs.writeFileSync(p, crlf);
    }
  }
}
normalize(PROJECT);

console.log(`생성 완료: ${PROJECT}`);
console.log(`  Bubblewrap core ${corePkg.version} · 중간 PNG ${WORK}`);
console.log('  다음: README.md 의 "빌드" 절');
