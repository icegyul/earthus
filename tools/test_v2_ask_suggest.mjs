// 지시서 H — 지구에 묻기: 자료 부족 답변의 showLayer 제안은 실행하지 않고 "켜기" 버튼으로.
import './v2-test-dom.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
const { AskEarth } = await import('../prototype/v2-three/js/ask-earth.js');

const harness = () => {
  const shown = [];
  const ask = new AskEarth({ lang: 'ko', snapshot: () => ({ layers: [] }), layerName: (id) => ({ 'tc-official': '태풍 공식 트랙', clouds: '구름' }[id] || null),
    tools: { showLayer: (id) => shown.push(id), hideLayer() {}, flyTo() {}, openCard() {} }, captureScene: () => ({}), restoreScene() {} });
  const buttons = [];
  ask.out = { innerHTML: '', querySelector: () => null, querySelectorAll: (sel) => (sel === '[data-ask-show]' ? buttons : []) };
  return { ask, shown, buttons };
};

test('자료 부족 + showLayer 제안 → 실행하지 않고 버튼으로 보여 준다', () => {
  const { ask, shown } = harness();
  ask.render({ answer: '지금 켜진 자료로는 태풍 진로를 말할 수 없습니다.', insufficient: true, actions: [{ tool: 'showLayer', id: 'tc-official' }, { tool: 'showLayer', id: 'nope' }], used: [] });
  assert.deepEqual(shown, []);
  assert.match(ask.out.innerHTML, /이 자료를 켜면 답할 수 있습니다/);
  assert.match(ask.out.innerHTML, /data-ask-show="tc-official"[^>]*>태풍 공식 트랙 켜기/);
  assert.match(ask.out.innerHTML, /버린 제안.*showLayer\(nope\)/);   // 없는 레이어는 여전히 버린다
});

test('자료가 충분하면 showLayer 는 예전처럼 바로 실행한다', () => {
  const { ask, shown } = harness();
  ask.render({ answer: '구름이 남해에 몰려 있습니다.', insufficient: false, actions: [{ tool: 'showLayer', id: 'clouds' }], used: ['clouds'] });
  assert.deepEqual(shown, ['clouds']);
  assert.doesNotMatch(ask.out.innerHTML, /켜면 답할 수 있습니다/);
});

test('켜기 버튼을 누르면 그때 켜고 같은 질문을 다시 묻는다', async () => {
  const { ask, shown, buttons } = harness();
  const btn = { dataset: { askShow: 'tc-official' }, disabled: false, textContent: '' };
  buttons.push(btn);
  ask.lastQ = '태풍 어디로 가?';
  const asked = [];
  ask.ask = async (q) => { asked.push(q); };
  ask.render({ answer: '…', insufficient: true, actions: [{ tool: 'showLayer', id: 'tc-official' }] });
  btn.onclick();
  assert.deepEqual(shown, ['tc-official']);
  assert.equal(btn.disabled, true);
  await new Promise((r) => setTimeout(r, 1600));
  assert.deepEqual(asked, ['태풍 어디로 가?']);
});
