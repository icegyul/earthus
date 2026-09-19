// 수정 지시서 §4~7 — 지도 직접 클릭 경로의 궁금한 점.
// 감사 Q-01(P1): 탐색 메뉴를 거친 현상에만 질문이 있었고, 사용자의 자연스러운
// 시작점인 지구 클릭(바다·국가)에서는 흐름이 끊겼다. 두 문맥이 모두 질문을
// 갖는지, 실제로 답할 수 있는 것만 실행 버튼인지 잠근다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { SIM_STATUS, COUNTRY_QUESTIONS, questionsForCountry, questionsForPhenomenon } =
  await import('../../prototype/v2-three/js/sim-questions.js');
const src = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');
const shellSrc = src('prototype/v2-three/js/ui-shell.js');
const mainSrc = src('prototype/v2-three/js/main.js');

test('국가 문맥 질문은 3개 이하이고, 실제 답과 정직한 못 답이 섞여 있다', () => {
  assert.ok(COUNTRY_QUESTIONS.length <= 3 && COUNTRY_QUESTIONS.length >= 2);
  const weather = COUNTRY_QUESTIONS.find((q) => q.id === 'country-weather');
  const news = COUNTRY_QUESTIONS.find((q) => q.id === 'country-news');
  const rain = COUNTRY_QUESTIONS.find((q) => q.id === 'country-rain-move');
  assert.equal(weather.status, SIM_STATUS.AVAILABLE);
  assert.equal(news.status, SIM_STATUS.AVAILABLE);
  assert.equal(rain.status, SIM_STATUS.NOT_AVAILABLE, '비 이동은 아직 엔진이 없다 — 이유를 말해야 한다');
  assert.ok(rain.reasonKo && rain.reasonEn);
  for (const q of COUNTRY_QUESTIONS) assert.ok(q.ko && q.en, '질문은 두 언어로 다 있다');
});

test('국가 질문의 실제 액션을 main.js 가 받는다 — 연결이 조용히 끊기지 않는다', () => {
  assert.match(mainSrc, /ds\.sim === 'country-weather'/, 'country-weather 분기가 없다');
  assert.match(mainSrc, /ds\.sim === 'country-news'/, 'country-news 분기가 없다');
  // country-weather 는 클릭한 그 좌표의 실제 지점 실황으로 답한다 — 값을 지어내지 않는 문.
  assert.match(mainSrc, /pointWeather\(countryClick\.lat, countryClick\.lon/);
  // country-news 는 실제 사건 피드로 보낸다.
  assert.match(mainSrc, /ds\.sim === 'country-news'[\s\S]{0,80}showTab\('feed'\)/);
  // 클릭 좌표는 국가를 고른 순간 저장된다.
  assert.match(mainSrc, /countryClick = \{ lat, lon \};/);
});

test('현상 문맥과 지도 문맥이 같은 질문 마크업을 쓴다 — 두 진입이 다른 능력을 보이면 거짓말이다', () => {
  assert.match(shellSrc, /const questionBlock = \(qs\) =>/, '공용 질문 마크업이 없다');
  assert.match(shellSrc, /return questionBlock\(qs\);/, 'simQuestionsHtml 이 공용 마크업을 안 쓴다');
  assert.match(shellSrc, /questionsForCountry\(i18n, \{ hasInput: true \}\)/, '국가 문맥이 레지스트리를 안 탄다');
  assert.match(shellSrc, /questionsForPhenomenon\('ocean\.wave', i18n, \{ hasInput: !!hooks\.hasSeaInput\?\.\(\) \}\)/,
    '바다 문맥 질문이 레지스트리를 안 탄다');
  // 지도 문맥은 현상이 선택되지 않았을 때만 그린다 — 이중 노출은 혼란이다.
  assert.match(shellSrc, /const mapContextQuestions = \(\) => \{\s*\n\s*if \(selectedMenu\) return '';/);
  assert.match(shellSrc, /\$\{mapContextQuestions\(\)\}/, '헤더가 지도 문맥 질문을 그리지 않는다');
});

test('지도 문맥 조건 훅이 main.js 에서 실제 상태를 본다', () => {
  assert.match(mainSrc, /hasSeaPoint: \(\) => !!seaPoint/);
  assert.match(mainSrc, /hasCountryContext: \(\) => !!\(focus\.selected && countryClick\)/);
});

test('바다 문맥 질문은 입력이 있을 때만 실행 버튼이 된다 (§19 validate input)', () => {
  const ko = { ko: true };
  const withSea = questionsForPhenomenon('ocean.wave', ko, { hasInput: true });
  assert.equal(withSea.find((q) => q.id === 'wave-motion').runnable, true);
  const noSea = questionsForPhenomenon('ocean.wave', ko, { hasInput: false });
  assert.equal(noSea.find((q) => q.id === 'wave-motion').runnable, false);
  // 국가 문맥은 컨텍스트 진입이 곧 입력이다 — 화면은 hasInput:true 로만 그린다(ui-shell).
  const country = questionsForCountry(ko, { hasInput: true });
  assert.equal(country.find((q) => q.id === 'country-weather').runnable, true);
  assert.equal(country.find((q) => q.id === 'country-rain-move').runnable, false);
  assert.ok(country.find((q) => q.id === 'country-rain-move').reason.length > 5);
});
