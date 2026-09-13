// 재난 아이콘 회귀 — 아이콘 시스템 v1.3
//
// 이 파일이 막는 것은 하나다: **메뉴 두 줄이 같은 그림이 되는 것.**
// v1.3 이전에 실제로 그랬다 — 태풍·기상경보·낙뢰가 typhoon 하나를 나눠 쓰고,
// 기온·내일최고·내일최저·열돔이 temperature 하나를 나눠 썼다. 화면은 멀쩡해 보이고
// 누구도 오류를 보지 못한다. 그래서 눈이 아니라 시험이 지켜야 한다.
//
// 브라우저가 필요 없다. 표(earthus-icons.js)와 디스크의 파일만 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const V1_ASSETS = path.join(REPO, 'prototype', 'assets', 'earthus-icons');
// ⚠️ V2 번들의 자산 폴더는 **빌드 산출물이고 저장소가 추적하지 않는다**(tracked 0건, 실측).
//    tools/build-v2-bundle.sh 가 V1 폴더에서 복사한다. 그래서 갓 클론한 트리에는 없다 —
//    "있으면 반드시 같아야 한다"로 검사한다. 없는 것을 통과로 적지 않고, 있는데 다르면 깨진다.
const V2_ASSETS = path.join(REPO, 'prototype', 'v2-deploy', 'assets', 'earthus-icons');
const V2_PRESENT = fs.existsSync(V2_ASSETS);
const SIZES = [24, 32, 64, 128];

const icons = await import('../prototype/js/earthus-icons.js');
const registry = JSON.parse(fs.readFileSync(path.join(V1_ASSETS, 'registry.json'), 'utf8'));
const manifest = JSON.parse(
  fs.readFileSync(path.join(REPO, 'docs', 'icon-system', 'icon-manifest.json'), 'utf8'));

/** V1 재난 묶음 — layerbar.js ALERT_CATEGORIES 의 ids 그대로. */
const HAZARD_LAYERS = ['cyclone', 'quake', 'tsunami', 'wildfire',
                       'alerts', 'lightning', 'regional', 'heatdome'];

/** 지시받은 7종이 읽어야 하는 그림. 이 표가 이 시험의 정답지다. */
const EXPECTED = {
  tsunami: 'tsunami',
  wildfire: 'wildfire',
  alerts: 'weather-alert',
  lightning: 'lightning-strike',
  regional: 'agency-hazard',
  heatdome: 'heat-dome',
};

function assetPath(dir, slug, size) {
  return path.join(dir, `earthus-icon-${slug}-${size}.png`);
}

/** PNG 머리말에서 폭·높이를 읽는다. 파일 이름을 믿지 않는다 — -128 은 실제로 110 이다. */
function pngSize(file) {
  const head = Buffer.alloc(24);
  const fd = fs.openSync(file, 'r');
  try { fs.readSync(fd, head, 0, 24, 0); } finally { fs.closeSync(fd); }
  assert.equal(head.toString('ascii', 1, 4), 'PNG', `${file} 는 PNG 가 아니다`);
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

test('지시받은 7종이 각자 정한 그림을 읽는다', () => {
  for (const [layer, slug] of Object.entries(EXPECTED)) {
    assert.equal(icons.iconForV1Layer(layer), slug, `${layer} 가 ${slug} 를 읽어야 한다`);
  }
  // 실시간(= '지금 일어난 일' 버튼)은 레이어가 아니라 버튼이다. 그림만 확인한다.
  assert.equal(icons.resolveIcon('live-alert'), 'live-alert');
});

test('재난 묶음 여덟 줄이 모두 다른 그림을 쓴다 — 빌려 쓰기 끝', () => {
  const slugs = HAZARD_LAYERS.map((id) => icons.iconForV1Layer(id));
  assert.equal(slugs.filter(Boolean).length, HAZARD_LAYERS.length, '그림이 없는 줄이 있다');
  assert.equal(new Set(slugs).size, HAZARD_LAYERS.length,
    `재난 줄이 그림을 나눠 쓰고 있다: ${JSON.stringify(
      Object.fromEntries(HAZARD_LAYERS.map((id, i) => [id, slugs[i]])))}`);
});

test('typhoon · temperature · storm-surge 는 원래 임자에게 돌아갔다', () => {
  assert.equal(icons.iconForV1Layer('cyclone'), 'typhoon');
  assert.equal(icons.iconForV1Layer('alerts') === 'typhoon', false, '기상경보가 아직 태풍을 빌린다');
  assert.equal(icons.iconForV1Layer('lightning') === 'typhoon', false, '낙뢰가 아직 태풍을 빌린다');
  assert.equal(icons.iconForV1Layer('heatdome') === 'temperature', false, '열돔이 아직 기온을 빌린다');
  assert.equal(icons.iconForV1Layer('regional') === 'storm-surge', false,
    '각국 기관 재해가 아직 해안재해를 빌린다');
  // 원래 임자는 그대로여야 한다 — 빼앗아 오면 저쪽이 빈다
  for (const layer of ['temp', 'tmax', 'tmin']) {
    assert.equal(icons.iconForV1Layer(layer), 'temperature');
  }
});

test('표가 가리키는 그림은 전부 디스크에 있다 — 끊긴 참조 0', () => {
  const referenced = new Set([
    ...Object.values(icons.V1_LAYER_ICON),
    ...Object.values(icons.V2_PHENOMENON_ICON),
    'live-alert',
  ]);
  const missing = [];
  for (const slug of referenced) {
    assert.ok(icons.resolveIcon(slug), `${slug} 가 SHIPPED 에 없다`);
    for (const size of SIZES) {
      for (const dir of V2_PRESENT ? [V1_ASSETS, V2_ASSETS] : [V1_ASSETS]) {
        if (!fs.existsSync(assetPath(dir, slug, size))) {
          missing.push(path.relative(REPO, assetPath(dir, slug, size)));
        }
      }
    }
  }
  assert.deepEqual(missing, [], `없는 파일: ${missing.slice(0, 6).join(', ')}`);
});

test('새로 그린 일곱이 네 크기 모두 있고 기하가 맞는다', () => {
  const drawn = ['live-alert', 'tsunami', 'wildfire', 'weather-alert',
                 'lightning-strike', 'agency-hazard', 'heat-dome'];
  for (const slug of drawn) {
    for (const size of SIZES) {
      const file = assetPath(V1_ASSETS, slug, size);
      assert.ok(fs.existsSync(file), `${path.relative(REPO, file)} 가 없다`);
      const { width, height } = pngSize(file);
      // ⚠️ 이름의 -128 은 거짓이다. 실제 캔버스는 110 이고 기존 44종이 그렇다.
      const expected = size === 128 ? 110 : size;
      assert.equal(width, expected, `${slug}-${size} 폭이 ${width}`);
      assert.equal(height, expected, `${slug}-${size} 높이가 ${height}`);
      assert.ok(fs.statSync(file).size > 200, `${slug}-${size} 가 빈 파일이다`);
    }
  }
});

test('V2 거울이 있다면 바이트까지 같다 — V2 가 옛 그림을 쓰지 않는다', () => {
  if (!V2_PRESENT) {
    // 빌드 전 트리다. 비교할 대상이 없다는 사실 자체를 확인하고 끝낸다(건너뛰지 않는다).
    assert.equal(fs.existsSync(V2_ASSETS), false,
      'V2 자산 폴더가 생겼다 — 이 시험의 전제를 다시 확인할 것');
    return;
  }
  const names = fs.readdirSync(V1_ASSETS).filter((n) => n.endsWith('.png'));
  const differing = [];
  for (const name of names) {
    const other = path.join(V2_ASSETS, name);
    if (!fs.existsSync(other)) { differing.push(`${name} (V2 에 없음)`); continue; }
    if (!fs.readFileSync(path.join(V1_ASSETS, name)).equals(fs.readFileSync(other))) {
      differing.push(`${name} (내용 다름)`);
    }
  }
  assert.deepEqual(differing, [], `어긋난 자산: ${differing.slice(0, 6).join(', ')}`);
});

test('레지스트리와 코드 표가 같은 말을 한다', () => {
  const byMenu = new Map(registry.layer55_mapping.map((r) => [r.menu, r.icon_id]));
  const menus = {
    '쓰나미': 'tsunami', '산불': 'wildfire', '기상경보': 'alerts',
    '낙뢰': 'lightning', '각국 기관 재해': 'regional', '열돔': 'heatdome',
  };
  for (const [menu, layer] of Object.entries(menus)) {
    assert.equal(byMenu.get(menu), icons.iconForV1Layer(layer),
      `${menu}: 레지스트리 ${byMenu.get(menu)} ≠ 코드 ${icons.iconForV1Layer(layer)}`);
  }
  const ids = registry.primary_icons.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, '레지스트리에 중복 id 가 있다');
  for (const id of ids) assert.ok(icons.resolveIcon(id), `레지스트리의 ${id} 에 그림이 없다`);
});

test('숫자 세 곳이 서로 맞는다 — 레지스트리 · 매니페스트 · 코드', () => {
  const shipped = new Set([
    ...Object.values(icons.V1_LAYER_ICON),
    ...Object.values(icons.V2_PHENOMENON_ICON),
  ]);
  assert.ok(shipped.size > 0);
  assert.equal(registry.primary_icons.length, manifest.icon_count,
    '레지스트리 수와 매니페스트 icon_count 가 다르다');
  assert.equal(registry.version, '1.3');
  assert.equal(manifest.version, '1.3');
  // 실제 파일 수로도 확인한다 — 표만 고치고 그림을 안 넣는 일을 막는다
  const pngs = fs.readdirSync(V1_ASSETS).filter((n) => n.endsWith('.png'));
  assert.equal(pngs.length, manifest.icon_count * SIZES.length,
    `PNG ${pngs.length}장 ≠ ${manifest.icon_count}종 × ${SIZES.length}크기`);
});

test('메뉴가 아이콘만으로 말하지 않는다 — 이름표가 남아 있다', () => {
  // 지시서 §3: 라벨 없는 아이콘 전용 내비게이션으로 바꾸지 않는다.
  const bar = fs.readFileSync(path.join(REPO, 'prototype', 'js', 'layerbar.js'), 'utf8');
  assert.match(bar, /alertIcon\.alt = ''/, '아이콘에 alt="" 가 없다(이름이 두 번 읽힌다)');
  assert.match(bar, /ly-open-copy/, '재난 버튼의 글자가 사라졌다');
  assert.match(bar, /alertIcon\.onerror/, '그림을 못 읽을 때의 대비가 없다');
  assert.match(bar, /im\.onerror/, '메뉴 아이콘에 실패 대비가 없다');
  for (const slug of Object.keys(icons.ICON_LABELS)) {
    assert.ok(icons.ICON_LABELS[slug].ko && icons.ICON_LABELS[slug].en,
      `${slug} 이름표가 비었다`);
  }
});

test('재난 버튼의 아이콘 자리가 CSS 에 있다 — 다른 버튼을 밀지 않는다', () => {
  const css = fs.readFileSync(path.join(REPO, 'prototype', 'css', 'app.css'), 'utf8');
  assert.match(css, /\.ly-open--hazard\{[^}]*grid-template-columns:auto minmax\(0,1fr\) auto/);
  assert.match(css, /\.ly-open-icon\{[^}]*width:26px/);
  // `.ly-open` 자체는 두 칸으로 남아 있어야 한다 — `.ly-open--watch` 가 그 모양을 쓴다
  assert.match(css, /\.ly-open\{[^}]*grid-template-columns:minmax\(0,1fr\) auto/);
});
