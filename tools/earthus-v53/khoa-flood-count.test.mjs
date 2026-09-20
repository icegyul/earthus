// 연안 침수 시군구 수가 한 카드 안에서 어긋나던 것 — 수를 표에서만 세게 잠그는 시험 (2026-09-21).
//
// 무엇이 잘못돼 있었나
//   aws/khoa-coast/handler.py 의 머리말과 색인 note 가 '70곳' 이라고 적었는데 같은 파일의
//   FLOOD_SGG 에는 69개뿐이었다. 운영 색인(tools/earthus-v53/fixtures/khoa-flood-index-20260902.json)
//   도 districts 69 · coveredCount 69 다. 화면은 69곳짜리 자료와 단추 69개를 그리면서
//   그 옆에 "70곳" 을 같이 적고 있었다.
//   ⚠️ 한 곳이 빠진 것인지 70 이 오타인지는 **확인하지 못했다** — 기관 미리보기 화면이
//     열리지 않고(2026-09-21 읽기 GET 실패) 목록을 돌려주는 API 도 없다. 그래서 없는 한 곳을
//     지어내지 않고, 수를 말하는 자리를 전부 len(FLOOD_SGG) 로 옮겼다.
//
// 이 시험이 지키는 것: **note 의 수와 표의 길이는 영원히 같이 움직인다.**
//   수를 글자로 적는 순간 떨어진다 — 시험 자신도 숫자를 박지 않고 파일에서 센다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../../aws/khoa-coast/handler.py', import.meta.url), 'utf8');
const INDEX = JSON.parse(readFileSync(new URL('./fixtures/khoa-flood-index-20260902.json', import.meta.url), 'utf8'));

/** 파이썬 소스에서 한 덩어리를 떼어 온다 (들여쓰기 없는 시작줄 ~ 들여쓰기 없는 닫는줄) */
function block(startRe, endLine) {
  const i = SRC.search(startRe);
  assert.ok(i >= 0, `못 찾음: ${startRe}`);
  const j = SRC.indexOf(`\n${endLine}`, i);
  assert.ok(j > i, `끝을 못 찾음: ${endLine}`);
  return SRC.slice(i, j + endLine.length + 1);
}

const floodTable = block(/^FLOOD_SGG = \{/m, '}');
const codes = [...floodTable.matchAll(/"(\d{5})":/g)].map((m) => m[1]);
const noteFn = block(/^def flood_index_note\(\):/m, '\n');

test('시군구 표는 코드가 겹치지 않는다 — 겹치면 dict 가 조용히 하나를 삼킨다', () => {
  assert.ok(codes.length > 0, '표를 못 읽었다 — 아래 시험이 전부 공허해진다');
  assert.equal(new Set(codes).size, codes.length,
    `겹친 코드: ${codes.filter((c, i) => codes.indexOf(c) !== i).join(', ')}`);
});

test('운영 색인의 시군구 수가 표의 길이와 같다 — 어느 쪽도 상대를 앞서지 않는다', () => {
  assert.equal(INDEX.districts.length, codes.length,
    '2026-09-02 운영 색인과 지금 표의 길이가 다르다 — 표가 바뀌었다면 색인 픽스처도 다시 받아야 한다');
});

test('색인 note 는 수를 글자로 적지 않고 표에서 센다', () => {
  assert.match(noteFn, /\{len\(FLOOD_SGG\)\}곳/,
    'note 가 len(FLOOD_SGG) 에서 세지 않는다 — 표를 고치면 또 어긋난다');
  assert.doesNotMatch(noteFn, /\d+\s*곳/,
    'note 에 수가 글자로 박혀 있다');
});

test('색인을 올리는 자리가 그 함수를 쓴다 — 문장을 두 벌로 두지 않는다', () => {
  const put = block(/^ {4}_put\("ocean\/khoa\/flood-index\.json"/m, '    })');
  assert.match(put, /"note":\s*flood_index_note\(\)/, '색인이 다른 문장을 싣고 있다');
});

test('침수 자료를 말하는 주석·독스트링 어디에도 시군구 **총수**가 글자로 없다', () => {
  // '10곳씩 나눠 부른다' 는 한 번에 부르는 묶음 크기지 표의 크기가 아니다 — 그래서 '곳씩' 은 뺀다.
  // 뺄 것을 이 한 곳에만 적어 둔다: 총수를 말하는 자리에 숫자가 다시 들어오면 떨어진다.
  const TOTAL_IN_WORDS = /\b\d+\s*곳(?!씩)/g;
  const head = block(/^# ■ 시군구코드는 API 로 못 얻는다/m, '# ═══════════════════════════════════════════════════════════════════');
  const collect = block(/^def collect_flood\(codes=None\):/m, '\n');
  for (const [name, text] of [['머리말', head], ['collect_flood', collect], ['flood_index_note', noteFn]]) {
    const hits = [...text.matchAll(TOTAL_IN_WORDS)].map((m) => m[0]);
    assert.deepEqual(hits, [], `${name} 에 총수가 글자로 남아 있다: ${hits.join(', ')}`);
  }
});

test("표가 기관 목록의 전부라고 단정하지 않는다 — 확인하지 못한 것은 모른다고 적는다", () => {
  assert.match(noteFn, /확인하지 못했습니다/,
    '이 목록이 기관 서비스의 전부인지 확인하지 못했다는 사실이 화면에 없다');
  // 자료가 없는 곳과 위험이 없는 곳을 가르는 문장은 그대로 남아 있어야 한다(확인된 사실이다).
  assert.match(noteFn, /자료가 없는 것이지/);
});
