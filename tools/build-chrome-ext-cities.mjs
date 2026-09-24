// EARTHUS 새 탭 확장 — '내 장소' 도시 목록(apps/chrome-newtab/data/cities.json) 만들기 (2026-09-24 · 지시서 §4-3 · D6 · D11)
//
// 도시 좌표를 지어내지 않는다: 도시 = 같은 이름의 기상청 지상관측 지점이고, 좌표는 그 지점 좌표를 그대로 쓴다.
//   그래서 '도시와 가장 가까운 기상청 지점' = 그 지점(거리 0). 지점 이름이 도시 이름으로 시작하지 않으면 멈춘다.
// 자료: wind/kma-aws.json. 기본은 저장소에 둔 2026-09-24 운영 사본(tests/fixtures), --live 를 주면 운영 파일을 GET 으로 받는다.
//   (한국 도시만 — D11. 해외는 gts-global 271 KB 설계가 따로 필요하다.)
// 실행: node tools/build-chrome-ext-cities.mjs [--live]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ext = path.join(repo, 'apps/chrome-newtab');
const live = process.argv.includes('--live');
const aws = live
  ? await (await fetch('https://earthus.net/wind/kma-aws.json', { cache: 'no-store' })).json()
  : JSON.parse(readFileSync(path.join(ext, 'tests/fixtures/live-20260924-wind_kma-aws.json'), 'utf8'));

// [id, 한국어, 영어, 기상청 지점 id] — 시·도 대표 도시 + 주요 도시. 지점 id 는 아래에서 운영 파일과 대조한다.
const list = [
  ['seoul', '서울', 'Seoul', '108'], ['busan', '부산', 'Busan', '159'], ['incheon', '인천', 'Incheon', '112'],
  ['daegu', '대구', 'Daegu', '143'], ['daejeon', '대전', 'Daejeon', '133'], ['gwangju', '광주', 'Gwangju', '156'],
  ['ulsan', '울산', 'Ulsan', '152'], ['sejong', '세종', 'Sejong', '239'], ['suwon', '수원', 'Suwon', '119'],
  ['chuncheon', '춘천', 'Chuncheon', '101'], ['gangneung', '강릉', 'Gangneung', '105'], ['wonju', '원주', 'Wonju', '114'],
  ['sokcho', '속초', 'Sokcho', '90'], ['cheongju', '청주', 'Cheongju', '131'], ['chungju', '충주', 'Chungju', '127'],
  ['cheonan', '천안', 'Cheonan', '232'], ['hongseong', '홍성', 'Hongseong', '177'], ['seosan', '서산', 'Seosan', '129'],
  ['jeonju', '전주', 'Jeonju', '146'], ['gunsan', '군산', 'Gunsan', '140'], ['mokpo', '목포', 'Mokpo', '165'],
  ['yeosu', '여수', 'Yeosu', '168'], ['suncheon', '순천', 'Suncheon', '174'], ['pohang', '포항', 'Pohang', '138'],
  ['andong', '안동', 'Andong', '136'], ['gyeongju', '경주', 'Gyeongju', '283'], ['gumi', '구미', 'Gumi', '279'],
  ['changwon', '창원', 'Changwon', '155'], ['jinju', '진주', 'Jinju', '192'], ['gimhae', '김해', 'Gimhae', '253'],
  ['tongyeong', '통영', 'Tongyeong', '162'], ['geoje', '거제', 'Geoje', '294'], ['jeju', '제주', 'Jeju', '184'],
  ['seogwipo', '서귀포', 'Seogwipo', '189'], ['ulleungdo', '울릉도', 'Ulleungdo', '115'], ['baengnyeongdo', '백령도', 'Baengnyeongdo', '102'],
];
const cities = list.map(([id, ko, en, sid]) => {
  const s = aws.stations.find((x) => x.id === sid);
  if (!s) throw new Error('지점 없음 ' + sid);
  if (!String(s.name).startsWith(ko)) throw new Error(`이름 불일치 ${sid} ${s.name} ${ko}`);
  return { id, ko, en, stationId: sid, stationName: s.name, lat: s.lat, lon: s.lon };
});
const doc = {
  schema: 1,
  meaning: '새 탭 \'내 장소\' 목록. 도시 좌표는 지어내지 않고 같은 이름의 기상청 지상관측 지점 좌표를 그대로 쓴다 — 그래서 가장 가까운 지점 = 그 지점(거리 0).',
  source: 'https://earthus.net/wind/kma-aws.json (기상청 지상관측, 공공누리 제1유형)',
  verifiedAgainst: { observedKst: aws.observedKst, generated: aws.generated, stationCount: aws.stations.length },
  defaultCity: 'seoul',
  cities,
};
writeFileSync(path.join(ext, 'data/cities.json'), JSON.stringify(doc, null, 2) + '\n');
console.log(`${cities.length} cities · 지점 대조 ${aws.observedKst} (${live ? '운영 GET' : '저장소 사본'})`);
