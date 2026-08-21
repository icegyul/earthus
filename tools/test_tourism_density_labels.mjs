import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(
  new URL('../prototype/js/tourism-density-labels.js', import.meta.url), 'utf8',
);
const {
  buildTourismLabelCandidates,
  selectNonOverlappingLabels,
} = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function place(id, nameKo, rank, min, max, lat, lon, observedAt) {
  return {
    id,
    nameKo,
    state: 'LIVE',
    position: { lat, lon },
    official: { rank, level: `등급 ${rank}`, populationRange: { min, max } },
    forecast: [],
    provenance: { observedAt },
  };
}

const places = [
  place('jongno-a', '경복궁', 4, 1_200, 1_600, 37.5796, 126.9770, '2026-08-20T06:35:00Z'),
  place('jongno-b', '북촌한옥마을', 2, 300, 500, 37.5826, 126.9830, '2026-08-20T06:30:00Z'),
  place('jung-a', '덕수궁', 3, 700, 900, 37.5658, 126.9751, '2026-08-20T06:34:00Z'),
];
const adminByPlaceId = new Map([
  ['jongno-a', { nameKo: '종로구', regionKo: '서울특별시' }],
  ['jongno-b', { nameKo: '종로구', regionKo: '서울특별시' }],
  ['jung-a', { nameKo: '중구', regionKo: '서울특별시' }],
]);

// 같은 ADM2 이름을 중복 출력하거나 장소 좌표 하나를 구 중심으로 쓰는 회귀를 잡는다.
const labels = buildTourismLabelCandidates(places, adminByPlaceId, {
  lod: 'overview', limit: 10,
});
assert.ok(labels.length >= 1 && labels.length <= 10);
assert.ok(labels.every(label => label.kind === 'district'));
assert.equal(new Set(labels.map(label => label.text)).size, labels.length);
const jongno = labels.find(label => label.text === '종로구');
assert.ok(jongno);
assert.ok(jongno.lat > 37.5796 && jongno.lat < 37.5826, JSON.stringify(jongno));
assert.ok(jongno.lon > 126.9770 && jongno.lon < 126.9830, JSON.stringify(jongno));

// 확대 시 임의 동 이름 대신 공식 관광지명과 polygon에서 찾은 구 이름을 함께 보존한다.
const close = buildTourismLabelCandidates(places, adminByPlaceId, {
  lod: 'detail', limit: 12,
});
assert.ok(close.every(label => label.text.includes(label.placeNameKo)));
assert.ok(close.every(label => /종로구|중구/.test(label.text)));

const fallbackPlace = place(
  'outside-admin', '공식 관광지 이름', 1, 100, 200, 37.55, 126.92, '2026-08-20T06:20:00Z',
);
const fallback = buildTourismLabelCandidates([fallbackPlace], new Map(), {
  lod: 'overview', limit: 10,
});
assert.deepEqual(fallback.map(label => ({ kind: label.kind, text: label.text })), [
  { kind: 'place', text: '공식 관광지 이름' },
]);

// 우선순위가 낮은 겹친 라벨, 화면 밖 라벨, limit 이후 라벨을 실제 선택 결과에서 제거한다.
const candidates = Array.from({ length: 14 }, (_, index) => ({
  id: `label-${index}`,
  text: `후보 ${index}`,
  priority: 100 - index,
}));
const projectedRects = new Map(candidates.map((candidate, index) => [candidate.id, {
  left: index === 1 ? 2 : index * 40,
  top: index === 1 ? 2 : index * 24,
  right: index === 1 ? 32 : index * 40 + 30,
  bottom: index === 1 ? 20 : index * 24 + 18,
  visible: index !== 13,
}]));
// label-1은 label-0과 겹쳐 빠지고, visible=false인 label-13도 빠진다.
const selected = selectNonOverlappingLabels(candidates, projectedRects, 10);
assert.equal(selected.length, 10);
assert.equal(selected[0].id, 'label-0');
assert.ok(!selected.some(label => label.id === 'label-1'));
assert.ok(!selected.some(label => label.id === 'label-13'));

console.log('tourism density labels: PASS');
